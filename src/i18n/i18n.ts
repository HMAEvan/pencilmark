import { zh, type TranslationKey } from "./zh";
import { en } from "./en";
import { LANGUAGES, type Language, type LanguagePreference } from "../domain/settings";

export type { TranslationKey };

const TEXT: Record<Language, Record<TranslationKey, string>> = { zh, en };

/** The first of the browser's languages that the interface has; English when it has none of them. */
export function browserLanguage(languages: readonly string[] = typeof navigator === "undefined" ? [] : navigator.languages): Language {
  for (const tag of languages) {
    const language = LANGUAGES.find((candidate) => tag.toLowerCase().split("-")[0] === candidate);
    if (language) return language;
  }
  return "en";
}

let current: Language = browserLanguage();

export function currentLanguage(): Language {
  return current;
}

/** Switches every later `t` call. The caller re-renders so the screen follows. */
export function applyLanguage(preference: LanguagePreference): Language {
  current = preference === "browser" ? browserLanguage() : preference;
  document.documentElement.lang = current === "zh" ? "zh-CN" : "en";
  return current;
}

export function t(key: TranslationKey, params: Record<string, string | number> = {}): string {
  return TEXT[current][key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
