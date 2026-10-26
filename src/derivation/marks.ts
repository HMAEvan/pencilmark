import type { Confidence, Flag, Phase } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RawLogChunk } from "../recorder/recorder";

// What the user marked on each Question, walked from the Raw log. Only the final state goes into the Attempt;
// every change, removals included, stays in the Raw log.

/** `at` is when the Flag was last added: wall-clock UTC epoch ms. */
export type FlagMark = { flag: Flag; phase: Phase; at: number };

export type QuestionMarks = { confidence: Confidence | null; flags: FlagMark[]; note: string | null };

export const emptyMarks = (): QuestionMarks => ({ confidence: null, flags: [], note: null });

export function walkMarks(rawLog: RawLogChunk[], rules: Rules): Map<string, QuestionMarks> {
  const confidence = new Map<string, Confidence | null>();
  const flags = new Map<string, Map<Flag, FlagMark>>();
  const notes = new Map<string, string>();
  const flagsOf = (questionId: string) => {
    let f = flags.get(questionId);
    if (!f) flags.set(questionId, (f = new Map()));
    return f;
  };
  // ADR-0008: in Exam mode the answers are revealed on submission.
  let phase: Phase = "answering";

  for (const chunk of rawLog) {
    for (const event of chunk.events) {
      const at = chunk.startedAt + event.at;
      if (event.type === "submit") {
        phase = "reviewing";
      } else if (event.type === "confidence") {
        if (rules.collectConfidence) confidence.set(event.questionId, event.confidence);
      } else if (event.type === "flag") {
        const marks = flagsOf(event.questionId);
        marks.delete(event.flag);
        marks.set(event.flag, { flag: event.flag, phase, at });
      } else if (event.type === "unflag") {
        flagsOf(event.questionId).delete(event.flag);
      } else if (event.type === "note") {
        notes.set(event.questionId, event.text);
      }
    }
  }

  const marks = new Map<string, QuestionMarks>();
  for (const questionId of new Set([...confidence.keys(), ...flags.keys(), ...notes.keys()])) {
    marks.set(questionId, {
      confidence: confidence.get(questionId) ?? null,
      flags: [...(flags.get(questionId)?.values() ?? [])],
      note: notes.get(questionId) || null,
    });
  }
  return marks;
}
