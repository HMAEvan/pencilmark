import type { Confidence, Flag, ItemFlag } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RawEvent } from "../recorder/recorder";
import { holdsText, type TextField } from "../recorder/textEntry";

// The Answering timeline: everything done on one Question during the answering Phase, in time order. It extends the
// trajectory, and runs on the same clock: each step's `atMs` is the active answering time spent on the Question so far,
// so time counts only while the Question is on screen (ADR-0009), never while the page is hidden, and not beyond the idle threshold.
// Built from the timing walk, which knows the clock and which stretches are Visits.

export type TimelineStep = { atMs: number } & (
  | { kind: "open" }
  | { kind: "leave" }
  /** `answer` is the complete answer after the selection or deselection. */
  | { kind: "select" | "deselect"; optionId: string; answer: string[] }
  | { kind: "itemFlag" | "itemUnflag"; optionId: string; itemFlag: ItemFlag }
  | { kind: "openHint"; level: number }
  /** Null: Confidence cleared. */
  | { kind: "confidence"; confidence: Confidence | null }
  | { kind: "flag" | "unflag"; flag: Flag }
  /** Raw logs before ADR-0010. */
  | { kind: "appeal"; reason: string }
  /**
   * Empty: the Note or Challenge statement cleared. `laterDeleted`: the entry ended deleted, so its text is not here either.
   * `entry` is the Text entry's place among the Phase's entries of its field.
   */
  | { kind: "note" | "challengeStatement"; entry: number; text: string; laterDeleted: boolean }
  /** A Text entry deleted while it held text, or restored. Adding, collapsing and editing an entry are no steps. */
  | { kind: "textDelete" | "textRestore"; field: TextField; entry: number }
  /**
   * A Writing span, from `atMs` to `endMs`, the first and last change in it. `laterDeleted`: it wrote text and none of it
   * survives in the Text entry. What it wrote is not here: deleted text is never shown, only in the Raw log.
   */
  | { kind: "writing"; endMs: number; field: TextField; entry: number; pastes: number; laterDeleted: boolean }
);

type WritingStep = Extract<TimelineStep, { kind: "writing" }>;

/** A Visit's end at the end of the Raw log, after every event. */
export const END_OF_LOG = Number.POSITIVE_INFINITY;

/**
 * Collects the Answering timeline of each Question from the answering Phase of the timing walk. Steps are ordered by the
 * `seq` of the event behind each, so a Visit, known to be one only when it ends, still opens before what was done in it.
 * An action that changed nothing (taking back a mark never made, a Hint out of order, a stored `appeal` event without a reason) is no step,
 * as it changes nothing in the Attempt.
 */
