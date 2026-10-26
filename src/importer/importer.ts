import Ajv, { type ErrorObject } from "ajv";
import type { Batch, ContentBlock, Option, Question, QuestionSet } from "../domain/types";
import { newId } from "../domain/ids";
import type { Storage } from "../storage/storage";
import packSchema from "../../schema/question-pack.schema.json";
import { duplicateKeys } from "./normalise";
import { topicResolver } from "./topics";
import { packWarnings, type PackWarning } from "./warnings";
import { isTrueFalse } from "../questionTypes/singleAnswer";

export type { PackWarning };
export { topicPaths } from "./topics";

// A Question pack carries pack-local labels only; real IDs are assigned on commit (ADR-0003).
export type PackQuestion = {
  label: string;
  type: string;
  stem: ContentBlock[];
  options: (Omit<Option, "rationale"> & { rationale?: ContentBlock[] })[];
  optionOrder?: "shuffle" | "fixed";
  answer: string[];
  explanation?: ContentBlock[];
  /** Topic paths such as "BIOL101 / Genetics / Lecture 5"; the first segment names the Track. */
  topics?: string[];
  tags?: string[];
};

export type QuestionPack = {
  kind: "question_pack";
  schemaVersion: 1;
  batch: { title: string; model?: string; material?: string; topic?: string };
  questions: PackQuestion[];
};

/** A located validation error. `message` is English, written for the AI that produced the pack. */
export type PackError = { question?: string; field: string; message: string };

