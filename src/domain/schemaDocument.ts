import { FLAGS, type Flag } from "./types";
import type { Storage } from "../storage/storage";
import { DEFAULT_PREFERENCES, SCHEMA_VERSION } from "./settings";

// The `meta/schema` document: what an AI reading the database needs to know (issue #1, Data model; schema/README.md).

export type FlagType = {
  id: Flag;
  /** English, for AI readers; the interface shows its own translation. */
  name: string;
  colour: string;
  /** "question" for a Flag; Item flags arrive with issue #12. */
  level: "question" | "item";
  /** A retired type stays in the table with this set; it is never deleted. */
  deprecated?: true;
};

/** Keyed by Flag, so every Flag has exactly one entry. */
export const FLAG_TYPE: Record<Flag, Omit<FlagType, "id">> = {
  concept: { name: "concept confusion", colour: "#7b1fa2", level: "question" },
  careless: { name: "careless", colour: "#ef6c00", level: "question" },
  focus: { name: "focus", colour: "#1565c0", level: "question" },
  memory: { name: "memory", colour: "#2e7d32", level: "question" },
  bad_question: { name: "bad question", colour: "#c62828", level: "question" },
};

export const FLAG_TYPES: FlagType[] = FLAGS.map((id) => ({ id, ...FLAG_TYPE[id] }));

export type SchemaDocument = {
  id: "schema";
  schemaVersion: number;
  flagTypes: FlagType[];
  timingDefaults: { idleThresholdMs: number; flickThresholdMs: number };
  conventions: string[];
  source: "user";
  updatedAt: number;
};

const CONVENTIONS = [
  "Every document carries source (\"user\" or \"ai\"), model (AI writes only) and updatedAt. An AI writing a document sets source to \"ai\" and model to its model name. These fields are kept by convention and are not proof of who wrote a document.",
  "IDs are a type prefix, a date and random characters, assigned by the tool. They never encode categories and never change. Never invent or reuse IDs.",
  "Times are milliseconds. Wall-clock times are UTC epoch milliseconds.",
  "rawLogChunks are sealed: never write, change or delete one. Everything about a Session is derived from them.",
  "derivations and attempts are computed by the tool from the Raw log. Every computation adds a new derivation; earlier ones are never overwritten. Read the one named by the Session's currentDerivationId.",
  "overrides hold the user's corrections to derived values. The final value is the Override where one exists, otherwise the derived value.",
  "A Question with Attempts is never deleted, only deprecated. A change to what is shown while answering, or to how it is graded, is a new revision.",
];

export function schemaDocument(updatedAt: number): SchemaDocument {
  const { idleThresholdMs, flickThresholdMs } = DEFAULT_PREFERENCES.rules;
  return { id: "schema", schemaVersion: SCHEMA_VERSION, flagTypes: FLAG_TYPES, timingDefaults: { idleThresholdMs, flickThresholdMs }, conventions: CONVENTIONS, source: "user", updatedAt };
}

/** Writes `meta/schema` when it is missing or out of date; an unchanged document keeps its `updatedAt`. */
export async function writeSchemaDocument(storage: Storage, now = Date.now()): Promise<void> {
  const current = await storage.get<SchemaDocument>("meta", "schema");
  const next = schemaDocument(current?.updatedAt ?? now);
  if (current && JSON.stringify(current) === JSON.stringify(next)) return;
  await storage.set("meta", { ...next, updatedAt: now });
}
