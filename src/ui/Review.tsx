import { useEffect, useRef, useState } from "preact/hooks";
import type { Flag, Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import { RichText } from "./RichText";
import { t } from "../i18n/i18n";
import { openRecorder, type RawEventBody, type Recorder } from "../recorder/recorder";
import { loadDerivedSession, recordReviewMark, setOverride, type Attempt, type Derivation, type Override } from "../session/sessions";
import { AppealForm, FlagButtons, HintPanel, ItemFlagMarks, NoteField } from "./Marks";
import { digestWithOverrides, finalValues, type FinalValues, type OverrideValues } from "../derivation/derivation";
import { excludedIdleMs } from "../derivation/timing";
import { buildAnswerPack } from "../exports/answerPack";
import { gradingSkillText } from "../exports/skills";
import { CopyButton } from "./CopyButton";
import { AnsweringTime, TimeOverrideField } from "./AnsweringTime";
import { formatDateTime, formatDuration, formatScore, timePrecisionOf } from "./format";
import { DEFAULT_PREFERENCES, type TimePrecision } from "../domain/settings";
import { isGraded, questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { useRecorder } from "./useRecorder";

type Loaded = {
  session: Session;
  set: QuestionSet;
  derivation: Derivation;
  attempts: Attempt[];
  questions: Map<string, Question>;
  overrides: Map<string, Override>;
  recorder: Recorder;
};

/** Pass the page's Recorder when reloading after a mark, so only one Recorder appends to the Session. */
async function load(sessionId: string, openedRecorder?: Recorder): Promise<Loaded | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  // Only a submitted Session has a review page to record.
  if (!session?.currentDerivationId) return undefined;
  // Opened first: it seals a buffer a killed review page left behind, so that its reviewing time and marks are derived too.
  const recorder = openedRecorder ?? (await openRecorder(storage, session.id));
  const derived = await loadDerivedSession(storage, sessionId);
  if (!derived) return undefined;
  return { ...derived, questions: new Map(derived.questions.map((q) => [q.id, q])), recorder };
}

/** The Question whose card covers the middle of the viewport: the one occupying the main part of the screen. */
function questionOnScreen(): string | undefined {
  const middle = innerHeight / 2;
  for (const card of document.querySelectorAll<HTMLElement>("[data-question-id]")) {
    const { top, bottom } = card.getBoundingClientRect();
    if (top <= middle && bottom > middle) return card.dataset.questionId;
  }
  return undefined;
}

/** Records each change of the Question occupying the main part of the screen. Returns the one on screen now. */
function useOnScreenRecording(recorderRef: { current: Recorder | undefined }, ready: boolean) {
  const onScreen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const questionId = questionOnScreen();
      if (questionId === onScreen.current) return;
      onScreen.current = questionId;
      recorderRef.current?.append({ type: "onScreen", ...(questionId && { questionId }) });
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(check);
    };
    check();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
    };
  }, [ready]);
  return onScreen;
}

function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url));
}

/**
 * Setting an Override on a derived time or result, shown under a Question. The derived value and the Raw log are never changed.
 * A Question that is not graded has no result to correct.
 */
function OverrideEditor({ attempt, final, graded, idleThresholdMs, precision, onSave }: { attempt: Attempt; final: FinalValues; graded: boolean; idleThresholdMs: number; precision: TimePrecision; onSave: (values: OverrideValues) => void }) {
  const idle = attempt.timing.excludedIdle;
  // Answering time no longer changes after the reveal, so the derived time recorded here adds nothing on top.
  const saveTime = (ms: number | undefined) =>
    onSave(ms === undefined ? { answeringActiveMs: undefined, answeringActiveMsAtOverride: undefined } : { answeringActiveMs: ms, answeringActiveMsAtOverride: attempt.timing.answeringActiveMs });
  return (
    <details class="override">
      <summary>{t(idle.length > 0 ? "review.idleExcluded" : graded ? "review.overrideOpen" : "review.overrideTimeOpen", { time: formatDuration(excludedIdleMs(attempt.timing), precision) })}</summary>
      {idle.length > 0 && <p class="muted">{t("review.idleExplained", { seconds: idleThresholdMs / 1000 })}</p>}
      <p class="muted">{t("review.derivedTime", { time: formatDuration(attempt.timing.answeringActiveMs, precision), raw: formatDuration(attempt.timing.answeringRawMs, precision) })}</p>
      <TimeOverrideField overridden={final.overridden.includes("answeringActiveMs")} onSave={saveTime} />
      {graded && (
        <div class="actions">
          {final.correct !== true && (
            <button class="secondary" onClick={() => onSave({ correct: true })}>
              {t("review.markCorrect")}
            </button>
          )}
          {final.correct !== false && (
            <button class="secondary" onClick={() => onSave({ correct: false })}>
              {t("review.markWrong")}
            </button>
          )}
          {final.overridden.includes("correct") && (
            <button class="secondary" onClick={() => onSave({ correct: undefined })}>
              {t("review.restoreResult")}
            </button>
          )}
        </div>
      )}
    </details>
  );
}

