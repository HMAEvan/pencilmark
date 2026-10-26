import { matches, type Storage } from "./storage";

export function createMemoryStorage(): Storage {
  const collections = new Map<string, Map<string, unknown>>();
  const collection = (name: string) => {
    let docs = collections.get(name);
    if (!docs) collections.set(name, (docs = new Map()));
    return docs;
  };
  // Copies keep callers from mutating stored documents, as with IndexedDB's structured clone.
  return {
    async get(name, id) {
      const doc = collection(name).get(id);
      return doc === undefined ? undefined : structuredClone(doc as never);
    },
    async set(name, doc) {
      collection(name).set(doc.id, structuredClone(doc));
    },
    async add(name, doc) {
      if (collection(name).has(doc.id)) throw new Error(`${name}/${doc.id} already exists`);
      collection(name).set(doc.id, structuredClone(doc));
    },
    async delete(name, id) {
      collection(name).delete(id);
    },
    async query(name, where) {
      return [...collection(name).values()].filter((doc) => matches(doc, where)).map((doc) => structuredClone(doc as never));
    },
  };
}
