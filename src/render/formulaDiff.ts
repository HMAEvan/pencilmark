import type { DiffPart } from "../importer/similarity";
import { mathSpans } from "./maths";

/**
 * Word differences cut text at word boundaries, which can fall inside a formula (`$\frac{1}{2}$` against `$\frac{1}{3}$`).
 * A formula cut in two would show as source text on both sides, so any run of parts whose edges fall inside a formula,
 * in the existing text or in the incoming text, is merged into one changed stretch: the whole existing text struck, the whole incoming text underlined.
 * Text outside formulas keeps its word-level differences.
 */
export function keepFormulasWhole(parts: DiffPart[]): DiffPart[] {
  const old = parts.filter((p) => p.kind !== "added").map((p) => p.text).join("");
  const now = parts.filter((p) => p.kind !== "removed").map((p) => p.text).join("");
  const inside = (spans: { start: number; end: number }[], at: number) => spans.some((s) => at > s.start && at < s.end);
  const oldSpans = mathSpans(old);
  const nowSpans = mathSpans(now);

  const result: DiffPart[] = [];
  let oldAt = 0;
  let nowAt = 0;
  let group: DiffPart[] = [];
  let groupOld = "";
  let groupNow = "";
  for (const part of splitAtFormulaEdges(parts, oldSpans, nowSpans)) {
    group.push(part);
    if (part.kind !== "added") {
      oldAt += part.text.length;
      groupOld += part.text;
    }
    if (part.kind !== "removed") {
      nowAt += part.text.length;
      groupNow += part.text;
    }
    if (inside(oldSpans, oldAt) || inside(nowSpans, nowAt)) continue;
    if (group.length === 1) result.push(part);
    else {
      if (groupOld) result.push({ kind: "removed", text: groupOld });
      if (groupNow) result.push({ kind: "added", text: groupNow });
    }
    group = [];
    groupOld = groupNow = "";
  }
  return result;
}

/**
 * The word difference splits a formula into its symbols, so an unchanged run can reach from plain text into a formula ("energy is $\frac{1}{").
 * Cut unchanged runs where a formula starts or ends, so only the formula, not the plain text around it, joins a changed stretch.
 */
function splitAtFormulaEdges(parts: DiffPart[], oldSpans: { start: number; end: number }[], nowSpans: { start: number; end: number }[]): DiffPart[] {
  const edges = (spans: { start: number; end: number }[]) => spans.flatMap((s) => [s.start, s.end]);
  const oldEdges = edges(oldSpans);
  const nowEdges = edges(nowSpans);
  const split: DiffPart[] = [];
  let oldAt = 0;
  let nowAt = 0;
  for (const part of parts) {
    const length = part.text.length;
    if (part.kind === "same") {
      const cuts = new Set<number>();
      for (const edge of oldEdges) if (edge > oldAt && edge < oldAt + length) cuts.add(edge - oldAt);
      for (const edge of nowEdges) if (edge > nowAt && edge < nowAt + length) cuts.add(edge - nowAt);
      let from = 0;
      for (const cut of [...cuts].sort((a, b) => a - b)) {
        split.push({ kind: "same", text: part.text.slice(from, cut) });
        from = cut;
      }
      split.push({ kind: "same", text: part.text.slice(from) });
    } else split.push(part);
    if (part.kind !== "added") oldAt += length;
    if (part.kind !== "removed") nowAt += length;
  }
  return split;
}
