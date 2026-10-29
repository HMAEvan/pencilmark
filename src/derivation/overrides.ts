import type { DerivedAttempt } from "./derivation";

/** The derived values a user can correct as an Override (GLOSSARY.md). */
export type OverrideValues = {
  answeringActiveMs?: number;
  /**
   * The derived answering time when the time was overridden. A time overridden while answering fixes the time up to
   * that moment: answering time derived beyond it is added on top. Absent on Overrides from before it was recorded.
   */
  answeringActiveMsAtOverride?: number;
  correct?: boolean;
};

export type OverriddenValue = "answeringActiveMs" | "correct";

export type FinalValues = { answeringActiveMs: number; correct: boolean | null; partialScore: number | null; overridden: OverriddenValue[] };

/**
 * The value to show and use: the Override where there is one, otherwise the derived value, which is left as it is.
 * An overridden result also sets the partial score: full for correct, none for wrong.
 */
export function finalValues(attempt: DerivedAttempt, override: OverrideValues = {}): FinalValues {
  const overridden: OverriddenValue[] = [];
  if (override.answeringActiveMs !== undefined) overridden.push("answeringActiveMs");
  if (override.correct !== undefined) overridden.push("correct");
  return {
    answeringActiveMs: finalAnsweringActiveMs(attempt.timing.answeringActiveMs, override),
    correct: override.correct ?? attempt.correct,
    partialScore: override.correct === undefined ? attempt.partialScore : override.correct ? 1 : 0,
    overridden,
  };
}

/**
 * The overridden answering time plus any derived after the Override, or the derived time where there is no Override.
 * The time added is never negative, so deriving again with stricter rules cannot take time off.
 */
export function finalAnsweringActiveMs(derivedMs: number, { answeringActiveMs, answeringActiveMsAtOverride }: OverrideValues): number {
  if (answeringActiveMs === undefined) return derivedMs;
  return answeringActiveMs + (answeringActiveMsAtOverride === undefined ? 0 : Math.max(0, derivedMs - answeringActiveMsAtOverride));
}
