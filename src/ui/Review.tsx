import { useEffect, useRef, useState } from "preact/hooks";
import type { Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import { t, type TranslationKey } from "../i18n/i18n";
import { openRecorder, type Recorder } from "../recorder/recorder";
import { loadDerivedSession, setOverride, type Attempt, type Derivation, type Override } from "../session/sessions";
import { digestWithOverrides, finalValues, type FinalValues, type OverrideValues } from "../derivation/derivation";
import { excludedIdleMs } from "../derivation/timing";
import { buildAnswerPack } from "../exports/answerPack";
import { formatDuration } from "./format";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { useRecorder } from "./useRecorder";

type Loaded = { session: Session; set: QuestionSet; derivation: Derivation; attempts: Attempt[]; questions: Map<string, Question>; overrides: Map<string, Override> };

async function load(sessionId: string): Promise<(Loaded & { recorder: Recorder }) | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  // Only a submitted Session has a review page to record.
  if (!session?.currentDerivationId) return undefined;
  // Opened first: it seals a buffer a killed review page left behind, so that reviewing time is derived too.
  const recorder = await openRecorder(storage, session.id);
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

/** Setting an Override on a derived time or result, shown under a Question. The derived value and the Raw log are never changed. */
function OverrideEditor({ attempt, final, idleThresholdMs, onSave }: { attempt: Attempt; final: FinalValues; idleThresholdMs: number; onSave: (values: OverrideValues) => void }) {
  const [seconds, setSeconds] = useState("");
  const idle = attempt.timing.excludedIdle;
  const enteredMs = Math.round(Number(seconds) * 1000);
  return (
    <details class="override">
      <summary>{t(idle.length > 0 ? "review.idleExcluded" : "review.overrideOpen", { time: formatDuration(excludedIdleMs(attempt.timing)) })}</summary>
      {idle.length > 0 && <p class="muted">{t("review.idleExplained", { seconds: idleThresholdMs / 1000 })}</p>}
      <p class="muted">{t("review.derivedTime", { time: formatDuration(attempt.timing.answeringActiveMs), raw: formatDuration(attempt.timing.answeringRawMs) })}</p>
      <div class="actions">
        <label>
          {t("review.overrideTimeLabel")}{" "}
          <input type="number" min="0" step="1" inputMode="numeric" value={seconds} onInput={(e) => setSeconds(e.currentTarget.value)} />
        </label>
        <button class="secondary" disabled={seconds === "" || !(enteredMs >= 0)} onClick={() => onSave({ answeringActiveMs: enteredMs })}>
          {t("review.saveTime")}
        </button>
        {final.overridden.includes("answeringActiveMs") && (
          <button class="secondary" onClick={() => onSave({ answeringActiveMs: undefined })}>
            {t("review.restoreTime")}
          </button>
        )}
      </div>
      <div class="actions">
        <button class="secondary" onClick={() => onSave({ correct: !final.correct })}>
          {t(final.correct ? "review.markWrong" : "review.markCorrect")}
        </button>
        {final.overridden.includes("correct") && (
          <button class="secondary" onClick={() => onSave({ correct: undefined })}>
            {t("review.restoreResult")}
          </button>
        )}
      </div>
    </details>
  );
}

function answerText(optionIds: string[], optionOrder: string[]): string {
  return optionIds.length ? optionIds.map((id) => letterOf(id, optionOrder)).join(", ") : t("review.blank");
}

export function Review({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [copyState, setCopyState] = useState<TranslationKey>();
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

  const { session, set, derivation, attempts, questions, overrides } = loaded;
  const saveOverride = async (questionId: string, values: OverrideValues) => {
    const saved = await setOverride(storage, session.id, questionId, values);
    setLoaded({ ...loaded, overrides: new Map(overrides).set(questionId, saved) });
  };
  // The copied Digest uses the Overrides set since the derivation, in place of the derived values.
  const digest = overrides.size ? digestWithOverrides({ title: set.title, questions: [...questions.values()] }, attempts, overrides) : derivation.digest;
  const copyDigest = async () => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopyState("review.copied");
    } catch {
      setCopyState("review.copyFailed");
    }
  };
  const downloadAnswerPack = async () => {
    setDownloadFailed(false);
    try {
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
      <p>{t("review.score", { correct: attempts.filter((a) => finalValues(a, overrides.get(a.questionId)).correct).length, total: attempts.length })}</p>
      <div class="actions">
        <button onClick={copyDigest}>{t("review.copyDigest")}</button>
        <button class="secondary" onClick={() => navigate()}>
          {t("review.backHome")}
        </button>
        {copyState && <span class="muted">{t(copyState)}</span>}
      </div>
      {copyState === "review.copyFailed" && (
        <textarea readOnly rows={10} value={digest} ref={(el) => el?.select()} />
      )}
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
        return (
          <section class="card" key={attempt.id} data-question-id={attempt.questionId}>
            <h3>
              {t("review.questionNumber", { n: attempt.displayedNumber })}{" "}
              <span class={final.correct ? "ok" : "bad"}>{t(final.correct ? "review.correct" : "review.wrong")}</span>
              {final.overridden.includes("correct") && <span class="muted"> {t("review.overridden")}</span>}
            </h3>
            <p class="muted">
              {t("review.answeringTime", { time: formatDuration(final.answeringActiveMs) })}
              {final.overridden.includes("answeringActiveMs") && ` ${t("review.overridden")}`}
              {attempt.timing.excludedIdle.length > 0 && (
                <span class="idle-mark" title={t("review.idleMarkTitle")}>
                  {" "}
                  {t("review.idleMark")}
                </span>
              )}
              {attempt.timing.reviewingActiveMs > 0 && ` ${t("review.reviewingTime", { time: formatDuration(attempt.timing.reviewingActiveMs) })}`}
            </p>
            <p class="stem">{blocksToText(question.stem, order)}</p>
            <div class="options">
              {order.map((optionId, i) => {
                const option = question.options.find((o) => o.id === optionId)!;
                const isAnswer = question.answer.includes(optionId);
                const isChosen = attempt.answer.includes(optionId);
                return (
                  <div key={optionId} class={`option${isAnswer ? " answer" : ""}${isChosen && !isAnswer ? " chosen-wrong" : ""}`}>
                    <span class="letter">{letterAt(i)}</span>
                    <div>
                      <span>{blocksToText(option.content, order)}</span>
                      {option.rationale.length > 0 && (
                        <details class="rationale" onToggle={(e) => toggleRationale(attempt.questionId, optionId, e.currentTarget.open)}>
                          <summary>{t("review.rationale")}</summary>
                          <p class="stem">{blocksToText(option.rationale, order)}</p>
                        </details>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p>{t("review.answerGiven", { answer: answerText(attempt.answer, order) })}</p>
            <p>{t("review.correctAnswer", { answer: answerText(question.answer, order) })}</p>
            {question.explanation.length > 0 && (
              <div class="explanation">
                <h4>{t("review.explanation")}</h4>
                <p class="stem">{blocksToText(question.explanation, order)}</p>
              </div>
            )}
            <OverrideEditor attempt={attempt} final={final} idleThresholdMs={derivation.parameters.idleThresholdMs} onSave={(values) => void saveOverride(attempt.questionId, values)} />
          </section>
        );
      })}
    </main>
  );
}
