import type { DerivedAttempt } from "./derivation";

/** The derived values a user can correct as an Override (GLOSSARY.md). */
export type OverrideValues = { answeringActiveMs?: number; correct?: boolean };

export type FinalValues = { answeringActiveMs: number; correct: boolean; overridden: (keyof OverrideValues)[] };

/** The value to show and use: the Override where there is one, otherwise the derived value, which is left as it is. */
export function finalValues(attempt: DerivedAttempt, override: OverrideValues = {}): FinalValues {
  const overridden: (keyof OverrideValues)[] = [];
  if (override.answeringActiveMs !== undefined) overridden.push("answeringActiveMs");
  if (override.correct !== undefined) overridden.push("correct");
  return {
    answeringActiveMs: override.answeringActiveMs ?? attempt.timing.answeringActiveMs,
    correct: override.correct ?? attempt.correct,
    overridden,
  };
}
