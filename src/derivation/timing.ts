import type { RecordedChunk } from "../recorder/recorder";
import type { Rules } from "../domain/settings";

// Time, answers and trajectories per Question, walked from the Raw log. Monotonic `at` is only compared within its own chunk,
// and the gaps between chunks (the page hidden or closed) never count.
// ADR-0009: with one Question on screen, opening it is interacting with it, so time belongs to the open Question
// until another is opened. Case screens, where the last sub-Question interacted with gets the time, come later.
// ADR-0008: the reviewing Phase starts when the answers are revealed, in Exam mode at submission. From then on, time
// belongs to the Question occupying the main part of the review page.

/** A stretch with no interaction longer than the idle threshold; the part beyond the threshold is not counted. */
export type ExcludedIdle = { chunk: number; at: number; excludedMs: number };

export type QuestionTiming = {
  answeringRawMs: number;
  answeringActiveMs: number;
  /** Visits while answering. */
  visits: number;
  /** Idle excluded from answering time, the time an Override corrects. */
  excludedIdle: ExcludedIdle[];
  reviewingRawMs: number;
  reviewingActiveMs: number;
};

export type SessionTotals = {
  /** Foreground time before the answers were revealed. */
  answeringRawMs: number;
  /** Raw time less excluded idle time. Equals the Questions' active answering time plus navigation time. */
  answeringActiveMs: number;
  /** Active time no Question was open, including passes over a Question too short to be a Visit. */
  navigationMs: number;
  excludedIdleMs: number;
  /** Foreground time after the answers were revealed. */
  reviewingRawMs: number;
  /** Raw time less excluded idle time. Equals the Questions' active reviewing time plus reviewing navigation time. */
  reviewingActiveMs: number;
  /** Active reviewing time no Question occupied the main part of the screen, including passes too short to be a Visit. */
  reviewingNavigationMs: number;
  reviewingExcludedIdleMs: number;
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
  /** For each Hint opened while answering, by event `seq`: the active answering time spent on its Question so far. */
  hintAnsweringMs: Map<number, number>;
  totals: SessionTotals;
  chunkGaps: ChunkGap[];
};

export const emptyTiming = (): QuestionTiming => ({ answeringRawMs: 0, answeringActiveMs: 0, visits: 0, excludedIdle: [], reviewingRawMs: 0, reviewingActiveMs: 0 });

export const emptyTrajectory = (): Trajectory => ({ firstChoice: null, timeToFirstChoiceMs: null, changes: [] });

/** How a Question's answer changes when an Option is selected; each question type has its own answer state. Returns `answer` itself when nothing changes. */
export type SelectOption = (questionId: string, answer: string[], optionId: string) => string[];

type Phase = "answering" | "reviewing";

export function walkRawLog(rawLog: RecordedChunk[], rules: Rules, select: SelectOption): RawLogWalk {
  const questions = new Map<string, QuestionTiming>();
  const totals: SessionTotals = {
    answeringRawMs: 0,
    answeringActiveMs: 0,
    navigationMs: 0,
    excludedIdleMs: 0,
    reviewingRawMs: 0,
    reviewingActiveMs: 0,
    reviewingNavigationMs: 0,
    reviewingExcludedIdleMs: 0,
  };
  const timingOf = (questionId: string) => {
    let timing = questions.get(questionId);
    if (!timing) questions.set(questionId, (timing = emptyTiming()));
    return timing;
  };
  const addNavigation = (phase: Phase, ms: number) => {
    if (phase === "answering") totals.navigationMs += ms;
    else totals.reviewingNavigationMs += ms;
  };

  let phase: Phase = "answering";
  let visit: { phase: Phase; questionId: string; rawMs: number; activeMs: number; excludedIdle: ExcludedIdle[] } | undefined;
  const closeVisit = () => {
    if (!visit) return;
    if (visit.rawMs < rules.flickThresholdMs) {
      addNavigation(visit.phase, visit.activeMs);
    } else if (visit.phase === "answering") {
      const timing = timingOf(visit.questionId);
      timing.answeringRawMs += visit.rawMs;
      timing.answeringActiveMs += visit.activeMs;
      timing.visits += 1;
      timing.excludedIdle.push(...visit.excludedIdle);
    } else {
      const timing = timingOf(visit.questionId);
      timing.reviewingRawMs += visit.rawMs;
      timing.reviewingActiveMs += visit.activeMs;
    }
    visit = undefined;
  };
  const openVisit = (questionId: string | undefined) => {
    closeVisit();
    if (questionId) visit = { phase, questionId, rawMs: 0, activeMs: 0, excludedIdle: [] };
  };

  const answers = new Map<string, string[]>();
  const trajectories = new Map<string, Trajectory>();
  const hintAnsweringMs = new Map<number, number>();
  const lastChoiceMs = new Map<string, number>();
  const answeringMsSoFar = (questionId: string) => (questions.get(questionId)?.answeringActiveMs ?? 0) + (visit?.questionId === questionId ? visit.activeMs : 0);
  const answerChanged = (questionId: string, answer: string[]) => {
    answers.set(questionId, answer);
    const atMs = answeringMsSoFar(questionId);
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
      const excludedMs = Math.max(0, rawMs - rules.idleThresholdMs);
      const activeMs = rawMs - excludedMs;
      if (phase === "answering") {
        totals.answeringRawMs += rawMs;
        totals.answeringActiveMs += activeMs;
        totals.excludedIdleMs += excludedMs;
      } else {
        totals.reviewingRawMs += rawMs;
        totals.reviewingActiveMs += activeMs;
        totals.reviewingExcludedIdleMs += excludedMs;
      }
      if (visit) {
        visit.rawMs += rawMs;
        visit.activeMs += activeMs;
        if (excludedMs > 0) visit.excludedIdle.push({ chunk: chunk.n, at: from, excludedMs });
      } else {
        addNavigation(phase, activeMs);
      }
    };
    for (const event of chunk.events) {
      elapse(event.at);
      if (phase === "answering") {
        if (event.type === "navigate") {
          openVisit(event.questionId);
        } else if (event.type === "select") {
          const answer = answers.get(event.questionId) ?? [];
          const next = select(event.questionId, answer, event.optionId);
          if (next !== answer) answerChanged(event.questionId, next);
        } else if (event.type === "deselect") {
          answerChanged(event.questionId, (answers.get(event.questionId) ?? []).filter((id) => id !== event.optionId));
        } else if (event.type === "openHint") {
          hintAnsweringMs.set(event.seq, answeringMsSoFar(event.questionId));
        } else if (event.type === "submit") {
          closeVisit();
          phase = "reviewing";
        }
      } else if (event.type === "onScreen") {
        openVisit(event.questionId);
      }
    }
    elapse(Math.max(chunk.activeMs, prevAt));
  }
  closeVisit();
  return { questions, answers, trajectories, hintAnsweringMs, totals, chunkGaps: chunkGaps(rawLog) };
}

function chunkGaps(rawLog: RecordedChunk[]): ChunkGap[] {
  return rawLog.slice(1).map((chunk, i) => {
    const prev = rawLog[i]!;
    const wallMs = chunk.startedAt - (prev.startedAt + prev.activeMs);
    return wallMs < 0 ? { after: prev.n, wallMs: null, clockAnomaly: true } : { after: prev.n, wallMs, clockAnomaly: false };
  });
}

export const excludedIdleMs = (timing: QuestionTiming) => timing.excludedIdle.reduce((sum, idle) => sum + idle.excludedMs, 0);