export function answeringTimelines(rules: Rules, hintCount: (questionId: string) => number) {
  const steps = new Map<string, { seq: number; step: TimelineStep }[]>();
  const flags = new Map<string, Set<Flag>>();
  const itemFlags = new Map<string, Set<string>>();
  const hintsOpened = new Map<string, number>();
  const setOf = <T>(sets: Map<string, Set<T>>, questionId: string) => {
    let set = sets.get(questionId);
    if (!set) sets.set(questionId, (set = new Set()));
    return set;
  };
  // ADR-0010: a Writing span is a stretch of changes on one Text entry; it ends at a gap longer than the Writing pause,
  // at the end of a Visit and at any other step. Each entry's text is replayed with, for each UTF-16 code unit, the span
  // that wrote it, so a span whose text is all gone by the end is known to be later deleted.
  const writingPauseMs = rules.writingPauseMs;
  let writing: { entry: string; step: WritingStep } | undefined;
  const writers = new Map<string, (WritingStep | undefined)[]>();
  // For each Text entry: its text as last saved, and what it held just before it was deleted, which a restore brings back.
  const savedText = new Map<string, string>();
  const deleted = new Map<string, { text: string; writers: (WritingStep | undefined)[] }>();
  type SavedStep = Extract<TimelineStep, { kind: "note" | "challengeStatement" }>;
  const savedSteps = new Map<string, SavedStep[]>();
  // The saves before a delete that was not restored: what they said is never shown.
  const deletedSaves = new Map<string, SavedStep[]>();
  const wrote = new Set<WritingStep>();
  const endWriting = () => (writing = undefined);
  const add = (questionId: string, seq: number, step: TimelineStep) => {
    if (step.kind !== "writing") endWriting();
    let list = steps.get(questionId);
    if (!list) steps.set(questionId, (list = []));
    list.push({ seq, step });
  };

  /** A Note or Challenge statement saved. Writing in an entry deleted earlier makes it a new entry again. */
  const saved = (questionId: string, seq: number, atMs: number, field: TextField, entry: number, text: string) => {
    const key = `${questionId} ${field} ${entry}`;
    savedText.set(key, text);
    if (holdsText(field, text)) deleted.delete(key);
    if (field === "challenge" && holdsText(field, text)) setOf(flags, questionId).add("bad_question");
    const step = { atMs, kind: field === "note" ? "note" : "challengeStatement", entry, text, laterDeleted: false } as const;
    add(questionId, seq, step);
    savedSteps.set(key, [...(savedSteps.get(key) ?? []), step]);
  };

  return {
    add,
    /** The Visit ended, and with it any Writing span. */
    endWriting,
    visit(questionId: string, open: { seq: number; atMs: number }, leave: { seq: number; atMs: number }) {
      add(questionId, open.seq, { atMs: open.atMs, kind: "open" });
      add(questionId, leave.seq, { atMs: leave.atMs, kind: "leave" });
    },
    /** A mark or Hint while answering; selections are added by the walk, which knows the answer. */
    mark(event: RawEvent, atMs: number) {
      if (!("questionId" in event) || !event.questionId) return;
      const { questionId, seq } = event;
      if (event.type === "itemFlag" || event.type === "itemUnflag") {
        const set = setOf(itemFlags, questionId);
        const key = `${event.optionId} ${event.itemFlag}`;
        if (event.type === "itemFlag") set.add(key);
        else if (!set.delete(key)) return;
        add(questionId, seq, { atMs, kind: event.type, optionId: event.optionId, itemFlag: event.itemFlag });
      } else if (event.type === "flag") {
        setOf(flags, questionId).add(event.flag);
        add(questionId, seq, { atMs, kind: "flag", flag: event.flag });
      } else if (event.type === "unflag") {
        if (setOf(flags, questionId).delete(event.flag)) add(questionId, seq, { atMs, kind: "unflag", flag: event.flag });
      } else if (event.type === "appeal") {
        const reason = event.reason.trim();
        if (!reason) return;
        setOf(flags, questionId).add("bad_question");
        add(questionId, seq, { atMs, kind: "appeal", reason });
      } else if (event.type === "openHint") {
        const opened = hintsOpened.get(questionId) ?? 0;
        if (event.level !== opened || event.level >= hintCount(questionId)) return;
        hintsOpened.set(questionId, opened + 1);
        add(questionId, seq, { atMs, kind: "openHint", level: event.level });
      } else if (event.type === "confidence") {
        if (rules.collectConfidence) add(questionId, seq, { atMs, kind: "confidence", confidence: event.confidence });
      } else if (event.type === "note") {
        saved(questionId, seq, atMs, "note", 0, event.text);
      } else if (event.type === "textSave") {
        saved(questionId, seq, atMs, event.field, event.entry, event.text);
      } else if (event.type === "textDelete") {
        const key = `${questionId} ${event.field} ${event.entry}`;
        const text = savedText.get(key) ?? "";
        if (!holdsText(event.field, text)) return;
        deleted.set(key, { text, writers: writers.get(key) ?? [] });
        deletedSaves.set(key, [...(savedSteps.get(key) ?? [])]);
        savedText.set(key, "");
        writers.set(key, []);
        add(questionId, seq, { atMs, kind: "textDelete", field: event.field, entry: event.entry });
      } else if (event.type === "textRestore") {
        const key = `${questionId} ${event.field} ${event.entry}`;
        const before = deleted.get(key);
        if (!before) return;
        deleted.delete(key);
        deletedSaves.delete(key);
        savedText.set(key, before.text);
        writers.set(key, before.writers);
        add(questionId, seq, { atMs, kind: "textRestore", field: event.field, entry: event.entry });
      } else if (event.type === "textInput") {
        const entry = `${questionId} ${event.field} ${event.entry}`;
        if (!writing || writing.entry !== entry || atMs - writing.step.endMs > writingPauseMs) {
          const step: WritingStep = { atMs, endMs: atMs, kind: "writing", field: event.field, entry: event.entry, pastes: 0, laterDeleted: false };
          add(questionId, seq, step);
          writing = { entry, step };
        }
        const { step } = writing;
        step.endMs = atMs;
        if (event.kind === "pasting") step.pastes += 1;
        if (event.inserted) wrote.add(step);
        let text = writers.get(entry);
        if (!text) writers.set(entry, (text = []));
        text.splice(event.position, event.removed.length, ...Array<WritingStep>(event.inserted.length).fill(step));
      }
    },
    timelines(): Map<string, TimelineStep[]> {
      const surviving = new Set([...writers.values()].flat());
      for (const step of wrote) step.laterDeleted = !surviving.has(step);
      // What an entry deleted and not restored said is never shown.
      for (const steps of deletedSaves.values()) for (const step of steps) Object.assign(step, { text: "", laterDeleted: true });
      return new Map([...steps].map(([questionId, list]) => [questionId, list.sort((a, b) => a.seq - b.seq).map((s) => s.step)]));
    },
  };
}
