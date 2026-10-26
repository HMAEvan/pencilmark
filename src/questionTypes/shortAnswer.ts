import type { QuestionType } from "./questionType";

// Short-answer Questions: the answer is the text written, and grading is pending until done by hand.
// Also how a Question of an unrecognised type is shown, so it never fails.
export const shortAnswer: QuestionType = {
  type: "short_answer",
  select: (answer) => answer,
  grade: () => ({ correct: null, partialScore: null }),
};
