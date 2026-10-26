import type { Question } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import type { DerivedAttempt } from "./derivation";

// The Digest is written for an AI to grade from, so its labels are fixed English, not interface text.

function letters(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).join(", ") : "(blank)";
}

/** Whole seconds, with minutes once there is at least one: "45s", "1m 0s". */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function timingLines({ timing, trajectory, optionOrder }: DerivedAttempt): string[] {
  const excludedMs = timing.excludedIdle.reduce((sum, idle) => sum + idle.excludedMs, 0);
  const changes = trajectory.changes.map((c) => `${letters(c.answer, optionOrder)} at ${duration(c.atMs)} (after ${duration(c.dwellMs)})`);
  return [
    `- Answering time: ${duration(timing.answeringActiveMs)}${excludedMs > 0 ? ` (${duration(excludedMs)} idle excluded)` : ""}`,
    `- First choice: ${trajectory.firstChoice ? `${letters(trajectory.firstChoice, optionOrder)} after ${duration(trajectory.timeToFirstChoiceMs!)}` : "none"}`,
    `- Answer changes: ${changes.length ? changes.join(", ") : "none"}`,
  ];
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
      ...timingLines(attempt),
      "",
    );
  }
  return lines.join("\n");
}
