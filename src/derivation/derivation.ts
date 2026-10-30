import type { Question } from "../domain/types";
import type { RawLogChunk, RecordedChunk } from "../recorder/recorder";
import { questionTypeOf } from "../questionTypes/questionType";
import { writeDigest } from "./digest";
import type { OverrideValues } from "./overrides";
import { emptyTiming, emptyTrajectory, walkRawLog, type ChunkGap, type QuestionTiming, type SessionTotals, type Trajectory } from "./timing";
import type { Rules } from "../domain/settings";
import { emptyMarks, walkMarks, type QuestionMarks, type RemovedFlags } from "./marks";
import { walkHints, type HintUse } from "./hints";
import type { TimelineStep } from "./timeline";

export { finalAnsweringActiveMs, finalValues, type FinalValues, type OverriddenValue, type OverrideValues } from "./overrides";

// ADR-0002: a pure function from the Raw log to derived data. No DOM, no storage.

/**
 * Raised whenever a change to how Derivation computes (here, in timing.ts, in marks.ts, in digest.ts or in a question type) would change a derived value.
 * 2: timing and trajectories. 3: unreleased; issues #5, #7 and #8 each used it on their own branch.
 * 4: multiple-answer Questions and partial scores; Confidence, Flags and Notes; reviewing time.
 * 5: the Digest shows every time to the millisecond.
 * 6: Item flags, Hints used and appeals.
 * 7: the Answering timeline, in the Attempt and the Digest; the Misconception line in the Digest.
 * 8: the Digest writes a partial score to at most two decimal places.
 */
export const ALGORITHM_VERSION = 8;

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
  /** The Answering timeline: every step taken on the Question while answering, in time order. */
  timeline: TimelineStep[];
  /** In the order opened, which is level order. */
  hintsUsed: HintUse[];
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
  const hintCount = (questionId: string) => byId.get(questionId)?.hints?.length ?? 0;
  const walk = walkRawLog(
    input.rawLog,
    input.rules,
    (questionId, answer, optionId) => {
      const question = byId.get(questionId);
      return question ? questionTypeOf(question).select(answer, optionId) : answer;
    },
    hintCount,
  );
  const hints = walkHints(input.rawLog, hintCount, walk.hintAnsweringMs);

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
      timeline: walk.timelines.get(questionId) ?? [],
      hintsUsed: hints.get(questionId) ?? [],
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

/**
 * Each Question's answering time so far, from the Raw log as recorded up to now, the open chunk included: the times the
 * Player shows. The same timing rules as `derive`, so a time shown while answering is the time derived once sealed.
 */
export function answeringTimesSoFar(rawLog: RecordedChunk[], rules: Rules): Map<string, number> {
  // Answers play no part in time, so Options are not looked up.
  const walk = walkRawLog(rawLog, rules, (_questionId, answer) => answer);
  return new Map([...walk.questions].map(([questionId, timing]) => [questionId, timing.answeringActiveMs]));
}

/** The Digest to copy: the derived one, with any Overrides set since in place of the derived time or result. */
export function digestWithOverrides(
  { title, questions, rules }: Pick<DerivationInput, "title" | "questions" | "rules">,
  { attempts, removedFlags }: Pick<DerivationResult, "attempts" | "removedFlags">,
  overrides: Map<string, OverrideValues>,
): string {
  return writeDigest(title, attempts, new Map(questions.map((q) => [q.id, q])), rules.collectConfidence, removedFlags, overrides);
}
