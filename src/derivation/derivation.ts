import type { Question } from "../domain/types";
import type { RawLogChunk } from "../recorder/recorder";
import { singleAnswer } from "../questionTypes/singleAnswer";
import { writeDigest } from "./digest";
import { emptyTiming, emptyTrajectory, walkRawLog, type ChunkGap, type QuestionTiming, type SessionTotals, type Trajectory } from "./timing";
import type { Rules } from "../domain/settings";

// ADR-0002: a pure function from the Raw log to derived data. No DOM, no storage.

/** Raised whenever a change to the rules below would change a derived value. 2: timing and trajectories. */
export const ALGORITHM_VERSION = 2;

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

export type DerivedAttempt = {
  questionId: string;
  questionRevision: number;
  answer: string[];
  correct: boolean;
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
  digest: string;
};

export function derive(input: DerivationInput): DerivationResult {
  const walk = walkRawLog(input.rawLog, input.rules);
  const byId = new Map(input.questions.map((q) => [q.id, q]));

  const attempts = input.questionOrder.map((questionId, index): DerivedAttempt => {
    const question = byId.get(questionId);
    if (!question) throw new Error(`Question ${questionId} is in the Session but was not provided`);
    const answer = walk.answers.get(questionId) ?? [];
    return {
      questionId,
      questionRevision: question.revision,
      answer,
      correct: singleAnswer.grade(question, answer),
      blank: answer.length === 0,
      displayedNumber: index + 1,
      optionOrder: input.optionOrders[questionId] ?? question.options.map((o) => o.id),
      timing: walk.questions.get(questionId) ?? emptyTiming(),
      trajectory: walk.trajectories.get(questionId) ?? emptyTrajectory(),
    };
  });

  return {
    algorithmVersion: ALGORITHM_VERSION,
    parameters: { ...input.rules },
    chunks: input.rawLog.map(({ id, hash }) => ({ id, hash })),
    attempts,
    totals: walk.totals,
    chunkGaps: walk.chunkGaps,
    digest: writeDigest(input.title, attempts, byId),
  };
}

/** The derived values a user can correct as an Override (GLOSSARY.md). */
export type OverrideValues = { answeringActiveMs?: number; correct?: boolean };

export type FinalValues = { answeringActiveMs: number; correct: boolean; overridden: (keyof OverrideValues)[] };

/** The value to show and use: the Override where there is one, otherwise the derived value, which is left as it is. */
export function finalValues(attempt: DerivedAttempt, override: OverrideValues = {}): FinalValues {
  const overridden: (keyof OverrideValues)[] = [];
  if (override.answeringActiveMs !== undefined) overridden.push("answeringActiveMs");
  if (override.correct !== undefined) overridden.push("correct");
  return {
    answeringActiveMs: override.answeringActiveMs ?? attempt.timing.answeringActiveMs,
    correct: override.correct ?? attempt.correct,
    overridden,
  };
}
