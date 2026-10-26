// The only way core code reads or writes persistent data (ADR-0005).
// Documents are grouped into collections and addressed by id.

export type Where = Record<string, string | number | boolean>;

export interface Storage {
  get<T>(collection: string, id: string): Promise<T | undefined>;
  set<T extends { id: string }>(collection: string, doc: T): Promise<void>;
  /** Writes a new document; rejects if one with the same id already exists. */
  add<T extends { id: string }>(collection: string, doc: T): Promise<void>;
  /** All documents in a collection whose top-level fields equal every value in `where`. */
  query<T>(collection: string, where?: Where): Promise<T[]>;
}

export function matches(doc: unknown, where: Where | undefined): boolean {
  if (!where) return true;
  const record = doc as Record<string, unknown>;
  return Object.entries(where).every(([key, value]) => record[key] === value);
}
