import type { Storage } from "../storage/storage";
import type { Question } from "./types";

// ADR-0004: `questions` holds each Question's latest revision; earlier revisions are kept in `questionRevisions`.

/** An earlier Question revision, kept as it was when it was replaced. */
export type QuestionRevisionDocument = { id: string; questionId: string; revision: number; question: Question; source: Question["source"]; updatedAt: number };

/** A composite ID built from the Question's permanent ID (ADR-0003). */
export const questionRevisionId = (questionId: string, revision: number) => `${questionId}_r${revision}`;

/** Replaces a Question with its next revision, keeping the one it replaces. */
export async function storeNextRevision(storage: Storage, current: Question, next: Question): Promise<void> {
  if (next.id !== current.id || next.revision !== current.revision + 1) throw new Error(`Question ${current.id}: revision ${next.revision} cannot follow ${current.revision}`);
  const kept: QuestionRevisionDocument = {
    id: questionRevisionId(current.id, current.revision),
    questionId: current.id,
    revision: current.revision,
    question: current,
    source: current.source,
    updatedAt: current.updatedAt,
  };
  await storage.add("questionRevisions", kept);
  await storage.set("questions", next);
}

/** One revision of a Question, latest or earlier. */
export async function loadQuestionRevision(storage: Storage, questionId: string, revision: number): Promise<Question | undefined> {
  const latest = await storage.get<Question>("questions", questionId);
  if (!latest || latest.revision === revision) return latest;
  return (await storage.get<QuestionRevisionDocument>("questionRevisions", questionRevisionId(questionId, revision)))?.question;
}
