import type { Question } from "../domain/types";
import { multipleAnswer } from "./multipleAnswer";
import { shortAnswer } from "./shortAnswer";
import { singleAnswer } from "./singleAnswer";

/** A Question's result: `correct` for an exact match, and a partial score from 0 to 1. Both are null for a Question that is not graded. */
export type Grade = { correct: boolean; partialScore: number } | { correct: null; partialScore: null };

/** What the core knows of a question type: its answer state and its grading. */
export type QuestionType = {
  type: string;
  /** The answer after an Option is selected; `answer` itself when nothing changes. */
  select(answer: string[], optionId: string): string[];
  grade(question: Question, answer: string[]): Grade;
};

const types: QuestionType[] = [singleAnswer, multipleAnswer];

/** Any other type, short-answer included, is shown read-only as short-answer and not graded, rather than failing. */
export function questionTypeOf(question: Pick<Question, "type">): QuestionType {
  return types.find((t) => t.type === question.type) ?? shortAnswer;
}

/** False for a type shown read-only: it cannot be answered and is not graded. */
export const isGraded = (question: Pick<Question, "type">) => questionTypeOf(question) !== shortAnswer;
