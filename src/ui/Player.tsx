import { useEffect, useRef, useState } from "preact/hooks";
import type { Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt } from "../domain/display";
import { t } from "../i18n/i18n";
import { openRecorder, type Recorder } from "../recorder/recorder";
import { currentAnswers, loadQuestions, submitSession } from "../session/sessions";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { formatDuration } from "./format";
import { questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { shortAnswer } from "../questionTypes/shortAnswer";

type Loaded = { session: Session; set: QuestionSet; questions: Map<string, Question>; recorder: Recorder };

async function load(sessionId: string): Promise<(Loaded & { answers: Record<string, string[]> }) | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  const set = session && (await storage.get<QuestionSet>("sets", session.setId));
  if (!session || !set) return undefined;
  const questions = new Map((await loadQuestions(storage, set)).map((q) => [q.id, q]));
  // Opened first: it seals a buffer a killed page left behind, so those answers are read back too.
  const recorder = await openRecorder(storage, session.id);
  const answers = await currentAnswers(storage, session, set);
  return { session, set, questions, answers, recorder };
}

const SAVE_INTERVAL_MS = 3000;

/** The Session's active time, ticking once a second. */
function Timer({ recorder }: { recorder: Recorder }) {
  const [ms, setMs] = useState(recorder.activeMs());
  useEffect(() => {
    const tick = setInterval(() => setMs(recorder.activeMs()), 1000);
    return () => clearInterval(tick);
  }, [recorder]);
  return <span class="muted timer">{t("player.timer", { time: formatDuration(ms) })}</span>;
}

export function Player({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recorderRef = useRef<Recorder | undefined>(undefined);

  useEffect(() => {
    const report = (e: unknown) => console.error("Writing the Raw log failed", e);
    // A hidden page may be killed, so the chunk is sealed; showing it again starts a new chunk.
    // `pagehide` and `visibilitychange` often fire together; record each change of state once.
    // A page opened in a background tab starts hidden and records its resume event when shown.
    let hidden = document.visibilityState === "hidden";
    void load(sessionId).then((result) => {
      if (result && result.session.status !== "in_progress") return navigate("review", sessionId);
      setLoaded(result ?? null);
      if (!result) return;
      setAnswers(result.answers);
      recorderRef.current = result.recorder;
      if (!hidden) result.recorder.show();
      const first = result.session.questionOrder[0];
      if (first) result.recorder.append({ type: "navigate", questionId: first });
    });
    const hide = () => {
      if (hidden) return;
      hidden = true;
      void recorderRef.current?.hide().catch(report);
    };
    const show = () => {
      if (!hidden) return;
      hidden = false;
      recorderRef.current?.show();
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? hide() : show());
    // A page restored from the back-forward cache gets `pageshow` without a visibility change.
    const onPageShow = (e: PageTransitionEvent) => e.persisted && show();
    const saveTimer = setInterval(() => void recorderRef.current?.save().catch(report), SAVE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", hide);
    addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(saveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", hide);
      removeEventListener("pageshow", onPageShow);
      // Leaving the Player for another screen takes the Session out of view, as hiding the page does.
      hide();
    };
  }, [sessionId]);

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { session, set, questions, recorder } = loaded;
  const total = session.questionOrder.length;
  const questionId = session.questionOrder[index]!;
  const question = questions.get(questionId)!;
  const optionOrder = session.optionOrders[questionId] ?? question.options.map((o) => o.id);
  const type = questionTypeOf(question);
  const answer = answers[questionId] ?? [];

  const goTo = (next: number) => {
    setIndex(next);
    recorder.append({ type: "navigate", questionId: session.questionOrder[next]! });
  };
  // Tapping a selected Option again deselects it.
  const toggle = (optionId: string) => {
    if (answer.includes(optionId)) {
      setAnswers({ ...answers, [questionId]: answer.filter((id) => id !== optionId) });
      recorder.append({ type: "deselect", questionId, optionId });
    } else {
      setAnswers({ ...answers, [questionId]: type.select(answer, optionId) });
      recorder.append({ type: "select", questionId, optionId });
    }
  };
  // Recorded when the text is committed (on leaving the box), not keystroke by keystroke.
  const writeText = (text: string) => {
    setAnswers({ ...answers, [questionId]: text.trim() ? [text] : [] });
    recorder.append({ type: "text", questionId, text });
  };
  // Confirmed in the page, not with confirm(): some embedded browsers suppress native dialogs.
  const submit = async () => {
    // The ref, not the state, guards: two clicks can land before a re-render.
    if (!recorderRef.current) return;
    setSubmitting(true);
    recorderRef.current = undefined;
    await submitSession(storage, session, set, recorder);
    navigate("review", session.id);
  };

  return (
    <main>
      {!recorder.integrity.ok && <p class="bad">{t("player.integrityFailed", { chunk: recorder.integrity.chunkId })}</p>}
      <p class="muted">
        {t("player.questionNumber", { n: index + 1, total })} · <Timer recorder={recorder} />
      </p>
      <div class="card">
        {type === multipleAnswer && <p class="muted">{t("player.multipleAnswerHint")}</p>}
        {type === shortAnswer && question.type !== shortAnswer.type && <p class="muted">{t("player.shownAsShortAnswer")}</p>}
        <p class="stem">{blocksToText(question.stem, optionOrder)}</p>
        {type === shortAnswer ? (
          <textarea
            key={questionId}
            rows={4}
            aria-label={t("player.textAnswer")}
            placeholder={t("player.textAnswer")}
            defaultValue={answer[0] ?? ""}
            onChange={(e) => writeText(e.currentTarget.value)}
          />
        ) : (
          <div class="options">
            {optionOrder.map((optionId, i) => {
              const option = question.options.find((o) => o.id === optionId)!;
              const selected = answer.includes(optionId);
              return (
                <button key={optionId} class={`option${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => toggle(optionId)}>
                  <span class="letter">{letterAt(i)}</span>
                  <span>{blocksToText(option.content, optionOrder)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div class="actions">
        <button class="secondary" disabled={index === 0} onClick={() => goTo(index - 1)}>
          {t("player.previous")}
        </button>
        {index < total - 1 ? (
          <button onClick={() => goTo(index + 1)}>{t("player.next")}</button>
        ) : (
          <button disabled={confirming} onClick={() => setConfirming(true)}>
            {t("player.submit")}
          </button>
        )}
      </div>
      {confirming && (
        <div class="card confirm" role="alertdialog" aria-label={t("player.confirmSubmit")}>
          <p>{t("player.confirmSubmit")}</p>
          <div class="actions">
            <button disabled={submitting} onClick={submit}>
              {t("player.confirmSubmitYes")}
            </button>
            <button class="secondary" disabled={submitting} onClick={() => setConfirming(false)}>
              {t("player.cancel")}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
