import { assertDeletable, type Storage, type Where } from "./storage";

// The parts of claude.ai's `db` namespace this adapter uses; the runtime's db.d.ts is authoritative.
export type ArtifactDbDocument = { id: string; exists: boolean; data(): Record<string, unknown> | undefined };
export type ArtifactDbQuery = {
  where(field: string, op: string, value: unknown): ArtifactDbQuery;
  orderBy(field: string, dir?: "asc" | "desc"): ArtifactDbQuery;
  limit(n: number): ArtifactDbQuery;
  get(): Promise<{ docs: ArtifactDbDocument[]; size: number }>;
};
export type ArtifactDbRef = {
  get(): Promise<ArtifactDbDocument>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
  acquire(options: { holder: string; ttlMs?: number }): Promise<{ acquired: boolean }>;
};
export type ArtifactDb = {
  doc(path: string): ArtifactDbRef;
  collection(path: string): ArtifactDbQuery & { doc(id: string): ArtifactDbRef };
};

/** The platform asks for one retry after a short randomized delay when it is briefly unavailable. */
async function retryOnce<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if ((e as { code?: string }).code !== "unavailable") throw e;
    await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 800));
    return call();
  }
}

/** Snapshots are frozen; callers get their own copy, as with IndexedDB's structured clone. */
function body<T>(snap: ArtifactDbDocument): T | undefined {
  const data = snap.exists ? snap.data() : undefined;
  // A lease taken by `add` on a missing document can leave an empty body behind; it holds no document.
  return data && "id" in data ? (structuredClone(data) as T) : undefined;
}

/** Bodies are plain JSON: fields left undefined are dropped, as JSON.stringify drops them. */
const json = (doc: unknown) => JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;

/**
 * Every collection lives under the viewer's private subtree, `data/users/<id>/pencilmark/<collection>/<doc id>`,
 * which the platform keeps from everyone else, the artifact's owner included.
 * A query is read page by page, ordered by id; 1000 is the platform's largest page.
 */
export function createArtifactDbStorage(db: ArtifactDb, userId: string, { pageSize = 1000 } = {}): Storage {
  const collection = (name: string) => db.collection(`data/users/${userId}/pencilmark/${name}`);
  const holder = crypto.randomUUID();

  return {
    async get(name, id) {
      return body(await retryOnce(() => collection(name).doc(id).get()));
    },
    async set(name, doc) {
      await retryOnce(() => collection(name).doc(doc.id).set(json(doc)));
    },
    async add(name, doc) {
      // The platform has no create-if-absent write: a short lease keeps two writers from both finding the id free.
      const ref = collection(name).doc(doc.id);
      const { acquired } = await retryOnce(() => ref.acquire({ holder, ttlMs: 5000 }));
      if (!acquired || body(await retryOnce(() => ref.get())) !== undefined) throw new Error(`${name}/${doc.id} already exists`);
      await retryOnce(() => ref.set(json(doc)));
    },
    async delete(name, id) {
      assertDeletable(name);
      await retryOnce(() => collection(name).doc(id).delete());
    },
    async query(name, where?: Where) {
      const filtered = Object.entries(where ?? {}).reduce<ArtifactDbQuery>((q, [field, value]) => q.where(field, "==", value), collection(name));
      const found: never[] = [];
      for (let after: string | undefined; ; ) {
        const page = after === undefined ? filtered : filtered.where("id", ">", after);
        const { docs, size } = await retryOnce(() => page.orderBy("id").limit(pageSize).get());
        for (const snap of docs) {
          const doc = body<never>(snap);
          if (doc) found.push(doc);
        }
        if (size < pageSize) return found;
        after = docs.at(-1)!.id;
      }
    },
  };
}
