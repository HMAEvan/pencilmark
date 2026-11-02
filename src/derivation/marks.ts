import type { ChallengeReason, Confidence, Flag, ItemFlag, Phase } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RecordedChunk } from "../recorder/recorder";
import { holdsText as holds, type TextField } from "../recorder/textEntry";

// What the user marked on each Question, walked from the Raw log. Only the final state goes into the Attempt;
// every change, removals included, stays in the Raw log.

/** `at` is when the Flag was last added: wall-clock UTC epoch ms. */
export type FlagMark = { flag: Flag; phase: Phase; at: number };

/**
 * The Challenge of an Attempt: `on`, or turned off by a stored `bad_question` removal. `phase` and `at` (wall-clock UTC epoch ms)
 * are when it was last turned on. Null when the Question was never Challenged.
 */
export type ChallengeMark = { on: boolean; phase: Phase; at: number };

/** `at` is when the Challenge reason was last picked: wall-clock UTC epoch ms. */
export type ChallengeReasonMark = { reason: ChallengeReason; phase: Phase; at: number };

/** `at` is when the Item flag was last added: wall-clock UTC epoch ms. */
export type ItemFlagMark = { itemFlag: ItemFlag; phase: Phase; at: number };

/** The final Item flags of each Option that has any, keyed by Option id; stored, so a plain record. */
export type ItemFlags = Record<string, ItemFlagMark[]>;

/**
 * A Text entry as it ends (ADR-0010). `entry` is its place among the Phase's entries of its field. A deleted entry that
 * was not restored carries no text: what it said stays in the Raw log only.
 */
export type TextEntryMark = { entry: number; deleted: false; text: string } | { entry: number; deleted: true };

/** The Text entries of one field by Phase, so what is written after seeing the answer is kept apart; a Phase without any is absent. */
export type PhaseTextEntries = Partial<Record<Phase, TextEntryMark[]>>;

export type QuestionMarks = {
  confidence: Confidence | null;
  flags: FlagMark[];
  itemFlags: ItemFlags;
  notes: PhaseTextEntries;
  challenge: ChallengeMark | null;
  /** The Challenge reasons picked and not taken back, in the order picked. */
  challengeReasons: ChallengeReasonMark[];
  challengeStatements: PhaseTextEntries;
};

/** Every removal of a Flag, in order, as the Flag was before removal. Keyed by Question id; stored, so a plain record. */
export type RemovedFlags = Record<string, FlagMark[]>;

export const emptyMarks = (): QuestionMarks => ({ confidence: null, flags: [], itemFlags: {}, notes: {}, challenge: null, challengeReasons: [], challengeStatements: {} });

export function walkMarks(rawLog: RecordedChunk[], rules: Rules): { marks: Map<string, QuestionMarks>; removedFlags: RemovedFlags } {
  const marks = new Map<string, QuestionMarks>();
  // Kept in the order last added, so a Flag added again moves to the end.
  const flags = new Map<string, Map<Flag, FlagMark>>();
  const itemFlags = new Map<string, Map<string, Map<ItemFlag, ItemFlagMark>>>();
  const removedFlags: RemovedFlags = {};
  // Kept in the order picked; one taken back and picked again moves to the end.
  const reasons = new Map<string, Map<ChallengeReason, ChallengeReasonMark>>();
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
  // Each Text entry is replayed on its own: its text, whether it was deleted, and the text it had just before that.
  type Replayed = { text: string; deleted: boolean; before: string };
  const replayed = new Map<string, Map<number, Replayed>>();
  const entryOf = (questionId: string, field: TextField, entry: number) => {
    const key = `${questionId} ${field} ${phase}`;
    let entries = replayed.get(key);
    if (!entries) replayed.set(key, (entries = new Map()));
    let e = entries.get(entry);
    if (!e) entries.set(entry, (e = { text: "", deleted: false, before: "" }));
    return e;
  };
  /**
   * Turns the Challenge on, unless it is already on. `always`: a stored `bad_question` Flag or `appeal` event turned it on again
   * at its own time, as the bad-question Flag was re-added before the Challenge (#75), so stored Raw logs derive as before.
   */
  const raise = (questionId: string, at: number, always = false) => {
    const m = marksOf(questionId);
    if (always || !m.challenge?.on) m.challenge = { on: true, phase, at };
  };
  /** Any Challenge statement holding text turns the Challenge on (`always`: see `raise`). */
  const saveText = (questionId: string, field: TextField, entry: number, text: string, at: number, always = false) => {
    const e = entryOf(questionId, field, entry);
    e.text = text;
    if (!holds(field, text)) return;
    e.deleted = false;
    if (field === "challenge") raise(questionId, at, always);
  };

  for (const chunk of rawLog) {
    for (const event of chunk.events) {
      const at = chunk.startedAt + event.at;
      if (event.type === "submit") {
        phase = "reviewing";
      } else if (event.type === "confidence") {
        if (rules.collectConfidence) marksOf(event.questionId).confidence = event.confidence;
      } else if (event.type === "flag" && event.flag === "bad_question") {
        raise(event.questionId, at, true);
      } else if (event.type === "unflag" && event.flag === "bad_question") {
        const m = marksOf(event.questionId);
        if (m.challenge?.on) m.challenge = { ...m.challenge, on: false };
      } else if (event.type === "challengeRaise") {
        raise(event.questionId, at);
      } else if (event.type === "challengeReason") {
        let r = reasons.get(event.questionId);
        if (!r) reasons.set(event.questionId, (r = new Map()));
        // Picking a Challenge reason already picked changes nothing.
        if (!event.on) r.delete(event.reason);
        else if (!r.has(event.reason)) {
          raise(event.questionId, at);
          r.set(event.reason, { reason: event.reason, phase, at });
        }
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
        // A stored `appeal` event must give a reason; one without is ignored. It is the first Challenge statement entry of its Phase (ADR-0010), so a later one replaces it.
        const reason = event.reason.trim();
        if (reason) saveText(event.questionId, "challenge", 0, reason, at, true);
      } else if (event.type === "note") {
        saveText(event.questionId, "note", 0, event.text, at);
      } else if (event.type === "textSave") {
        saveText(event.questionId, event.field, event.entry, event.text, at);
      } else if (event.type === "textDelete") {
        const e = entryOf(event.questionId, event.field, event.entry);
        if (holds(event.field, e.text)) Object.assign(e, { before: e.text, text: "", deleted: true });
      } else if (event.type === "textRestore") {
        const e = entryOf(event.questionId, event.field, event.entry);
        if (e.deleted) Object.assign(e, { text: e.before, deleted: false });
      }
    }
  }

  for (const [key, entries] of replayed) {
    const [questionId, field, entryPhase] = key.split(" ") as [string, TextField, Phase];
    const list = [...entries]
      .sort(([a], [b]) => a - b)
      .flatMap(([entry, e]): TextEntryMark[] => (e.deleted ? [{ entry, deleted: true }] : holds(field, e.text) ? [{ entry, deleted: false, text: e.text }] : []));
    if (list.length === 0) continue;
    const m = marksOf(questionId);
    (field === "note" ? m.notes : m.challengeStatements)[entryPhase] = list;
  }
  for (const [questionId, f] of flags) marksOf(questionId).flags = [...f.values()];
  for (const [questionId, r] of reasons) marksOf(questionId).challengeReasons = [...r.values()];
  for (const [questionId, options] of itemFlags) {
    for (const [optionId, f] of options) if (f.size > 0) marksOf(questionId).itemFlags[optionId] = [...f.values()];
  }
  return { marks, removedFlags };
}
