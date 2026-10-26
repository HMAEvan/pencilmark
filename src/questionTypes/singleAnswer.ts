import type { QuestionType } from "./questionType";

// Single-answer Questions, also used for true/false: 0 or 1, exact match.
export const singleAnswer: QuestionType = {
  type: "single_answer",
  select: (_answer, optionId) => [optionId],
  grade(question, answer) {
    const correct = answer.length === 1 && answer[0] === question.answer[0];
    return { correct, partialScore: correct ? 1 : 0 };
  },
};

/** A true/false Question: single-answer, two Options in fixed order, and this tag. */
export const isTrueFalse = (question: { tags?: string[] }) => question.tags?.includes("true_false") ?? false;
