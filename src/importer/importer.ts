import type { Batch, ContentBlock, Option, Question, QuestionSet } from "../domain/types";
import { newId } from "../domain/ids";
import type { Storage } from "../storage/storage";

// A Question pack carries pack-local labels only; real IDs are assigned on commit (ADR-0003).
export type PackQuestion = {
  label: string;
  type: string;
  stem: ContentBlock[];
  options: (Omit<Option, "rationale"> & { rationale?: ContentBlock[] })[];
  optionOrder?: "shuffle" | "fixed";
  answer: string[];
  explanation?: ContentBlock[];
  tags?: string[];
};

export type QuestionPack = {
  kind: "question_pack";
  schemaVersion: 1;
  batch: { title: string; model?: string; material?: string };
  questions: PackQuestion[];
};

/** A located validation error. `message` is English, written for the AI that produced the pack. */
export type PackError = { question?: string; field: string; message: string };

export type ParseResult = { ok: true; pack: QuestionPack } | { ok: false; errors: PackError[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isBlocks = (v: unknown): v is ContentBlock[] =>
  Array.isArray(v) && v.every((b) => isRecord(b) && b.type === "text" && typeof b.text === "string");

// Minimal hand-written checks for the tracer bullet; JSON Schema validation replaces this in issue #6.
function validateQuestion(q: unknown, index: number, errors: PackError[]) {
  const label = isRecord(q) && typeof q.label === "string" ? q.label : `#${index + 1}`;
  const fail = (field: string, message: string) => errors.push({ question: label, field, message });
  if (!isRecord(q)) return fail("", "must be an object");
  if (typeof q.label !== "string") fail("label", "must be a string such as \"q1\"");
  if (q.type !== "single_answer") fail("type", "must be \"single_answer\"");
  if (!isBlocks(q.stem)) fail("stem", "must be a list of text blocks");
  if (q.explanation !== undefined && !isBlocks(q.explanation)) fail("explanation", "must be a list of text blocks");

  const options = Array.isArray(q.options) ? q.options : undefined;
  if (!options || options.length < 2) return fail("options", "must list at least two Options");
  options.forEach((o, i) => {
    if (!isRecord(o) || typeof o.id !== "string") return fail(`options[${i}].id`, "must be a string such as \"opt_a\"");
    if (!isBlocks(o.content)) fail(`options[${i}].content`, "must be a list of text blocks");
    if (o.rationale !== undefined && !isBlocks(o.rationale)) fail(`options[${i}].rationale`, "must be a list of text blocks");
  });

  if (q.answer === undefined) return fail("answer", "is missing");
  const ids = new Set(options.map((o) => (isRecord(o) ? o.id : undefined)));
  if (!Array.isArray(q.answer) || q.answer.length !== 1) return fail("answer", "must list exactly one Option id");
  if (!ids.has(q.answer[0])) fail("answer", `names "${String(q.answer[0])}", which is not an Option of this Question`);
}

export function parseQuestionPack(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ field: "", message: `is not valid JSON: ${(e as Error).message}` }] };
  }
  const errors: PackError[] = [];
  if (!isRecord(data)) return { ok: false, errors: [{ field: "", message: "must be a JSON object" }] };
  if (data.kind !== "question_pack") errors.push({ field: "kind", message: "must be \"question_pack\"" });
  if (data.schemaVersion !== 1) errors.push({ field: "schemaVersion", message: "must be 1" });
  if (!isRecord(data.batch) || typeof data.batch.title !== "string") errors.push({ field: "batch.title", message: "must be a string" });
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    errors.push({ field: "questions", message: "must list at least one Question" });
  } else {
    data.questions.forEach((q, i) => validateQuestion(q, i, errors));
  }
  return errors.length ? { ok: false, errors } : { ok: true, pack: data as QuestionPack };
}

export async function commitQuestionPack(pack: QuestionPack, storage: Storage, now: Date = new Date()): Promise<{ setId: string }> {
  const at = now.getTime();
  const provenance = { source: "ai" as const, model: pack.batch.model, updatedAt: at };

  const batch: Batch = { ...provenance, id: newId("b", now), title: pack.batch.title, material: pack.batch.material, createdAt: at };
  await storage.set("batches", batch);

  const questionIds: string[] = [];
  for (const q of pack.questions) {
    const question: Question = {
      ...provenance,
      id: newId("q", now),
      revision: 1,
      type: q.type,
      typeVersion: 1,
      stem: q.stem,
      options: q.options.map((o) => ({ ...o, rationale: o.rationale ?? [] })),
      optionOrder: q.optionOrder ?? "shuffle",
      answer: q.answer,
      explanation: q.explanation ?? [],
      batchId: batch.id,
      tags: q.tags ?? [],
      createdAt: at,
      deprecated: false,
    };
    await storage.set("questions", question);
    questionIds.push(question.id);
  }

  const set: QuestionSet = {
    ...provenance,
    id: newId("s", now),
    title: pack.batch.title,
    sourceDescription: pack.batch.material,
    entries: questionIds.map((questionId) => ({ kind: "question", questionId })),
    createdAt: at,
    archived: false,
  };
  await storage.set("sets", set);
  return { setId: set.id };
}
