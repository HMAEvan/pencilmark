import { version } from "../../package.json";

// Preferences and the snapshot of them that each Session keeps (issue #1, Data model).
// The settings screen arrives with issue #13; until then every Session uses the defaults.

export const SCHEMA_VERSION = 1;

/** Preferences that change what Derivation computes. Derivation reads only these. */
export type Rules = {
  idleThresholdMs: number;
  flickThresholdMs: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  collectConfidence: boolean;
};

/** Every other preference: what is shown and how. */
export type Display = {
  sessionTimer: "shown" | "hidden";
  questionTimer: "shown" | "hidden";
  multipleAnswerScore: "partial" | "all_or_nothing";
  language: "zh";
  similarityThreshold: number;
  backupReminderDays: number;
};

export type Preferences = { rules: Rules; display: Display };

export type SettingsSnapshot = Preferences & { schemaVersion: number; appVersion: string };

export const DEFAULT_PREFERENCES: Preferences = {
  rules: { idleThresholdMs: 60_000, flickThresholdMs: 500, shuffleQuestions: true, shuffleOptions: true, collectConfidence: true },
  display: {
    sessionTimer: "shown",
    questionTimer: "hidden",
    multipleAnswerScore: "partial",
    language: "zh",
    similarityThreshold: 0.9,
    backupReminderDays: 7,
  },
};

export function settingsSnapshot(preferences: Preferences = DEFAULT_PREFERENCES): SettingsSnapshot {
  return { ...structuredClone(preferences), schemaVersion: SCHEMA_VERSION, appVersion: version };
}
