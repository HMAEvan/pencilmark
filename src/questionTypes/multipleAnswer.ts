import type { QuestionType } from "./questionType";

// Multiple-answer Questions: correct only for an exact match; partialScore = max(0, (c − w) / k),
// with k the correct Options, c the correct Options selected and w the wrong Options selected.
export const multipleAnswer: QuestionType = {
  type: "multiple_answer",
  select: (answer, optionId) => (answer.includes(optionId) ? answer : [...answer, optionId]),
  grade(question, answer) {
    const k = question.answer.length;
    const c = answer.filter((id) => question.answer.includes(id)).length;
    const w = answer.length - c;
    return { correct: c === k && w === 0, partialScore: Math.max(0, (c - w) / k) };
  },
};
