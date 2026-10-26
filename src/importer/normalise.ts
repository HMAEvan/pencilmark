import type { ContentBlock } from "../domain/types";

type Comparable = {
  type: string;
  stem: ContentBlock[];
  options: { id: string; content: ContentBlock[] }[];
  answer: string[];
};

/** Unifies full-width and half-width characters, collapses whitespace and line breaks, and trims. */
export function normaliseText(text: string): string {
  return text
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ")
    .trim();
}

const blocksText = (blocks: ContentBlock[]) => normaliseText(blocks.map((b) => b.text).join("\n"));

/**
 * Comparison keys for layer-1 duplicate detection. Options compare as a set, and Option placeholders
 * compare by the content they point at, since Option ids are local to each pack.
 * `text` covers what the Question asks; `full` adds which Options are correct.
 */
export function duplicateKeys(q: Comparable): { text: string; full: string } {
  const optionText = new Map(q.options.map((o) => [o.id, blocksText(o.content)]));
  const withPlaceholders = (text: string) => text.replace(/\{\{opt:([^}]+)\}\}/g, (match, id: string) => `{{opt:${optionText.get(id) ?? match}}}`);
  const options = [...optionText.values()].map(withPlaceholders).sort();
  const answer = q.answer.map((id) => withPlaceholders(optionText.get(id) ?? id)).sort();
  const text = JSON.stringify([q.type, withPlaceholders(blocksText(q.stem)), options]);
  return { text, full: JSON.stringify([text, answer]) };
}
