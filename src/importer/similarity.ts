import { joinBlocks, normaliseText, OPTION_PLACEHOLDER, type Comparable } from "./normalise";

// Tier 2 of duplicate detection (issue #11): how alike two Questions of the same type and Option count are.

/** A run of text in a comparison: in both Questions, only in the existing one, or only in the incoming one. */
export type DiffPart = { kind: "same" | "removed" | "added"; text: string };

type ComparedOption = { optionId: string; correct: boolean };

/** An existing Option and the incoming Option it pairs with. */
export type OptionComparison = { existing: ComparedOption; incoming: ComparedOption; parts: DiffPart[] };

export type Comparison = {
  /** From 0 to 1: the share of words (or Han characters) the two Questions have in common, in order. */
  similarity: number;
  stem: DiffPart[];
  /** In the existing Question's Option order. */
  options: OptionComparison[];
  /** One per Hint level in either Question, paired by level. Hints never count towards `similarity`. */
  hints: DiffPart[][];
};

/** A word, a Han character or a punctuation mark: `key` is compared, `text` (with the spacing after it) is shown. */
type Token = { key: string; text: string };

function tokens(text: string): Token[] {
  return [...text.matchAll(/(\p{Script=Han}|[\p{L}\p{N}]+|\S)\s*/gu)].map((m) => ({ key: m[1]!, text: m[0] }));
}

/** Normalised text, with Option placeholders replaced by the Option they point at, since Option ids are local to each pack. */
function questionTokens(q: Comparable) {
  const optionText = new Map(q.options.map((o) => [o.id, normaliseText(joinBlocks(o.content))]));
  const text = (raw: string) => tokens(normaliseText(raw).replace(OPTION_PLACEHOLDER, (match, id: string) => optionText.get(id) ?? match));
  return { stem: text(joinBlocks(q.stem)), options: q.options.map((o) => text(joinBlocks(o.content))), hints: (q.hints ?? []).map((h) => text(joinBlocks(h))) };
}

/** Tokens in common, an upper bound on the longest common subsequence that is cheap to compute. */
function sharedCount(a: Token[], b: Token[]): number {
  const counts = new Map<string, number>();
  for (const t of a) counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
  let shared = 0;
  for (const t of b) {
    const left = counts.get(t.key) ?? 0;
    if (left > 0) {
      shared++;
      counts.set(t.key, left - 1);
    }
  }
  return shared;
}

/** The longest common subsequence of two token lists, as a diff. */
function diff(a: Token[], b: Token[]): { same: number; parts: DiffPart[] } {
  const lengths = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] = a[i]!.key === b[j]!.key ? lengths[i + 1]![j + 1]! + 1 : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  // Within each changed stretch, the old text comes before the new.
  const parts: DiffPart[] = [];
  const changed = { removed: "", added: "" };
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else if (text) parts.push({ kind, text });
  };
  const flush = () => {
    push("removed", changed.removed);
    push("added", changed.added);
    changed.removed = changed.added = "";
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i]!.key === b[j]!.key) {
      flush();
      // The incoming spacing is shown; spacing never counts as a difference.
      push("same", b[j]!.text);
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && lengths[i + 1]![j]! >= lengths[i]![j + 1]!)) {
      changed.removed += a[i++]!.text;
    } else {
      changed.added += b[j++]!.text;
    }
  }
  flush();
  return { same: lengths[0]![0]!, parts };
}

/** The share of tokens in common, out of both lists' tokens together. */
const ratio = (same: number, a: number, b: number) => (a + b === 0 ? 1 : (2 * same) / (a + b));

/** Pairs each existing Option with an incoming one, most alike first. Both lists have the same length. */
function pairOptions(existing: Token[][], incoming: Token[][]): number[] {
  const candidates = existing.flatMap((a, i) => incoming.map((b, j) => ({ i, j, score: ratio(sharedCount(a, b), a.length, b.length) })));
  candidates.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);
  const pairing = new Array<number>(existing.length).fill(-1);
  const taken = new Set<number>();
  for (const { i, j } of candidates) {
    if (pairing[i] !== -1 || taken.has(j)) continue;
    pairing[i] = j;
    taken.add(j);
  }
  return pairing;
}

/**
 * Compares an incoming Question with an existing one, or returns undefined when their similarity is below `threshold`.
 * The caller makes sure both have the same type and Option count.
 */
export function compareQuestions(existing: Comparable, incoming: Comparable, threshold: number): Comparison | undefined {
  const a = questionTokens(existing);
  const b = questionTokens(incoming);
  const total = [a.stem, ...a.options].reduce((n, t) => n + t.length, 0) + [b.stem, ...b.options].reduce((n, t) => n + t.length, 0);
  const pairing = pairOptions(a.options, b.options);

  // Cheap bound first: most Questions in the bank are nowhere near alike.
  const bound = sharedCount(a.stem, b.stem) + pairing.reduce((n, j, i) => n + sharedCount(a.options[i]!, b.options[j]!), 0);
  if (ratio(bound, total, 0) < threshold) return undefined;

  const stem = diff(a.stem, b.stem);
  const options = pairing.map((j, i) => ({ i, j, ...diff(a.options[i]!, b.options[j]!) }));
  const same = stem.same + options.reduce((n, o) => n + o.same, 0);
  const similarity = ratio(same, total, 0);
  if (similarity < threshold) return undefined;

  const compared = (q: Comparable, index: number): ComparedOption => ({ optionId: q.options[index]!.id, correct: q.answer.includes(q.options[index]!.id) });
  return {
    similarity,
    stem: stem.parts,
    options: options.map(({ i, j, parts }) => ({ existing: compared(existing, i), incoming: compared(incoming, j), parts })),
    hints: Array.from({ length: Math.max(a.hints.length, b.hints.length) }, (_, level) => diff(a.hints[level] ?? [], b.hints[level] ?? []).parts),
  };
}
