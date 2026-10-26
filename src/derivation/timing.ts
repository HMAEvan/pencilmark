import type { RawLogChunk } from "../recorder/recorder";
import type { Rules } from "../domain/settings";

// Answering time, answers and trajectories per Question, walked from the Raw log. Monotonic `at` is only compared within its own chunk,
// and the gaps between chunks (the page hidden or closed) never count.
// ADR-0009: with one Question on screen, opening it is interacting with it, so time belongs to the open Question
// until another is opened. Case screens, where the last sub-Question interacted with gets the time, come later.

/** A stretch with no interaction longer than the idle threshold; the part beyond the threshold is not counted. */
export type ExcludedIdle = { chunk: number; at: number; excludedMs: number };

export type QuestionTiming = {
  answeringRawMs: number;
  answeringActiveMs: number;
  visits: number;
  excludedIdle: ExcludedIdle[];
};

export type SessionTotals = {
  /** Foreground time before the answers were revealed. */
  answeringRawMs: number;
  /** Raw time less excluded idle time. Equals the Questions' active answering time plus navigation time. */
  answeringActiveMs: number;
  /** Active time no Question was open, including passes over a Question too short to be a Visit. */
  navigationMs: number;
  excludedIdleMs: number;
};

/**
 * The wall-clock time between one chunk ending and the next starting: informational only, never counted.
 * A wall clock that went backwards makes the length unknown. A forward jump cannot be told from a long absence.
 */
export type ChunkGap = { after: number; wallMs: number | null; clockAnomaly: boolean };

/** An answer change after the first choice. Times are active answering time spent on the Question. */
export type AnswerChange = { answer: string[]; atMs: number; dwellMs: number };

export type Trajectory = { firstChoice: string[] | null; timeToFirstChoiceMs: number | null; changes: AnswerChange[] };

export type RawLogWalk = {
  questions: Map<string, QuestionTiming>;
  /** Each Question's answer when the answers were revealed. */
  answers: Map<string, string[]>;
  trajectories: Map<string, Trajectory>;
  totals: SessionTotals;
  chunkGaps: ChunkGap[];
};

export const emptyTiming = (): QuestionTiming => ({ answeringRawMs: 0, answeringActiveMs: 0, visits: 0, excludedIdle: [] });

export const emptyTrajectory = (): Trajectory => ({ firstChoice: null, timeToFirstChoiceMs: null, changes: [] });

export function walkRawLog(rawLog: RawLogChunk[], rules: Rules): RawLogWalk {
  const questions = new Map<string, QuestionTiming>();
  const totals: SessionTotals = { answeringRawMs: 0, answeringActiveMs: 0, navigationMs: 0, excludedIdleMs: 0 };
  const timingOf = (questionId: string) => {
    let timing = questions.get(questionId);
    if (!timing) questions.set(questionId, (timing = emptyTiming()));
    return timing;
  };

  let visit: (Omit<QuestionTiming, "visits"> & { questionId: string }) | undefined;
  const closeVisit = () => {
    if (!visit) return;
    if (visit.answeringRawMs < rules.flickThresholdMs) {
      totals.navigationMs += visit.answeringActiveMs;
    } else {
      const timing = timingOf(visit.questionId);
      timing.answeringRawMs += visit.answeringRawMs;
      timing.answeringActiveMs += visit.answeringActiveMs;
      timing.visits += 1;
      timing.excludedIdle.push(...visit.excludedIdle);
    }
    visit = undefined;
  };
  let answering = true;

  const answers = new Map<string, string[]>();
  const trajectories = new Map<string, Trajectory>();
  const lastChoiceMs = new Map<string, number>();
  const answerChanged = (questionId: string, answer: string[]) => {
    answers.set(questionId, answer);
    const atMs = (questions.get(questionId)?.answeringActiveMs ?? 0) + (visit?.questionId === questionId ? visit.answeringActiveMs : 0);
    let trajectory = trajectories.get(questionId);
    if (!trajectory) trajectories.set(questionId, (trajectory = emptyTrajectory()));
    if (trajectory.firstChoice === null) {
      trajectory.firstChoice = answer;
      trajectory.timeToFirstChoiceMs = atMs;
    } else {
      trajectory.changes.push({ answer, atMs, dwellMs: atMs - lastChoiceMs.get(questionId)! });
    }
    lastChoiceMs.set(questionId, atMs);
  };

  for (const chunk of rawLog) {
    let prevAt = 0;
    const elapse = (until: number) => {
      const from = prevAt;
      const rawMs = until - from;
      prevAt = until;
      if (!answering) return;
      const excludedMs = Math.max(0, rawMs - rules.idleThresholdMs);
      const activeMs = rawMs - excludedMs;
      totals.answeringRawMs += rawMs;
      totals.answeringActiveMs += activeMs;
      totals.excludedIdleMs += excludedMs;
      if (visit) {
        visit.answeringRawMs += rawMs;
        visit.answeringActiveMs += activeMs;
        if (excludedMs > 0) visit.excludedIdle.push({ chunk: chunk.n, at: from, excludedMs });
      } else {
        totals.navigationMs += activeMs;
      }
    };
    for (const event of chunk.events) {
      elapse(event.at);
      if (!answering) continue;
      if (event.type === "navigate") {
        closeVisit();
        visit = { questionId: event.questionId, answeringRawMs: 0, answeringActiveMs: 0, excludedIdle: [] };
      } else if (event.type === "select") {
        answerChanged(event.questionId, [event.optionId]);
      } else if (event.type === "deselect") {
        answerChanged(event.questionId, (answers.get(event.questionId) ?? []).filter((id) => id !== event.optionId));
      } else if (event.type === "submit") {
        closeVisit();
        answering = false;
      }
    }
    elapse(Math.max(chunk.activeMs, prevAt));
  }
  closeVisit();
  return { questions, answers, trajectories, totals, chunkGaps: chunkGaps(rawLog) };
}

function chunkGaps(rawLog: RawLogChunk[]): ChunkGap[] {
  return rawLog.slice(1).map((chunk, i) => {
    const prev = rawLog[i]!;
    const wallMs = chunk.startedAt - (prev.startedAt + prev.activeMs);
    return wallMs < 0 ? { after: prev.n, wallMs: null, clockAnomaly: true } : { after: prev.n, wallMs, clockAnomaly: false };
  });
}

export const excludedIdleMs = (timing: QuestionTiming) => timing.excludedIdle.reduce((sum, idle) => sum + idle.excludedMs, 0);
