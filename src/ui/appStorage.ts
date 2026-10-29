import { createArtifactDbStorage, type ArtifactDb } from "../storage/artifactDbStorage";
import { createIndexedDbStorage } from "../storage/indexedDbStorage";
import type { Storage } from "../storage/storage";

/** Where this copy keeps its data: the Artifact database, or this browser's IndexedDB, by choice or because the database is unavailable. */
export type StorageMode = "artifact" | "local" | "artifactUnavailable";

// claude.ai's runtime, present only inside claude.ai; its claude.d.ts is authoritative. It carries only `use`.
type ClaudeRuntime = {
  use(name: "db"): Promise<ArtifactDb | null>;
  use(name: "user"): Promise<{ id(): Promise<string | null> } | null>;
};

async function choose(): Promise<{ mode: StorageMode; storage: Storage }> {
  const claude = (window as { claude?: ClaudeRuntime }).claude;
  if (typeof claude?.use !== "function") return { mode: "local", storage: createIndexedDbStorage() };
  // Each resolves null when unavailable: signed out, not granted, or no answer within about 10 s.
  const [db, user] = await Promise.all([claude.use("db"), claude.use("user")]);
  const userId = await user?.id();
  if (db && userId) return { mode: "artifact", storage: createArtifactDbStorage(db, userId) };
  return { mode: "artifactUnavailable", storage: createIndexedDbStorage() };
}

const chosen = choose();
export const storageMode: Promise<StorageMode> = chosen.then((c) => c.mode);

// Callers use one Storage from the first render; each call waits until the adapter is chosen.
const ready = chosen.then((c) => c.storage);
export const storage: Storage = {
  get: async (collection, id) => (await ready).get(collection, id),
  set: async (collection, doc) => (await ready).set(collection, doc),
  add: async (collection, doc) => (await ready).add(collection, doc),
  delete: async (collection, id) => (await ready).delete(collection, id),
  query: async (collection, where) => (await ready).query(collection, where),
};
