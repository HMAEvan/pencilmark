import type { QuestionType } from "./questionType";

// How a Question of an unsupported type is shown, so it never fails: read-only, like a short-answer Question
// with no way to answer, and not graded. Answering and grading short answers come after the MVP.
export const shortAnswer: QuestionType = {
  type: "short_answer",
  select: (answer) => answer,
  grade: () => ({ correct: null, partialScore: null }),
};
