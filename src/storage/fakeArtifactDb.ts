import type { ArtifactDb, ArtifactDbDocument, ArtifactDbQuery } from "./artifactDbStorage";

// A stand-in for claude.ai's `db` namespace, for the Storage contract tests. It follows the
// platform's type definitions (db.d.ts) where PencilMark depends on them: the path grammar,
// plain-JSON bodies of at most 256 KiB, frozen snapshots, no create-if-absent write, and
// a viewer's own `data/users/<id>/` subtree being the only place this viewer may touch.

const MAX_DOC_BYTES = 256 * 1024;
const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;

type Stored = { body: Record<string, unknown>; lease?: { holder: string; expiresAt: number } };

function dbError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

function segments(path: string, parity: "doc" | "collection"): string[] {
  const parts = path.split("/");
  if (parts.some((p) => !SEGMENT.test(p) || p === "." || p === "..")) throw new TypeError(`Bad path segment in ${path}`);
  if ((parts.length % 2 === 0) !== (parity === "doc")) throw new TypeError(`${path} has ${parts.length} segments`);
  return parts;
}

export function createFakeArtifactDb(viewerId: string, now: () => number = Date.now) {
  const docs = new Map<string, Stored>();
  const own = `data/users/${viewerId}/`;
  const check = (path: string) => {
    if (!path.startsWith(own)) throw dbError("invalid_argument", `${path} is outside this viewer's private subtree`);
  };
  const snapshot = (path: string): ArtifactDbDocument => {
    const stored = docs.get(path);
    const body = stored && Object.freeze(structuredClone(stored.body));
    return { id: path.split("/").at(-1)!, exists: stored !== undefined, data: () => body };
  };
  const writeBody = (data: Record<string, unknown>) => {
    const json = JSON.stringify(data);
    if (new TextEncoder().encode(json).length > MAX_DOC_BYTES) throw dbError("invalid_argument", "Document over 256 KiB");
    return JSON.parse(json) as Record<string, unknown>;
  };

  const doc = (path: string) => {
    segments(path, "doc");
    return {
      async get() {
        check(path);
        return snapshot(path);
      },
      async set(data: Record<string, unknown>) {
        check(path);
        docs.set(path, { ...docs.get(path), body: writeBody(data) });
      },
      async delete() {
        check(path);
        docs.delete(path);
      },
      async acquire({ holder, ttlMs = 30_000 }: { holder: string; ttlMs?: number }) {
        check(path);
        const stored = docs.get(path) ?? { body: {} };
        if (stored.lease && stored.lease.expiresAt > now() && stored.lease.holder !== holder) return { acquired: false };
        docs.set(path, { ...stored, lease: { holder, expiresAt: now() + ttlMs } });
        return { acquired: true, holder };
      },
    };
  };

  const query = (path: string, filters: [string, unknown][], order?: string, max?: number): ArtifactDbQuery => ({
    where(field, op, value) {
      if (op !== "==" && op !== ">") throw new Error(`The fake supports only == and >, not ${op}`);
      return query(path, [...filters, [`${op}${field}`, value]], order, max);
    },
    orderBy(field) {
      return query(path, filters, field, max);
    },
    limit(n) {
      if (n < 1 || n > 1000) throw dbError("invalid_argument", "limit must be 1-1000");
      return query(path, filters, order, n);
    },
    async get() {
      check(`${path}/`);
      const prefix = `${path}/`;
      let found = [...docs.keys()]
        .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .sort()
        .map(snapshot)
        .filter((snap) =>
          filters.every(([key, value]) => {
            const field = snap.data()![key.slice(key.startsWith("==") ? 2 : 1)] as never;
            return key.startsWith("==") ? field === value : field > (value as never);
          }),
        );
      if (order) found = found.sort((a, b) => (String(a.data()![order]) < String(b.data()![order]) ? -1 : 1));
      if (max) found = found.slice(0, max);
      return { docs: found, size: found.length };
    },
  });

  const db: ArtifactDb = {
    doc,
    collection(path) {
      segments(path, "collection");
      return Object.assign(query(path, []), { doc: (id: string) => doc(`${path}/${id}`) });
    },
  };
  return { db, docs };
}
