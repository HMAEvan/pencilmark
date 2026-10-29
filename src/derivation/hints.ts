import type { Phase } from "../domain/types";
import type { RawLogChunk } from "../recorder/recorder";

// The Hints opened on each Question, walked from the Raw log. Hints open strictly one level at a time, lightest first;
// an opening out of order, repeated, or past the Question's last Hint is left in the Raw log but is not a Hint used.
// A Hint opened after the reveal is reading, like the Explanation: it has the Phase reviewing and is not help while answering.

/** `at` is wall-clock UTC epoch ms; `answeringMs` the active answering time spent on the Question when it was opened, null after the reveal. */
export type HintUse = { level: number; phase: Phase; at: number; answeringMs: number | null };

/**
 * `hintCount` gives how many Hints each Question has; `answeringMs` the answering time at each opening while answering,
 * by event `seq`, as the timing walk measured it.
 */
export function walkHints(rawLog: RawLogChunk[], hintCount: (questionId: string) => number, answeringMs: Map<number, number>): Map<string, HintUse[]> {
  const used = new Map<string, HintUse[]>();
  // ADR-0008: in Exam mode the answers are revealed on submission.
  let phase: Phase = "answering";
  for (const chunk of rawLog) {
    for (const event of chunk.events) {
      if (event.type === "submit") phase = "reviewing";
      if (event.type !== "openHint") continue;
      const uses = used.get(event.questionId) ?? [];
      if (event.level !== uses.length || event.level >= hintCount(event.questionId)) continue;
      uses.push({ level: event.level, phase, at: chunk.startedAt + event.at, answeringMs: phase === "answering" ? (answeringMs.get(event.seq) ?? 0) : null });
      used.set(event.questionId, uses);
    }
  }
  return used;
}
