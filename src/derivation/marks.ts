import type { Confidence, Flag, Phase } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RawLogChunk } from "../recorder/recorder";

// What the user marked on each Question, walked from the Raw log. Only the final state goes into the Attempt;
// every change, removals included, stays in the Raw log.

/** `at` is when the Flag was last added: wall-clock UTC epoch ms. */
export type FlagMark = { flag: Flag; phase: Phase; at: number };

/** One Note per Phase, so a Note written after seeing the answer is kept apart; a Phase without one is absent. */
export type PhaseNotes = Partial<Record<Phase, string>>;

export type QuestionMarks = { confidence: Confidence | null; flags: FlagMark[]; notes: PhaseNotes };

/** Every removal of a Flag, in order, as the Flag was before removal. Keyed by Question id; stored, so a plain record. */
export type RemovedFlags = Record<string, FlagMark[]>;

export const emptyMarks = (): QuestionMarks => ({ confidence: null, flags: [], notes: {} });

export function walkMarks(rawLog: RawLogChunk[], rules: Rules): { marks: Map<string, QuestionMarks>; removedFlags: RemovedFlags } {
  const confidence = new Map<string, Confidence | null>();
  const flags = new Map<string, Map<Flag, FlagMark>>();
  const notes = new Map<string, PhaseNotes>();
  const removedFlags: RemovedFlags = {};
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
        const removed = flagsOf(event.questionId).get(event.flag);
        if (!removed) continue;
        flagsOf(event.questionId).delete(event.flag);
        (removedFlags[event.questionId] ??= []).push(removed);
      } else if (event.type === "note") {
        const phaseNotes = notes.get(event.questionId) ?? {};
        if (event.text) phaseNotes[phase] = event.text;
        else delete phaseNotes[phase];
        notes.set(event.questionId, phaseNotes);
      }
    }
  }

  const marks = new Map<string, QuestionMarks>();
  for (const questionId of new Set([...confidence.keys(), ...flags.keys(), ...notes.keys()])) {
    marks.set(questionId, {
      confidence: confidence.get(questionId) ?? null,
      flags: [...(flags.get(questionId)?.values() ?? [])],
      notes: notes.get(questionId) ?? {},
    });
  }
  return { marks, removedFlags };
}
