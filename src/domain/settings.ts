import { version } from "../../package.json";
import type { Storage } from "../storage/storage";

// Preferences and the snapshot of them that each Session keeps (issue #1, Data model).
// The settings screen arrives with issue #14; until then only the language can be changed.

export const SCHEMA_VERSION = 1;

/** Preferences that change what Derivation computes. Derivation reads only these. */
export type Rules = {
  idleThresholdMs: number;
  flickThresholdMs: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  collectConfidence: boolean;
};

export type TimePrecision = "seconds" | "milliseconds";

export const LANGUAGES = ["zh", "en"] as const;
/** An interface language. */
export type Language = (typeof LANGUAGES)[number];
/** The language preference: a Language, or "browser" to follow the browser's language. */
export type LanguagePreference = Language | "browser";

/** Every other preference: what is shown and how. */
export type Display = {
  sessionTimer: "shown" | "hidden";
  questionTimer: "shown" | "hidden";
  /** How precisely times are shown on screen: "00:07" or "00:07.247". The Digest always shows milliseconds. */
  timePrecision: TimePrecision;
  multipleAnswerScore: "partial" | "all_or_nothing";
  language: LanguagePreference;
  similarityThreshold: number;
  backupReminderDays: number;
};

export type Preferences = { rules: Rules; display: Display };

export type SettingsSnapshot = Preferences & { schemaVersion: number; appVersion: string };

export const DEFAULT_PREFERENCES: Preferences = {
  rules: { idleThresholdMs: 60_000, flickThresholdMs: 500, shuffleQuestions: true, shuffleOptions: true, collectConfidence: true },
  display: {
    sessionTimer: "shown",
    questionTimer: "shown",
    timePrecision: "seconds",
    multipleAnswerScore: "partial",
    language: "browser",
    similarityThreshold: 0.9,
    backupReminderDays: 7,
  },
};

export function settingsSnapshot(preferences: Preferences = DEFAULT_PREFERENCES): SettingsSnapshot {
  return { ...structuredClone(preferences), schemaVersion: SCHEMA_VERSION, appVersion: version };
}

/** The `meta/preferences` document. It holds only what the user has changed; everything else is the default. */
export type PreferencesDocument = { id: "preferences"; rules?: Partial<Rules>; display?: Partial<Display>; source: "user"; updatedAt: number };

/** The current preferences: `meta/preferences` over the defaults. */
export async function loadPreferences(storage: Storage): Promise<Preferences> {
  const stored = await storage.get<PreferencesDocument>("meta", "preferences");
  return { rules: { ...DEFAULT_PREFERENCES.rules, ...stored?.rules }, display: { ...DEFAULT_PREFERENCES.display, ...stored?.display } };
}

/** Stores a change to display preferences in `meta/preferences`, keeping every other stored preference. */
export async function saveDisplayPreferences(storage: Storage, change: Partial<Display>, now = Date.now()): Promise<void> {
  const stored = await storage.get<PreferencesDocument>("meta", "preferences");
  const next: PreferencesDocument = { ...stored, id: "preferences", display: { ...stored?.display, ...change }, source: "user", updatedAt: now };
  await storage.set("meta", next);
}
