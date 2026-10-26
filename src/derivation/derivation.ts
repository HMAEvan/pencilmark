import type { Question } from "../domain/types";
import type { RawLogChunk } from "../recorder/recorder";
import { singleAnswer } from "../questionTypes/singleAnswer";
import { writeDigest } from "./digest";
import type { OverrideValues } from "./overrides";
import { emptyTiming, emptyTrajectory, walkRawLog, type ChunkGap, type QuestionTiming, type SessionTotals, type Trajectory } from "./timing";
import type { Rules } from "../domain/settings";
import { emptyMarks, walkMarks, type QuestionMarks, type RemovedFlags } from "./marks";

export { finalValues, type FinalValues, type OverrideValues } from "./overrides";

// ADR-0002: a pure function from the Raw log to derived data. No DOM, no storage.

/** Raised whenever a change to how Derivation computes (here, in timing.ts or in digest.ts) would change a derived value. 2: timing and trajectories. 3: Confidence, Flags and Notes. */
export const ALGORITHM_VERSION = 3;

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
  /** Flags removed and the Phase each was added in, by Question id. Kept out of the Attempts, which hold only the final Flags. */
  removedFlags: RemovedFlags;
  digest: string;
};

export function derive(input: DerivationInput): DerivationResult {
  const walk = walkRawLog(input.rawLog, input.rules);
  const { marks, removedFlags } = walkMarks(input.rawLog, input.rules);
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