export type ParseResult = { ok: true; pack: QuestionPack } | { ok: false; errors: PackError[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const validatePack = new Ajv({ allErrors: true }).compile(packSchema);

/** "/questions/2/options/0/pin" → question index 2, field "options[0].pin". */
function locate(error: ErrorObject, data: unknown): PackError {
  const segments = error.instancePath.split("/").slice(1);
  if (error.keyword === "required") segments.push(String(error.params.missingProperty));
  if (error.keyword === "additionalProperties") segments.push(String(error.params.additionalProperty));

  let question: string | undefined;
  if (segments[0] === "questions" && segments.length > 1) {
    const index = Number(segments[1]);
    const q = isRecord(data) && Array.isArray(data.questions) ? data.questions[index] : undefined;
    question = isRecord(q) && typeof q.label === "string" && q.label ? q.label : `#${index + 1}`;
    segments.splice(0, 2);
  }
  const field = segments.map((s, i) => (/^\d+$/.test(s) ? `[${s}]` : i === 0 ? s : `.${s}`)).join("");

  let message: string;
  if (error.keyword === "required") message = "is missing";
  else if (error.keyword === "additionalProperties") message = "is not a field of the Question pack format; remove it";
  else if (error.keyword === "enum") message = `must be one of ${(error.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
  else if (error.keyword === "const") message = `must be ${JSON.stringify(error.params.allowedValue)}`;
  else message = error.message ?? "is invalid";
  return question === undefined ? { field, message } : { question, field, message };
}

// What the JSON Schema cannot express: references between fields.
function checkReferences(pack: QuestionPack): PackError[] {
  const errors: PackError[] = [];
  const labels = new Set<string>();
  for (const q of pack.questions) {
    const fail = (field: string, message: string) => errors.push({ question: q.label, field, message });
    if (labels.has(q.label)) fail("label", "is used by another Question in this pack; labels must be unique");
    labels.add(q.label);
    const ids = new Set<string>();
    q.options.forEach((o, i) => {
      if (ids.has(o.id)) fail(`options[${i}].id`, `"${o.id}" is used by another Option of this Question`);
      ids.add(o.id);
    });
    q.answer.forEach((id, i) => {
      if (!ids.has(id)) fail("answer", `names "${id}", which is not an Option of this Question`);
      else if (q.answer.indexOf(id) !== i) fail("answer", `names "${id}" more than once`);
    });
    if (q.type === "single_answer" && q.answer.length > 1) fail("answer", "must name exactly one Option for a single_answer Question; use multiple_answer for more");
    if (isTrueFalse(q)) {
      if (q.type !== "single_answer") fail("type", `must be "single_answer" for a true/false Question`);
      if (q.options.length !== 2) fail("options", "must be exactly two Options for a true/false Question");
      if (q.optionOrder === "shuffle") fail("optionOrder", `must be "fixed" (or left out) for a true/false Question`);
    }
  }
  return errors;
}


/** An AI's reply often wraps the pack in a Markdown code fence, with chat text around it. */
function stripCodeFence(text: string): string {
  const fenced = /^[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*$/m.exec(text);
  return fenced ? fenced[2]! : text;
}

export function parseQuestionPack(text: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (e) {
    return { ok: false, errors: [{ field: "", message: `is not valid JSON: ${(e as Error).message}` }] };
  }
  if (!validatePack(data)) return { ok: false, errors: (validatePack.errors ?? []).map((e) => locate(e, data)) };
  const pack = data as QuestionPack;
  const errors = checkReferences(pack);
  return errors.length ? { ok: false, errors } : { ok: true, pack };
}

/** The errors as plain text, to paste back to the AI that wrote the pack. */
export function packErrorsText(errors: PackError[]): string {
  const lines = errors.map((e) => {
    const where = [e.question && `Question "${e.question}"`, e.field && `field "${e.field}"`].filter(Boolean).join(", ");
    return `- ${where || "The pack"}: ${e.message}`;
  });
  return ["The Question pack could not be imported. Please fix these errors and send the whole pack again:", ...lines].join("\n");
}

const unique = <T>(values: T[]) => [...new Set(values)];

export type ImportStatus = "new" | "skipped" | "conflict";

/**
 * One pack Question in the preview. A skipped Question is identical to `existingId` in the bank or to
 * the earlier pack Question `sameAs`; a conflict asks the same thing as `existingId` with a different answer.
 */
export type PreviewQuestion = { label: string; status: ImportStatus; existingId?: string; sameAs?: string };

/** What an import would do. Building it writes nothing. */
export type ImportPreview = {
  pack: QuestionPack;
  questions: PreviewQuestion[];
  /** Topic paths that name a Track or Topic not yet in the bank; the user confirms them before commit. */
  newTopicPaths: string[];
  warnings: PackWarning[];
};

const packPaths = (pack: QuestionPack) => [...(pack.batch.topic ? [pack.batch.topic] : []), ...pack.questions.flatMap((q) => q.topics ?? [])];

export async function previewImport(pack: QuestionPack, storage: Storage): Promise<ImportPreview> {
  type Known = { full: string; existingId?: string; sameAs?: string };
  const known = new Map<string, Known>();
  for (const q of await storage.query<Question>("questions")) {
    const keys = duplicateKeys(q);
    if (!known.has(keys.text)) known.set(keys.text, { full: keys.full, existingId: q.id });
  }

  const questions = pack.questions.map((q): PreviewQuestion => {
    const keys = duplicateKeys(q);
    const match = known.get(keys.text);
    if (!match) {
      known.set(keys.text, { full: keys.full, sameAs: q.label });
      return { label: q.label, status: "new" };
    }
    const status = match.full === keys.full ? "skipped" : "conflict";
    return match.existingId ? { label: q.label, status, existingId: match.existingId } : { label: q.label, status, sameAs: match.sameAs };
  });
  const topics = await topicResolver(storage, { source: "ai", updatedAt: 0 }, new Date());
  packPaths(pack).forEach(topics.resolve);
  return { pack, questions, newTopicPaths: topics.newPaths, warnings: pack.questions.flatMap(packWarnings) };
}

export async function commitImport(
  preview: ImportPreview,
  storage: Storage,
  options: { confirmedTopicPaths: string[] },
  now: Date = new Date(),
): Promise<{ setId: string }> {
  const { pack } = preview;
  const at = now.getTime();
  const provenance = { source: "ai" as const, model: pack.batch.model, updatedAt: at };

  const topics = await topicResolver(storage, provenance, now);
  const resolved = new Map(packPaths(pack).map((path) => [path, topics.resolve(path)]));
  // Resolved again here, so a path the user did not see in the preview is refused rather than created.
  const unconfirmed = topics.newPaths.filter((path) => !options.confirmedTopicPaths.includes(path));
  if (unconfirmed.length) throw new Error(`New Topic paths were not confirmed: ${unconfirmed.join("; ")}`);
  for (const track of topics.created.tracks) await storage.add("tracks", track);
  for (const topic of topics.created.topics) await storage.add("topics", topic);

  const sourceTopicId = pack.batch.topic ? resolved.get(pack.batch.topic)?.topicId : undefined;
  const sequence = sourceTopicId ? (await storage.query<Batch>("batches", { sourceTopicId })).length + 1 : undefined;
  const batch: Batch = {
    ...provenance,
    id: newId("b", now),
    title: pack.batch.title,
    material: pack.batch.material,
    sourceTopicId,
    sequence,
    createdAt: at,
  };
  await storage.add("batches", batch);

  // Skipped Questions join the Set as the Question they duplicate, unless it is deprecated (excluded from new Sets);
  // conflicts wait for the Tier 2 choice (issue #11).
  const idByLabel = new Map<string, string>();
  const questionIds: string[] = [];
  for (const [i, q] of pack.questions.entries()) {
    const shown = preview.questions[i]!;
    if (shown.status === "conflict") continue;
    if (shown.status === "skipped") {
      const id = shown.existingId ?? idByLabel.get(shown.sameAs!)!;
      const deprecated = shown.existingId !== undefined && (await storage.get<Question>("questions", id))?.deprecated;
      if (!deprecated && !questionIds.includes(id)) questionIds.push(id);
      continue;
    }
    const question: Question = {
      ...provenance,
      id: newId("q", now),
      revision: 1,
      type: q.type,
      typeVersion: 1,
      stem: q.stem,
      options: q.options.map((o) => ({ ...o, rationale: o.rationale ?? [] })),
      optionOrder: q.optionOrder ?? (isTrueFalse(q) ? "fixed" : "shuffle"),
      answer: q.answer,
      explanation: q.explanation ?? [],
      batchId: batch.id,
      topicIds: unique((q.topics ?? []).flatMap((path) => resolved.get(path)?.topicId ?? [])),
      trackIds: unique((q.topics ?? []).map((path) => resolved.get(path)!.trackId)),
      tags: q.tags ?? [],
      createdAt: at,
      deprecated: false,
    };
    await storage.add("questions", question);
    idByLabel.set(q.label, question.id);
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
  await storage.add("sets", set);
  return { setId: set.id };
}
