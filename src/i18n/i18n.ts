import { zh, type TranslationKey } from "./zh";

export type { TranslationKey };

// Chinese only until the English interface lands (issue #10).
export function t(key: TranslationKey, params: Record<string, string | number> = {}): string {
  return zh[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}
