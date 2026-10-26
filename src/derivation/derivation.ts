import type { Question } from "../domain/types";
import type { RawLogChunk } from "../recorder/recorder";
import { singleAnswer } from "../questionTypes/singleAnswer";
import { writeDigest } from "./digest";

// ADR-0002: a pure function from the Raw log to derived data. No DOM, no storage.
// Timing, trajectories and the derivation record's parameters arrive with issue #3/#4.

export const ALGORITHM_VERSION = 1;

export type DerivationInput = {
  title: string;
  rawLog: RawLogChunk[];
  /** The Question revisions the Session was sat against. */
  questions: Question[];
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
};

export type DerivedAttempt = {
  questionId: string;
  questionRevision: number;
  answer: string[];
  correct: boolean;
  blank: boolean;
  displayedNumber: number;
  optionOrder: string[];
};

export type DerivationResult = { attempts: DerivedAttempt[]; digest: string };

function answersAtSubmission(rawLog: RawLogChunk[]): Map<string, string[]> {
  const answers = new Map<string, string[]>();
  const events = rawLog.flatMap((chunk) => chunk.events).sort((a, b) => a.seq - b.seq);
  for (const event of events) {
    if (event.type === "submit") break;
    if (event.type === "select") answers.set(event.questionId, [event.optionId]);
  }
  return answers;
}

export function derive(input: DerivationInput): DerivationResult {
  const answers = answersAtSubmission(input.rawLog);
  const byId = new Map(input.questions.map((q) => [q.id, q]));

  const attempts = input.questionOrder.map((questionId, index): DerivedAttempt => {
    const question = byId.get(questionId);
    if (!question) throw new Error(`Question ${questionId} is in the Session but was not provided`);
    const answer = answers.get(questionId) ?? [];
    return {
      questionId,
      questionRevision: question.revision,
      answer,
      correct: singleAnswer.grade(question, answer),
      blank: answer.length === 0,
      displayedNumber: index + 1,
      optionOrder: input.optionOrders[questionId] ?? question.options.map((o) => o.id),
    };
  });

  return { attempts, digest: writeDigest(input.title, attempts, byId) };
}
