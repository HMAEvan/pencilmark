import type { Confidence, Flag, ItemFlag, Phase } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RawLogChunk } from "../recorder/recorder";

// What the user marked on each Question, walked from the Raw log. Only the final state goes into the Attempt;
// every change, removals included, stays in the Raw log.

/** `at` is when the Flag was last added: wall-clock UTC epoch ms. */
export type FlagMark = { flag: Flag; phase: Phase; at: number };

/** `at` is when the Item flag was last added: wall-clock UTC epoch ms. */
export type ItemFlagMark = { itemFlag: ItemFlag; phase: Phase; at: number };

/** The final Item flags of each Option that has any, keyed by Option id; stored, so a plain record. */
export type ItemFlags = Record<string, ItemFlagMark[]>;

/** "I think the answer is wrong", with the user's reason. `at` is wall-clock UTC epoch ms. */
export type Appeal = { reason: string; phase: Phase; at: number };

/** One Note per Phase, so a Note written after seeing the answer is kept apart; a Phase without one is absent. */
export type PhaseNotes = Partial<Record<Phase, string>>;

export type QuestionMarks = { confidence: Confidence | null; flags: FlagMark[]; itemFlags: ItemFlags; appeals: Appeal[]; notes: PhaseNotes };

/** Every removal of a Flag, in order, as the Flag was before removal. Keyed by Question id; stored, so a plain record. */
export type RemovedFlags = Record<string, FlagMark[]>;

export const emptyMarks = (): QuestionMarks => ({ confidence: null, flags: [], itemFlags: {}, appeals: [], notes: {} });

export function walkMarks(rawLog: RawLogChunk[], rules: Rules): { marks: Map<string, QuestionMarks>; removedFlags: RemovedFlags } {
  const marks = new Map<string, QuestionMarks>();
  // Kept in the order last added, so a Flag added again moves to the end.
  const flags = new Map<string, Map<Flag, FlagMark>>();
  const itemFlags = new Map<string, Map<string, Map<ItemFlag, ItemFlagMark>>>();
  const removedFlags: RemovedFlags = {};
  const marksOf = (questionId: string) => {
    let m = marks.get(questionId);
    if (!m) marks.set(questionId, (m = emptyMarks()));
    return m;
  };
  const flagsOf = (questionId: string) => {
    marksOf(questionId);
    let f = flags.get(questionId);
    if (!f) flags.set(questionId, (f = new Map()));
    return f;
  };
  const itemFlagsOf = (questionId: string, optionId: string) => {
    marksOf(questionId);
    let options = itemFlags.get(questionId);
    if (!options) itemFlags.set(questionId, (options = new Map()));
    let f = options.get(optionId);
    if (!f) options.set(optionId, (f = new Map()));
    return f;
  };
  const addFlag = (questionId: string, flag: Flag, phase: Phase, at: number) => {
    const f = flagsOf(questionId);
    f.delete(flag);
    f.set(flag, { flag, phase, at });
  };
  // ADR-0008: in Exam mode the answers are revealed on submission.
  let phase: Phase = "answering";

  for (const chunk of rawLog) {
    for (const event of chunk.events) {
      const at = chunk.startedAt + event.at;
      if (event.type === "submit") {
        phase = "reviewing";
      } else if (event.type === "confidence") {
        if (rules.collectConfidence) marksOf(event.questionId).confidence = event.confidence;
      } else if (event.type === "flag") {
        addFlag(event.questionId, event.flag, phase, at);
      } else if (event.type === "unflag") {
        const removed = flagsOf(event.questionId).get(event.flag);
        if (!removed) continue;
        flagsOf(event.questionId).delete(event.flag);
        (removedFlags[event.questionId] ??= []).push(removed);
      } else if (event.type === "itemFlag") {
        const f = itemFlagsOf(event.questionId, event.optionId);
        f.delete(event.itemFlag);
        f.set(event.itemFlag, { itemFlag: event.itemFlag, phase, at });
      } else if (event.type === "itemUnflag") {
        itemFlagsOf(event.questionId, event.optionId).delete(event.itemFlag);
      } else if (event.type === "appeal") {
        // An appeal must give a reason; one without is not an appeal.
        const reason = event.reason.trim();
        if (!reason) continue;
        addFlag(event.questionId, "bad_question", phase, at);
        marksOf(event.questionId).appeals.push({ reason, phase, at });
      } else if (event.type === "note") {
        const { notes } = marksOf(event.questionId);
        if (event.text) notes[phase] = event.text;
        else delete notes[phase];
      }
    }
  }

  for (const [questionId, f] of flags) marksOf(questionId).flags = [...f.values()];
  for (const [questionId, options] of itemFlags) {
    for (const [optionId, f] of options) if (f.size > 0) marksOf(questionId).itemFlags[optionId] = [...f.values()];
  }
  return { marks, removedFlags };
}
