import type { Flag, Question } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import type { DerivedAttempt } from "./derivation";
import { finalValues, type OverrideValues } from "./overrides";
import { excludedIdleMs } from "./timing";

// The Digest is written for an AI to grade from, so its labels are fixed English, not interface text.

function letters(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).join(", ") : "(blank)";
}

/** Whole seconds, with minutes once there is at least one: "45s", "1m 0s". */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

const result = (correct: boolean) => (correct ? "correct" : "wrong");

const FLAG_NAMES: Record<Flag, string> = { concept: "concept confusion", careless: "careless", focus: "focus", memory: "memory", bad_question: "bad question" };

function markLines({ confidence, flags, note }: DerivedAttempt, collectConfidence: boolean): string[] {
  const lines = [
    `- Confidence: ${collectConfidence ? (confidence ?? "none") : "not collected"}`,
    `- Flags: ${flags.length ? flags.map((f) => `${FLAG_NAMES[f.flag]} (${f.phase})`).join(", ") : "none"}`,
  ];
  if (note) lines.push(`- Note: ${note}`);
  return lines;
}

function outcomeLines(attempt: DerivedAttempt, override: OverrideValues | undefined): string[] {
  const { timing, trajectory, optionOrder } = attempt;
  const final = finalValues(attempt, override);
  const idleMs = excludedIdleMs(timing);
  const time = final.overridden.includes("answeringActiveMs")
    ? `${duration(final.answeringActiveMs)} (overridden by the user; derived: ${duration(timing.answeringActiveMs)})`
    : `${duration(timing.answeringActiveMs)}${idleMs > 0 ? ` (${duration(idleMs)} idle excluded)` : ""}`;
  const changes = trajectory.changes.map((c) => `${letters(c.answer, optionOrder)} at ${duration(c.atMs)} (after ${duration(c.dwellMs)})`);
  return [
    `- Result: ${result(final.correct)}${final.overridden.includes("correct") ? ` (overridden by the user; derived: ${result(attempt.correct)})` : ""}`,
    `- Answering time: ${time}`,
    `- First choice: ${trajectory.firstChoice ? `${letters(trajectory.firstChoice, optionOrder)} after ${duration(trajectory.timeToFirstChoiceMs!)}` : "none"}`,
    `- Answer changes: ${changes.length ? changes.join(", ") : "none"}`,
  ];
}

/** Uses each Question's Override, if any, in place of the derived time or result. */
export function writeDigest(
  title: string,
  attempts: DerivedAttempt[],
  questions: Map<string, Question>,
  collectConfidence: boolean,
  overrides: Map<string, OverrideValues> = new Map(),
): string {
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
      ...outcomeLines(attempt, overrides.get(attempt.questionId)),
      ...markLines(attempt, collectConfidence),
      "",
    );
  }
  return lines.join("\n");
}
