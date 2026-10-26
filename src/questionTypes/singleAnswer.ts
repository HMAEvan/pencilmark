import type { Question } from "../domain/types";

// Single-answer Questions (true/false reuses this in issue #4): 0 or 1, exact match.
export const singleAnswer = {
  type: "single_answer",
  grade(question: Question, answer: string[]): boolean {
    return answer.length === 1 && answer[0] === question.answer[0];
  },
};
