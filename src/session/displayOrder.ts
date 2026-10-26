import type { Question } from "../domain/types";
import type { Rules } from "../domain/settings";
import { isTrueFalse } from "../questionTypes/singleAnswer";

// The Question and Option orders a Session displays, fixed when it starts and stored on it.

/** A uniformly random permutation (Fisher–Yates); `random` returns a number in [0, 1). */
function shuffled<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Pinned Options stay first or last, in authored order; the others are shuffled between them.
 * Fixed-order Questions, true/false included, keep their authored order.
 */
function optionOrderOf(question: Question, shuffle: boolean, random: () => number): string[] {
  const ids = (pin: "first" | "last" | undefined) => question.options.filter((o) => o.pin === pin).map((o) => o.id);
  if (!shuffle || question.optionOrder === "fixed" || isTrueFalse(question)) return question.options.map((o) => o.id);
  return [...ids("first"), ...shuffled(ids(undefined), random), ...ids("last")];
}

export function displayOrders(
  questions: Question[],
  rules: Pick<Rules, "shuffleQuestions" | "shuffleOptions">,
  random: () => number = Math.random,
): { questionOrder: string[]; optionOrders: Record<string, string[]> } {
  const ids = questions.map((q) => q.id);
  return {
    questionOrder: rules.shuffleQuestions ? shuffled(ids, random) : ids,
    optionOrders: Object.fromEntries(questions.map((q) => [q.id, optionOrderOf(q, rules.shuffleOptions, random)])),
  };
}
