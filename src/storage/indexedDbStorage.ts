import { assertDeletable, matches, type Storage } from "./storage";

const STORE = "documents";

type Row = { collection: string; id: string; doc: unknown };

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function open(name: string): Promise<IDBDatabase> {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => {
    const store = req.result.createObjectStore(STORE, { keyPath: ["collection", "id"] });
    store.createIndex("collection", "collection");
  };
  return request(req);
}

/** One object store keyed by [collection, id], so new collections need no schema upgrade. */
export function createIndexedDbStorage(name = "pencilmark"): Storage {
  if (!name.startsWith("pencilmark")) throw new Error(`IndexedDB name must be prefixed "pencilmark": ${name}`);
  const db = open(name);
  const store = async (mode: IDBTransactionMode) => (await db).transaction(STORE, mode).objectStore(STORE);

  return {
    async get(collection, id) {
      const row = (await request((await store("readonly")).get([collection, id]))) as Row | undefined;
      return row?.doc as never;
    },
    async set(collection, doc) {
      const row: Row = { collection, id: doc.id, doc };
      await request((await store("readwrite")).put(row));
    },
    async add(collection, doc) {
      const row: Row = { collection, id: doc.id, doc };
      await request((await store("readwrite")).add(row));
    },
    async delete(collection, id) {
      assertDeletable(collection);
      await request((await store("readwrite")).delete([collection, id]));
    },
    async query(collection, where) {
      const rows = (await request((await store("readonly")).index("collection").getAll(collection))) as Row[];
      return rows.map((row) => row.doc).filter((doc) => matches(doc, where)) as never[];
    },
  };
}
