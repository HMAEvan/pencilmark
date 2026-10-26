import type { Question } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import type { DerivedAttempt } from "./derivation";

// The Digest is written for an AI to grade from, so its labels are fixed English, not interface text.

function letters(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).join(", ") : "(blank)";
}

export function writeDigest(title: string, attempts: DerivedAttempt[], questions: Map<string, Question>): string {
  const lines = [`# Digest: ${title}`, ""];
  for (const attempt of attempts) {
    const question = questions.get(attempt.questionId)!;
    const order = attempt.optionOrder;
    const options = order.map((id, i) => {
      const option = question.options.find((o) => o.id === id);
      return `- ${letterAt(i)}. ${option ? blocksToText(option.content, order) : ""}`;
    });
    lines.push(
      `## Question ${attempt.displayedNumber}`,
      "",
      blocksToText(question.stem, order),
      "",
      ...options,
      "",
      `- Answer given: ${letters(attempt.answer, order)}`,
      `- Correct answer: ${letters(question.answer, order)}`,
      `- Result: ${attempt.correct ? "correct" : "wrong"}`,
      "",
    );
  }
  return lines.join("\n");
}
