import type { Question } from "../domain/types";
import type { RawLogChunk } from "../recorder/recorder";
import { questionTypeOf } from "../questionTypes/questionType";
import { writeDigest } from "./digest";
import type { OverrideValues } from "./overrides";
import { emptyTiming, emptyTrajectory, walkRawLog, type ChunkGap, type QuestionTiming, type SessionTotals, type Trajectory } from "./timing";
import type { Rules } from "../domain/settings";
import { emptyMarks, walkMarks, type QuestionMarks, type RemovedFlags } from "./marks";

export { finalValues, type FinalValues, type OverrideValues } from "./overrides";

// ADR-0002: a pure function from the Raw log to derived data. No DOM, no storage.

/**
 * Raised whenever a change to how Derivation computes (here, in timing.ts, in marks.ts, in digest.ts or in a question type) would change a derived value.
 * 2: timing and trajectories. 3: unreleased; issues #5, #7 and #8 each used it on their own branch.
 * 4: multiple-answer Questions and partial scores; Confidence, Flags and Notes; reviewing time.
 */
export const ALGORITHM_VERSION = 4;

export type DerivationInput = {
  title: string;
  rawLog: RawLogChunk[];
  /** The Question revisions the Session was sat against. */
  questions: Question[];
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  /** The `rules` of the Session's settings snapshot; Derivation reads no other preference. */
  rules: Rules;
};

export type DerivedAttempt = QuestionMarks & {
  questionId: string;
  questionRevision: number;
  answer: string[];
  /** True only for an exact match; null for a Question that is not graded. */
  correct: boolean | null;
  /** From 0 to 1; a single-answer Question scores 0 or 1. Null for a Question that is not graded. */
  partialScore: number | null;
  /** Unanswered: scores 0. */
  blank: boolean;
  displayedNumber: number;
  optionOrder: string[];
  timing: QuestionTiming;
  trajectory: Trajectory;
};

export type DerivationResult = {
  algorithmVersion: number;
  /** The full parameters used: a copy of the rules, so a later change to the snapshot cannot alter the record. */
  parameters: Rules;
  /** The Raw log chunks read, in order, with the hash each had. */
  chunks: { id: string; hash: string }[];
  attempts: DerivedAttempt[];
  totals: SessionTotals;
  chunkGaps: ChunkGap[];
  /** Flags removed and the Phase each was added in, by Question id. Kept out of the Attempts, which hold only the final Flags. */
  removedFlags: RemovedFlags;
  digest: string;
};

export function derive(input: DerivationInput): DerivationResult {
  const { marks, removedFlags } = walkMarks(input.rawLog, input.rules);
  const byId = new Map(input.questions.map((q) => [q.id, q]));
  const walk = walkRawLog(input.rawLog, input.rules, (questionId, answer, optionId) => {
    const question = byId.get(questionId);
    return question ? questionTypeOf(question).select(answer, optionId) : answer;
  });

  const attempts = input.questionOrder.map((questionId, index): DerivedAttempt => {
    const question = byId.get(questionId);
    if (!question) throw new Error(`Question ${questionId} is in the Session but was not provided`);
    const answer = walk.answers.get(questionId) ?? [];
    return {
      questionId,
      questionRevision: question.revision,
      answer,
      ...questionTypeOf(question).grade(question, answer),
      blank: answer.length === 0,
      displayedNumber: index + 1,
      optionOrder: input.optionOrders[questionId] ?? question.options.map((o) => o.id),
      timing: walk.questions.get(questionId) ?? emptyTiming(),
      trajectory: walk.trajectories.get(questionId) ?? emptyTrajectory(),
      ...(marks.get(questionId) ?? emptyMarks()),
    };
  });

  return {
    algorithmVersion: ALGORITHM_VERSION,
    parameters: { ...input.rules },
    chunks: input.rawLog.map(({ id, hash }) => ({ id, hash })),
    attempts,
    totals: walk.totals,
    chunkGaps: walk.chunkGaps,
    removedFlags,
    digest: writeDigest(input.title, attempts, byId, input.rules.collectConfidence, removedFlags),
  };
}

/** The Digest to copy: the derived one, with any Overrides set since in place of the derived time or result. */
export function digestWithOverrides(
  { title, questions, rules }: Pick<DerivationInput, "title" | "questions" | "rules">,
  { attempts, removedFlags }: Pick<DerivationResult, "attempts" | "removedFlags">,
  overrides: Map<string, OverrideValues>,
): string {
  return writeDigest(title, attempts, new Map(questions.map((q) => [q.id, q])), rules.collectConfidence, removedFlags, overrides);
}
