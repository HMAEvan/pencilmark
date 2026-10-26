import type { Question } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import type { DerivedAttempt } from "./derivation";
import { finalValues, type FinalValues, type OverrideValues } from "./overrides";
import { excludedIdleMs } from "./timing";
import { isGraded, questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";

// The Digest is written for an AI to grade from, so its labels are fixed English, not interface text.

/** In displayed order, whatever order the Options were selected in. */
function letters(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).sort().join(", ") : "(blank)";
}

/** Whole seconds, with minutes once there is at least one: "45s", "1m 0s". */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

function answeringTime(attempt: DerivedAttempt, final: FinalValues): string {
  const { timing } = attempt;
  const idleMs = excludedIdleMs(timing);
  const time = final.overridden.includes("answeringActiveMs")
    ? `${duration(final.answeringActiveMs)} (overridden by the user; derived: ${duration(timing.answeringActiveMs)})`
    : `${duration(timing.answeringActiveMs)}${idleMs > 0 ? ` (${duration(idleMs)} idle excluded)` : ""}`;
  return `- Answering time: ${time}`;
}

/** A multiple-answer Question's result names its partial score too; a single-answer one scores exactly as it is graded. */
function outcomeLines(attempt: DerivedAttempt, final: FinalValues, multiple: boolean): string[] {
  const { trajectory, optionOrder } = attempt;
  const result = ({ correct, partialScore }: Pick<FinalValues, "correct" | "partialScore">) =>
    `${correct ? "correct" : "wrong"}${multiple ? ` (partial score ${partialScore})` : ""}`;
  const changes = trajectory.changes.map((c) => `${letters(c.answer, optionOrder)} at ${duration(c.atMs)} (after ${duration(c.dwellMs)})`);
  return [
    `- Result: ${result(final)}${final.overridden.includes("correct") ? ` (overridden by the user; derived: ${result(attempt)})` : ""}`,
    answeringTime(attempt, final),
    `- First choice: ${trajectory.firstChoice ? `${letters(trajectory.firstChoice, optionOrder)} after ${duration(trajectory.timeToFirstChoiceMs!)}` : "none"}`,
    `- Answer changes: ${changes.length ? changes.join(", ") : "none"}`,
  ];
}

/** Uses each Question's Override, if any, in place of the derived time or result. */
export function writeDigest(
  title: string,
  attempts: DerivedAttempt[],
  questions: Map<string, Question>,
  overrides: Map<string, OverrideValues> = new Map(),
): string {
  const lines = [`# Digest: ${title}`, ""];
  for (const attempt of attempts) {
    const question = questions.get(attempt.questionId)!;
    const order = attempt.optionOrder;
    const final = finalValues(attempt, overrides.get(attempt.questionId));
    lines.push(`## Question ${attempt.displayedNumber}`, "", blocksToText(question.stem, order), "");
    // A type shown read-only cannot be answered, so it has no Options, answer or trajectory to report.
    if (!isGraded(question)) {
      lines.push(
        `- Type: ${JSON.stringify(question.type)}, not supported: shown read-only, not graded`,
        `- Correct answer: ${question.answer.join(", ")}`,
        "- Result: not graded",
        answeringTime(attempt, final),
        "",
      );
      continue;
    }
    const multiple = questionTypeOf(question) === multipleAnswer;
    const options = order.map((id, i) => {
      const option = question.options.find((o) => o.id === id);
      return `- ${letterAt(i)}. ${option ? blocksToText(option.content, order) : ""}`;
    });
    lines.push(
      ...options,
      "",
      ...(multiple ? ["- Type: multiple answer (select all that apply)"] : []),
      `- Answer given: ${letters(attempt.answer, order)}`,
      `- Correct answer: ${letters(question.answer, order)}`,
      ...outcomeLines(attempt, final, multiple),
      "",
    );
  }
  return lines.join("\n");
}
