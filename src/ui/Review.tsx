import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Flag, Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import { RichText } from "./RichText";
import { t, type TranslationKey } from "../i18n/i18n";
import { useNavDropdown } from "./useNavDropdown";
import { openRecorder, type RawEventBody, type Recorder } from "../recorder/recorder";
import { loadDerivedSession, recordReviewMark, setOverride, type Attempt, type Derivation, type Override } from "../session/sessions";
import { AppealForm, HintPanel, ItemFlagMarks, MarksArea, NoteField } from "./Marks";
import { TextEntriesRead } from "./TextEntries";
import { digestWithOverrides, finalValues, type FinalValues, type OverrideValues } from "../derivation/derivation";
import { buildAnswerPack } from "../exports/answerPack";
import { gradingSkillText } from "../exports/skills";
import { CopyButton } from "./CopyButton";
import { DownloadButton } from "./DownloadButton";
import { AnsweringTime, TimeOverrideField } from "./AnsweringTime";
import { AnsweringTimeline } from "./AnsweringTimeline";
import { answerText, formatDateTime, formatDuration, formatScore, timePrecisionOf } from "./format";
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

/** A card's answering time, with a ✎ to override it and, where idle time was left out, an idle mark that explains it. */
function TimeLine({ attempt, override, idleThresholdMs, precision, onSave }: { attempt: Attempt; override?: Override; idleThresholdMs: number; precision: TimePrecision; onSave?: (values: OverrideValues) => void }) {
  const [correcting, setCorrecting] = useState(false);
  const [idleOpen, setIdleOpen] = useState(false);
  return (
    <>
      <p class="times">
        <AnsweringTime label="review.answeringTime" derivedMs={attempt.timing.answeringActiveMs} override={override} precision={precision} />
        {onSave && (
          <button class="link edit-time" aria-expanded={correcting} aria-label={t("player.overrideTime")} title={t("player.overrideTime")} onClick={() => setCorrecting(!correcting)}>
            ✎
          </button>
        )}
        {attempt.timing.excludedIdle.length > 0 && (
          <button class="link idle-mark muted" aria-expanded={idleOpen} aria-label={t("review.idleMarkTitle")} title={t("review.idleMarkTitle")} onClick={() => setIdleOpen(!idleOpen)}>
            {t("review.idleMark")}
          </button>
        )}
        {attempt.timing.reviewingActiveMs > 0 && <span class="muted">{t("review.reviewingTime", { time: formatDuration(attempt.timing.reviewingActiveMs, precision) })}</span>}
      </p>
      {idleOpen && (
        <div class="card card-popover muted">
          <p>{t("review.idleExplained", { seconds: idleThresholdMs / 1000 })}</p>
          <p>{t("review.derivedTime", { time: formatDuration(attempt.timing.answeringActiveMs, precision), raw: formatDuration(attempt.timing.answeringRawMs, precision) })}</p>
        </div>
      )}
      {correcting && onSave && (
        <div class="card card-popover" role="group" aria-label={t("player.overrideTime")}>
          {/* Answering time no longer changes after the reveal, so the derived time recorded here adds nothing on top. */}
          <TimeOverrideField
            overridden={override?.answeringActiveMs !== undefined}
            onSave={(ms) => {
              onSave(ms === undefined ? { answeringActiveMs: undefined, answeringActiveMsAtOverride: undefined } : { answeringActiveMs: ms, answeringActiveMsAtOverride: attempt.timing.answeringActiveMs });
              setCorrecting(false);
            }}
          />
        </div>
      )}
    </>
  );
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

/** A card's heading: the Question number and result, with a ✎ to override the result where it is graded. */
function ResultLine({ attempt, final, multiple, partial, onSave }: { attempt: Attempt; final: FinalValues; multiple: boolean; partial: boolean; onSave?: (values: OverrideValues) => void }) {
  const [correcting, setCorrecting] = useState(false);
  const save = (values: OverrideValues) => {
    onSave?.(values);
    setCorrecting(false);
  };
  return (
    <>
      <h3>
        {t("review.questionNumber", { n: attempt.displayedNumber })} <ResultMark final={final} multiple={multiple} partial={partial} />
        {final.overridden.includes("correct") && <span class="muted"> {t("review.overridden")}</span>}
        {onSave && (
          <button class="link edit-time" aria-expanded={correcting} aria-label={t("review.overrideResult")} title={t("review.overrideResult")} onClick={() => setCorrecting(!correcting)}>
            ✎
          </button>
        )}
      </h3>
      {correcting && onSave && (
        <div class="card card-popover actions" role="group" aria-label={t("review.overrideResult")}>
          {final.correct !== true && (
            <button class="secondary" onClick={() => save({ correct: true })}>
              {t("review.markCorrect")}
            </button>
          )}
          {final.correct !== false && (
            <button class="secondary" onClick={() => save({ correct: false })}>
              {t("review.markWrong")}
            </button>
          )}
          {final.overridden.includes("correct") && (
            <button class="secondary" onClick={() => save({ correct: undefined })}>
              {t("review.restoreResult")}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** How a Question's navigation square is coloured: by its final result, Overrides applied. */
type NavResult = "right" | "wrong" | "partial" | "unanswered" | "ungraded";
const NAV_LABEL: Record<NavResult, TranslationKey> = {
  right: "review.navRight",
  wrong: "review.navWrong",
  partial: "review.navPartial",
  unanswered: "review.navUnanswered",
  ungraded: "review.navUngraded",
};
function navResult(attempt: Attempt, final: FinalValues, graded: boolean, multiple: boolean): NavResult {
  if (!graded) return "ungraded";
  if (!final.overridden.includes("correct") && attempt.answer.length === 0) return "unanswered";
  if (multiple && final.partialScore !== null && final.partialScore > 0 && final.partialScore < 1) return "partial";
  return final.correct ? "right" : "wrong";
}

/** The grading Skill and the Digest, each to download or copy, with the note on what the Digest covers. */
function DigestControls({ set, digest }: { set: QuestionSet; digest: string }) {
  return (
    <div class="digest-controls">
      <div class="actions">
        <DownloadButton label="review.downloadGrading" fileName={() => "pencilmark-grading.md"} text={() => gradingSkillText()} />
        <CopyButton label="common.copyGradingSkill" text={() => gradingSkillText()} link />
        <DownloadButton label="review.downloadDigest" fileName={() => `${set.title.replace(/[\\/:*?"<>|\s]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.md`} text={() => digest} />
        <CopyButton label="common.copyDigest" text={() => digest} link />
      </div>
      <p class="muted">{t("review.copyGuidance")}</p>
      <p class="muted">{t("review.digestNote")}</p>
    </div>
  );
}

/** Where the Showcase page's Feedback starts, for the link that jumps to it. */
export const FEEDBACK_ID = "feedback";

/** What the review page shows: a submitted Session, its derivation and Overrides. */
export type Shown = Omit<Loaded, "recorder">;

/** The review page's controls that record; absent in a Showcase, where the page is read-only. */
type Recording = {
  marking: boolean;
  mark: (event: RawEventBody) => void;
  /** A change to a Note or Challenge statement goes straight into the Raw log; only its save is a mark, derived again. */
  recordText: (event: RawEventBody) => void;
  saveOverride: (questionId: string, values: OverrideValues) => void;
  toggleRationale: (questionId: string, optionId: string, open: boolean) => void;
};

/**
 * The review page itself. `banner` follows the heading, `actions` the page's own downloads, and `children` the Questions.
 * `feedbackLink` adds a link that jumps to the Feedback (`FEEDBACK_ID`) among `children`.
 * Without `recording` nothing on it records: marks, Notes and Appeals are shown as they are, and there are no Overrides.
 */
export function ReviewPage({ shown, recording, banner, actions, feedbackLink, children }: { shown: Shown; recording?: Recording; banner?: ComponentChildren; actions?: ComponentChildren; feedbackLink?: boolean; children?: ComponentChildren }) {
  const { session, set, derivation, attempts, questions, overrides } = shown;
  // A display preference: it changes what is shown, never what is stored. Sessions from before snapshots used the default.
  const precision = timePrecisionOf(session);
  const partial = (session.settings?.display.multipleAnswerScore ?? DEFAULT_PREFERENCES.display.multipleAnswerScore) === "partial";
  // Questions that are not graded count towards neither the score nor the total.
  const finals = attempts.filter((a) => isGraded(questions.get(a.questionId)!)).map((a) => finalValues(a, overrides.get(a.questionId)));
  const ungraded = attempts.length - finals.length;
  // The copied Digest uses the Overrides set since the derivation, in place of the derived values.
  const digest = overrides.size ? digestWithOverrides({ title: set.title, questions: [...questions.values()], rules: derivation.parameters }, { attempts, removedFlags: derivation.removedFlags }, overrides) : derivation.digest;
  const marking = recording?.marking;
  const [navOpen, setNavOpen] = useNavDropdown();
  // The Question occupying the main part of the screen, for the top bar's "Question n".
  const [currentId, setCurrentId] = useState<string | undefined>();
  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      setCurrentId(questionOnScreen());
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
  }, []);
  const current = attempts.find((a) => a.questionId === currentId) ?? attempts[0];
  const jumpTo = (target: Element | null) => {
    setNavOpen(false);
    target?.scrollIntoView({ block: "start" });
  };
  const links = (
    <div class="actions">
      <button class="secondary" onClick={() => navigate()}>
        {t("review.backHome")}
      </button>
      {feedbackLink && (
        <a
          href={`#${FEEDBACK_ID}`}
          onClick={(e) => {
            e.preventDefault();
            jumpTo(document.getElementById(FEEDBACK_ID));
          }}
        >
          {t("review.jumpToFeedback")}
        </a>
      )}
    </div>
  );

  return (
    <main class="player-page">
      <div class="player">
        <aside class={`answer-panel${navOpen ? " nav-open" : ""}`}>
          <p class="review-score">
            {partial
              ? t("review.partialTotal", { score: formatScore(finals.reduce((sum, f) => sum + (f.partialScore ?? 0), 0)), total: finals.length })
              : t("review.score", { correct: finals.filter((f) => f.correct).length, total: finals.length })}
            {ungraded > 0 && <span class="muted review-ungraded">{t("review.ungradedCount", { count: ungraded })}</span>}
          </p>
          {current && (
            <button class="question-number question-toggle" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>
              {t("review.questionNumber", { n: current.displayedNumber })} ▾
            </button>
          )}
          <div class="panel-nav">
            <nav class="question-nav" aria-label={t("player.navigation")}>
              {attempts.map((attempt) => {
                const question = questions.get(attempt.questionId)!;
                const final = finalValues(attempt, overrides.get(attempt.questionId));
                const result = navResult(attempt, final, isGraded(question), questionTypeOf(question) === multipleAnswer);
                const challenged = attempt.flags.some((f) => f.flag === "bad_question");
                const flagged = attempt.flags.some((f) => f.flag !== "bad_question");
                const label = t(NAV_LABEL[result], { n: attempt.displayedNumber }) + (flagged ? t("player.navFlagged") : "") + (challenged ? t("player.navChallenged") : "");
                return (
                  <button
                    key={attempt.id}
                    class={`nav-item result-${result}${attempt === current ? " current" : ""}`}
                    aria-label={label}
                    aria-current={attempt === current ? "step" : undefined}
                    onClick={() => jumpTo(document.querySelector(`[data-question-id="${attempt.questionId}"]`))}
                  >
                    {result === "ungraded" ? t("review.navUngradedMark") : attempt.displayedNumber}
                    {(flagged || challenged) && (
                      <span class="nav-marks" aria-hidden="true">
                        {flagged && <span class="mark-flag">⚑</span>}
                        {challenged && <span class="mark-challenge">⚠</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
          <div class="landscape-only">
            <DigestControls set={set} digest={digest} />
            {links}
          </div>
        </aside>
        <div class="player-body review-body">
          <h1>{t("review.heading", { title: set.title })}</h1>
          {banner}
          <p class="muted">
            {t("review.started", { time: formatDateTime(session.startedAt) })}
            {session.endedAt !== undefined && t("review.submitted", { time: formatDateTime(session.endedAt) })}
          </p>
          <div class="portrait-only">
            <DigestControls set={set} digest={digest} />
            {links}
          </div>
          {actions}
      {attempts.map((attempt) => {
        const question = questions.get(attempt.questionId)!;
        const order = attempt.optionOrder;
        const override = overrides.get(attempt.questionId);
        const final = finalValues(attempt, override);
        const graded = isGraded(question);
        return (
          <section class="card" key={attempt.questionId} data-question-id={attempt.questionId}>
            <ResultLine
              attempt={attempt}
              final={final}
              multiple={questionTypeOf(question) === multipleAnswer}
              partial={partial}
              onSave={recording && graded ? (values) => recording.saveOverride(attempt.questionId, values) : undefined}
            />
            <TimeLine
              attempt={attempt}
              override={override}
              idleThresholdMs={derivation.parameters.idleThresholdMs}
              precision={precision}
              onSave={recording && ((values) => recording.saveOverride(attempt.questionId, values))}
            />
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
                          <details class="rationale" onToggle={(e) => recording?.toggleRationale(attempt.questionId, optionId, e.currentTarget.open)}>
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
            <AnsweringTimeline timeline={attempt.timeline} optionOrder={order} precision={precision} />
            {/* A Hint opened here is reading, like the Explanation: Derivation gives it the Phase reviewing. */}
            <HintPanel
              hints={question.hints ?? []}
              opened={attempt.hintsUsed}
              optionOrder={order}
              showPhase
              disabled={marking}
              onOpen={recording && ((level) => recording.mark({ type: "openHint", questionId: attempt.questionId, level }))}
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
            <MarksArea
              phase="reviewing"
              flags={attempt.flags.map((f) => f.flag)}
              disabled={marking}
              onToggle={recording && ((flag: Flag, on) => recording.mark({ type: on ? "flag" : "unflag", questionId: attempt.questionId, flag }))}
            >
              <TextEntriesRead entries={attempt.challengeStatements.answering} label="review.answeringStatement" />
              {/* Written after the reveal, so it is the reviewing Challenge statement. */}
              {recording ? (
                <AppealForm entries={attempt.challengeStatements.reviewing ?? []} questionId={attempt.questionId} disabled={marking} onRecord={recording.recordText} />
              ) : (
                <TextEntriesRead entries={attempt.challengeStatements.reviewing} label="review.reviewingStatementRead" />
              )}
              <TextEntriesRead entries={attempt.notes.answering} label="review.answeringNote" />
              {/* Recorded after the reveal, so it is the reviewing Note; the answering Note is never changed here. */}
              {recording ? (
                <NoteField
                  label="review.reviewingNote"
                  entries={attempt.notes.reviewing ?? []}
                  questionId={attempt.questionId}
                  disabled={marking}
                  onRecord={recording.recordText}
                />
              ) : (
                <TextEntriesRead entries={attempt.notes.reviewing} label="review.reviewingNoteRead" />
              )}
            </MarksArea>
          </section>
        );
      })}
      {children}
          <div class="portrait-only">
            <DigestControls set={set} digest={digest} />
          </div>
        </div>
      </div>
    </main>
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

  const { session, set, overrides, recorder } = loaded;
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
  const recording: Recording = {
    marking,
    mark: (event) => void mark(event),
    recordText: (event) => (event.type === "textSave" || event.type === "textDelete" || event.type === "textRestore" ? void mark(event) : recorderRef.current?.append(event)),
    saveOverride: (questionId, values) => void saveOverride(questionId, values),
    toggleRationale: (questionId, optionId, open) => recorderRef.current?.append({ type: open ? "expandRationale" : "collapseRationale", questionId, optionId }),
  };

  return (
    <ReviewPage
      shown={loaded}
      recording={recording}
      actions={
        <div class="actions">
          <button class="secondary" onClick={downloadAnswerPack}>
            {t("review.downloadAnswerPack")}
          </button>
          <label>
            <input type="checkbox" checked={includeRawLog} onChange={(e) => setIncludeRawLog(e.currentTarget.checked)} /> {t("review.includeRawLog")}
          </label>
          <span class="muted">{t("review.includeRawLogDeletedText")}</span>
          {downloadFailed && <span class="bad">{t("review.downloadFailed")}</span>}
        </div>
      }
    />
  );
}
