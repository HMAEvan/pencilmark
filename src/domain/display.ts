import type { ContentBlock } from "./types";

/** The letter an Option is displayed under, from its position in the Session's Option order. */
export function letterAt(index: number): string {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

export function letterOf(optionId: string, optionOrder: string[]): string {
  const index = optionOrder.indexOf(optionId);
  return index < 0 ? "?" : letterAt(index);
}

/** Replaces each `{{opt:<optionId>}}` placeholder with the letter that Option is displayed under. */
export function substituteOptionLetters(text: string, optionOrder: string[]): string {
  return text.replace(/\{\{opt:([^}]+)\}\}/g, (_match, id: string) => letterOf(id, optionOrder));
}

export function blocksToText(blocks: ContentBlock[], optionOrder: string[]): string {
  return blocks.map((b) => substituteOptionLetters(b.text, optionOrder)).join("\n\n");
}
