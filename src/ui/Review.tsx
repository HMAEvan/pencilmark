import { useEffect, useState } from "preact/hooks";
import type { Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt, letterOf } from "../domain/display";
import { t, type TranslationKey } from "../i18n/i18n";
import { currentDerivation, loadOverrides, loadQuestions, setOverride, type Attempt, type Derivation, type Override } from "../session/sessions";
import { digestWithOverrides, finalValues, type FinalValues, type OverrideValues } from "../derivation/derivation";
import { excludedIdleMs } from "../derivation/timing";
import { formatDuration, formatScore } from "./format";
import { DEFAULT_PREFERENCES } from "../domain/settings";
import { questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { shortAnswer } from "../questionTypes/shortAnswer";
import { storage } from "./appStorage";
import { navigate } from "./App";

type Loaded = { session: Session; set: QuestionSet; derivation: Derivation; attempts: Attempt[]; questions: Map<string, Question>; overrides: Map<string, Override> };

async function load(sessionId: string): Promise<Loaded | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  if (!session?.currentDerivationId) return undefined;
  const set = await storage.get<QuestionSet>("sets", session.setId);
  const derivation = set && (await currentDerivation(storage, session, set));
  if (!set || !derivation) return undefined;
  const attempts = await storage.query<Attempt>("attempts", { derivationId: derivation.id });
  attempts.sort((a, b) => a.displayedNumber - b.displayedNumber);
  const questions = new Map((await loadQuestions(storage, set)).map((q) => [q.id, q]));
  return { session, set, derivation, attempts, questions, overrides: await loadOverrides(storage, sessionId) };
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
    </details>
  );
}

/** Letters in displayed order; a short-answer Question's answer is its text. */
function answerText(answer: string[], optionOrder: string[], written: boolean): string {
  if (!answer.length) return t("review.blank");
  return written ? answer.join(t("import.listSeparator")) : answer.map((id) => letterOf(id, optionOrder)).sort().join(", ");
}

function ResultMark({ final, multiple, partial }: { final: FinalValues; multiple: boolean; partial: boolean }) {
  if (final.correct === null) return <span class="muted">{t("review.pending")}</span>;
  return (
    <>
      <span class={final.correct ? "ok" : "bad"}>{t(final.correct ? "review.correct" : "review.wrong")}</span>
      {multiple && partial && <span class="muted"> · {t("review.partialScore", { score: formatScore(final.partialScore ?? 0) })}</span>}
    </>
  );
}

export function Review({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [copyState, setCopyState] = useState<TranslationKey>();

  useEffect(() => void load(sessionId).then((result) => setLoaded(result ?? null)), [sessionId]);

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { session, set, derivation, attempts, questions, overrides } = loaded;
  // A display preference: it changes what is shown, never what is stored. Sessions from before snapshots used the default.
  const partial = (session.settings?.display.multipleAnswerScore ?? DEFAULT_PREFERENCES.display.multipleAnswerScore) === "partial";
  const finals = attempts.map((a) => finalValues(a, overrides.get(a.questionId)));
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

  return (
    <main>
      <h1>{t("review.heading", { title: set.title })}</h1>
      <p>
        {partial
          ? t("review.partialTotal", { score: formatScore(finals.reduce((sum, f) => sum + (f.partialScore ?? 0), 0)), total: attempts.length })
          : t("review.score", { correct: finals.filter((f) => f.correct).length, total: attempts.length })}
      </p>
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
      {attempts.map((attempt) => {
        const question = questions.get(attempt.questionId)!;
        const order = attempt.optionOrder;
        const override = overrides.get(attempt.questionId);
        const final = finalValues(attempt, override);
        const type = questionTypeOf(question);
        const written = type === shortAnswer;
        return (
          <section class="card" key={attempt.id}>
            <h3>
              {t("review.questionNumber", { n: attempt.displayedNumber })} <ResultMark final={final} multiple={type === multipleAnswer} partial={partial} />
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
            </p>
            <p class="stem">{blocksToText(question.stem, order)}</p>
            {!written && (
              <div class="options">
                {order.map((optionId, i) => {
                  const option = question.options.find((o) => o.id === optionId)!;
                  const isAnswer = question.answer.includes(optionId);
                  const isChosen = attempt.answer.includes(optionId);
                  return (
                    <div key={optionId} class={`option${isAnswer ? " answer" : ""}${isChosen && !isAnswer ? " chosen-wrong" : ""}`}>
                      <span class="letter">{letterAt(i)}</span>
                      <span>{blocksToText(option.content, order)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p>{t("review.answerGiven", { answer: answerText(attempt.answer, order, written) })}</p>
            <p>{t("review.correctAnswer", { answer: answerText(question.answer, order, written) })}</p>
            <OverrideEditor attempt={attempt} final={final} idleThresholdMs={derivation.parameters.idleThresholdMs} onSave={(values) => void saveOverride(attempt.questionId, values)} />
            {question.explanation.length > 0 && (
              <details>
                <summary>{t("review.explanation")}</summary>
                <p class="stem">{blocksToText(question.explanation, order)}</p>
              </details>
            )}
          </section>
        );
      })}
    </main>
  );
}