/** Letters in displayed order, whatever order the Options were selected in. */
function answerText(answer: string[], optionOrder: string[]): string {
  if (!answer.length) return t("review.blank");
  return answer.map((id) => letterOf(id, optionOrder)).sort().join(t("review.letterSeparator"));
}

function ResultMark({ final, multiple, partial }: { final: FinalValues; multiple: boolean; partial: boolean }) {
  if (final.correct === null) return <span class="muted">{t("review.notGraded")}</span>;
  return (
    <>
      <span class={final.correct ? "ok" : "bad"}>{t(final.correct ? "review.correct" : "review.wrong")}</span>
      {multiple && partial && <span class="muted">{t("review.partialScore", { score: formatScore(final.partialScore ?? 0) })}</span>}
    </>
  );
}

export function Review({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [marking, setMarking] = useState(false);
  const [includeRawLog, setIncludeRawLog] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);

  // Time on the review page is the reviewing Phase (ADR-0008), recorded into the same Raw log as answering.
  const recorderRef = useRecorder(async () => {
    const result = await load(sessionId);
    setLoaded(result ?? null);
    if (!result) return;
    const { recorder } = result;
    // Recorded even when no Question is known to be on screen yet, so a Question from an earlier visit to the page gets no more time.
    return { recorder, afterShow: () => recorder.append({ type: "onScreen", ...(onScreen.current && { questionId: onScreen.current }) }) };
  }, sessionId);
  const onScreen = useOnScreenRecording(recorderRef, !!loaded);

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { session, set, derivation, attempts, questions, overrides, recorder } = loaded;
  // A display preference: it changes what is shown, never what is stored. Sessions from before snapshots used the default.
  const precision = timePrecisionOf(session);
  const partial = (session.settings?.display.multipleAnswerScore ?? DEFAULT_PREFERENCES.display.multipleAnswerScore) === "partial";
  // Questions that are not graded count towards neither the score nor the total.
  const finals = attempts.filter((a) => isGraded(questions.get(a.questionId)!)).map((a) => finalValues(a, overrides.get(a.questionId)));
  const ungraded = attempts.length - finals.length;
  // A mark after reveal has the Phase reviewing (ADR-0008); the Session is derived again so the Attempts and Digest include it.
  const mark = async (event: RawEventBody) => {
    setMarking(true);
    try {
      await recordReviewMark(storage, session, set, recorder, event);
      const reloaded = await load(sessionId, recorder);
      if (reloaded) setLoaded(reloaded);
    } finally {
      setMarking(false);
    }
  };
  const saveOverride = async (questionId: string, values: OverrideValues) => {
    const saved = await setOverride(storage, session.id, questionId, values);
    setLoaded({ ...loaded, overrides: new Map(overrides).set(questionId, saved) });
  };
  // The copied Digest uses the Overrides set since the derivation, in place of the derived values.
  const digest = overrides.size ? digestWithOverrides({ title: set.title, questions: [...questions.values()], rules: derivation.parameters }, { attempts, removedFlags: derivation.removedFlags }, overrides) : derivation.digest;
  const downloadAnswerPack = async () => {
    setDownloadFailed(false);
    try {
      // Exporting saves what there is now: sealing first puts this visit, and the export itself, in the Answer pack (ADR-0001).
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.append({ type: "exportAnswerPack", includeRawLog });
        await recorder.checkpoint();
      }
      const pack = await buildAnswerPack(storage, session.id, { includeRawLog });
      if (!pack) throw new Error(`Session ${session.id} has no derivation`);
      downloadJson(`pencilmark-answer-pack-${session.id}.json`, pack);
    } catch (e) {
      console.error("Building the Answer pack failed", e);
      setDownloadFailed(true);
    }
  };
  const toggleRationale = (questionId: string, optionId: string, open: boolean) =>
    recorderRef.current?.append({ type: open ? "expandRationale" : "collapseRationale", questionId, optionId });

  return (
    <main>
      <h1>{t("review.heading", { title: set.title })}</h1>
      <p class="muted">
        {t("review.started", { time: formatDateTime(session.startedAt) })}
        {session.endedAt !== undefined && t("review.submitted", { time: formatDateTime(session.endedAt) })}
      </p>
      <p>
        {partial
          ? t("review.partialTotal", { score: formatScore(finals.reduce((sum, f) => sum + (f.partialScore ?? 0), 0)), total: finals.length })
          : t("review.score", { correct: finals.filter((f) => f.correct).length, total: finals.length })}
        {ungraded > 0 && <span class="muted">{t("review.ungradedCount", { count: ungraded })}</span>}
      </p>
      <div class="actions">
        <CopyButton label="review.copyGrading" text={() => gradingSkillText()} />
        <CopyButton label="review.copyDigest" text={() => digest} />
      </div>
      <p class="muted">{t("review.copyGuidance")}</p>
      <div class="actions">
        <button class="secondary" onClick={() => navigate()}>
          {t("review.backHome")}
        </button>
      </div>
      <div class="actions">
        <button class="secondary" onClick={downloadAnswerPack}>
          {t("review.downloadAnswerPack")}
        </button>
        <label>
          <input type="checkbox" checked={includeRawLog} onChange={(e) => setIncludeRawLog(e.currentTarget.checked)} /> {t("review.includeRawLog")}
        </label>
        {downloadFailed && <span class="bad">{t("review.downloadFailed")}</span>}
      </div>
      {attempts.map((attempt) => {
        const question = questions.get(attempt.questionId)!;
        const order = attempt.optionOrder;
        const override = overrides.get(attempt.questionId);
        const final = finalValues(attempt, override);
        const graded = isGraded(question);
        return (
          <section class="card" key={attempt.id} data-question-id={attempt.questionId}>
            <h3>
              {t("review.questionNumber", { n: attempt.displayedNumber })} <ResultMark final={final} multiple={questionTypeOf(question) === multipleAnswer} partial={partial} />
              {final.overridden.includes("correct") && <span class="muted"> {t("review.overridden")}</span>}
            </h3>
            <p class="times">
              <AnsweringTime label="review.answeringTime" derivedMs={attempt.timing.answeringActiveMs} override={override} precision={precision} />
              {attempt.timing.excludedIdle.length > 0 && (
                <span class="idle-mark muted" title={t("review.idleMarkTitle")}>
                  {t("review.idleMark")}
                </span>
              )}
              {attempt.timing.reviewingActiveMs > 0 && <span class="muted">{t("review.reviewingTime", { time: formatDuration(attempt.timing.reviewingActiveMs, precision) })}</span>}
            </p>
            {!graded && <p class="muted">{t("player.unsupportedType")}</p>}
            <RichText source={blocksToText(question.stem, order)} />
            {graded && (
              <div class="options">
                {order.map((optionId, i) => {
                  const option = question.options.find((o) => o.id === optionId)!;
                  const isAnswer = question.answer.includes(optionId);
                  const isChosen = attempt.answer.includes(optionId);
                  return (
                    <div key={optionId} class={`option${isAnswer ? " answer" : ""}${isChosen && !isAnswer ? " chosen-wrong" : ""}`}>
                      <span class="letter">{letterAt(i)}</span>
                      <div>
                        <span><RichText source={blocksToText(option.content, order)} inline /></span> <ItemFlagMarks flags={(attempt.itemFlags[optionId] ?? []).map((m) => m.itemFlag)} />
                        {option.rationale.length > 0 && (
                          <details class="rationale" onToggle={(e) => toggleRationale(attempt.questionId, optionId, e.currentTarget.open)}>
                            <summary>{t("review.rationale")}</summary>
                            <RichText source={blocksToText(option.rationale, order)} />
                          </details>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {graded && <p>{t("review.answerGiven", { answer: answerText(attempt.answer, order) })}</p>}
            <p>{t("review.correctAnswer", { answer: graded ? answerText(question.answer, order) : question.answer.join(t("review.answerSeparator")) })}</p>
            {/* A Hint opened here is reading, like the Explanation: Derivation gives it the Phase reviewing. */}
            <HintPanel
              hints={question.hints ?? []}
              opened={attempt.hintsUsed}
              optionOrder={order}
              showPhase
              disabled={marking}
              onOpen={(level) => void mark({ type: "openHint", questionId: attempt.questionId, level })}
            />
            {question.explanation.length > 0 && (
              <div class="explanation">
                <h4>{t("review.explanation")}</h4>
                <RichText source={blocksToText(question.explanation, order)} />
              </div>
            )}
            {derivation.parameters.collectConfidence && (
              <p class="muted">{t("review.confidence", { confidence: attempt.confidence ? t(`confidence.${attempt.confidence}`) : t("review.confidenceNone") })}</p>
            )}
            <FlagButtons
              flags={attempt.flags.map((f) => f.flag)}
              disabled={marking}
              onToggle={(flag: Flag, on) => void mark({ type: on ? "flag" : "unflag", questionId: attempt.questionId, flag })}
            />
            <AppealForm appeals={attempt.appeals.map((a) => a.reason)} disabled={marking} onSubmit={(reason) => void mark({ type: "appeal", questionId: attempt.questionId, reason })} />
            {attempt.notes.answering && <p class="note-read">{t("review.answeringNote", { note: attempt.notes.answering })}</p>}
            {/* Recorded after the reveal, so it is the reviewing Note; the answering Note is never changed here. */}
            <NoteField
              label="review.reviewingNote"
              note={attempt.notes.reviewing ?? ""}
              disabled={marking}
              onSave={(text) => void mark({ type: "note", questionId: attempt.questionId, text })}
            />
            <OverrideEditor attempt={attempt} final={final} graded={graded} idleThresholdMs={derivation.parameters.idleThresholdMs} precision={precision} onSave={(values) => void saveOverride(attempt.questionId, values)} />
          </section>
        );
      })}
    </main>
  );
}
