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
  for (const part of parts) {
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
