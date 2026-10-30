import type { Confidence, Flag, ItemFlag } from "../domain/types";
import type { Rules } from "../domain/settings";
import type { RawEvent } from "../recorder/recorder";

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
  | { kind: "appeal"; reason: string }
  /** Empty: the Note cleared. */
  | { kind: "note"; text: string }
);

/** A Visit's end at the end of the Raw log, after every event. */
export const END_OF_LOG = Number.POSITIVE_INFINITY;

/**
 * Collects the Answering timeline of each Question from the answering Phase of the timing walk. Steps are ordered by the
 * `seq` of the event behind each, so a Visit, known to be one only when it ends, still opens before what was done in it.
 * An action that changed nothing (taking back a mark never made, a Hint out of order, an Appeal without a reason) is no step,
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
  const add = (questionId: string, seq: number, step: TimelineStep) => {
    let list = steps.get(questionId);
    if (!list) steps.set(questionId, (list = []));
    list.push({ seq, step });
  };

  return {
    add,
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
        add(questionId, seq, { atMs, kind: "note", text: event.text });
      }
    },
    timelines(): Map<string, TimelineStep[]> {
      return new Map([...steps].map(([questionId, list]) => [questionId, list.sort((a, b) => a.seq - b.seq).map((s) => s.step)]));
    },
  };
}
