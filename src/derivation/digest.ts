import type { Question } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import type { DerivedAttempt } from "./derivation";
import { finalValues, type FinalValues, type OverrideValues } from "./overrides";
import { excludedIdleMs } from "./timing";
import { questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { shortAnswer } from "../questionTypes/shortAnswer";

// The Digest is written for an AI to grade from, so its labels are fixed English, not interface text.

/** How a Question's answers are written: as displayed letters, or as the text written. */
type AnswerFormat = (answer: string[]) => string;

/** In displayed order, whatever order the Options were selected in. */
const letters =
  (optionOrder: string[]): AnswerFormat =>
  (optionIds) =>
    optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).sort().join(", ") : "(blank)";

const quoted: AnswerFormat = (answer) => (answer.length ? JSON.stringify(answer[0]) : "(blank)");

/** Whole seconds, with minutes once there is at least one: "45s", "1m 0s". */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/** A multiple-answer Question's result names its partial score too; a single-answer one scores exactly as it is graded. */
function outcomeLines(attempt: DerivedAttempt, override: OverrideValues | undefined, multiple: boolean, format: AnswerFormat): string[] {
  const { timing, trajectory } = attempt;
  const final = finalValues(attempt, override);
  const result = ({ correct, partialScore }: Pick<FinalValues, "correct" | "partialScore">) =>
    correct === null ? "pending (to be graded)" : `${correct ? "correct" : "wrong"}${multiple ? ` (partial score ${partialScore})` : ""}`;
  const idleMs = excludedIdleMs(timing);
  const time = final.overridden.includes("answeringActiveMs")
    ? `${duration(final.answeringActiveMs)} (overridden by the user; derived: ${duration(timing.answeringActiveMs)})`
    : `${duration(timing.answeringActiveMs)}${idleMs > 0 ? ` (${duration(idleMs)} idle excluded)` : ""}`;
  const changes = trajectory.changes.map((c) => `${format(c.answer)} at ${duration(c.atMs)} (after ${duration(c.dwellMs)})`);
  return [
    `- Result: ${result(final)}${final.overridden.includes("correct") ? ` (overridden by the user; derived: ${result(attempt)})` : ""}`,
    `- Answering time: ${time}`,
    `- First choice: ${trajectory.firstChoice ? `${format(trajectory.firstChoice)} after ${duration(trajectory.timeToFirstChoiceMs!)}` : "none"}`,
    `- Answer changes: ${changes.length ? changes.join(", ") : "none"}`,
  ];
}

/** Single-answer Questions, the most common, carry no type line. */
function typeLine(question: Question): string[] {
  const type = questionTypeOf(question);
  if (type === multipleAnswer) return ["- Type: multiple answer (select all that apply)"];
  if (type !== shortAnswer) return [];
  return [question.type === shortAnswer.type ? "- Type: short answer" : `- Type: ${JSON.stringify(question.type)}, shown as short answer`];
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
    const written = questionTypeOf(question) === shortAnswer;
    const options = written
      ? []
      : [
          ...order.map((id, i) => {
            const option = question.options.find((o) => o.id === id);
            return `- ${letterAt(i)}. ${option ? blocksToText(option.content, order) : ""}`;
          }),
          "",
        ];
    const format = written ? quoted : letters(order);
    lines.push(
      `## Question ${attempt.displayedNumber}`,
      "",
      blocksToText(question.stem, order),
      "",
      ...options,
      ...typeLine(question),
      `- Answer given: ${written ? (attempt.answer[0] ?? "(blank)") : format(attempt.answer)}`,
      `- Correct answer: ${written ? question.answer.join(", ") : format(question.answer)}`,
      ...outcomeLines(attempt, overrides.get(attempt.questionId), questionTypeOf(question) === multipleAnswer, format),
      "",
    );
  }
  return lines.join("\n");
}
