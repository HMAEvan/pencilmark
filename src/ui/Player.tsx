import { useEffect, useRef, useState } from "preact/hooks";
import type { Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt } from "../domain/display";
import { t } from "../i18n/i18n";
import { openRecorder, type Recorder } from "../recorder/recorder";
import { currentAnswers, loadQuestions, submitSession } from "../session/sessions";
import { storage } from "./appStorage";
import { navigate } from "./App";

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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mm = String(Math.floor(seconds / 60) % 60).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
}

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
    void load(sessionId).then((result) => {
      if (result && result.session.status !== "in_progress") return navigate("review", sessionId);
      setLoaded(result ?? null);
      if (!result) return;
      setAnswers(result.answers);
      recorderRef.current = result.recorder;
      result.recorder.show();
      const first = result.session.questionOrder[0];
      if (first) result.recorder.append({ type: "navigate", questionId: first });
    });
    const report = (e: unknown) => console.error("Writing the Raw log failed", e);
    // A hidden page may be killed, so the chunk is sealed; showing it again starts a new chunk.
    // `pagehide` and `visibilitychange` often fire together; record each change of state once.
    let hidden = false;
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
    const save = setInterval(() => void recorderRef.current?.save().catch(report), SAVE_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("pagehide", hide);
    addEventListener("pageshow", onPageShow);
    return () => {
      clearInterval(save);
      document.removeEventListener("visibilitychange", onVisibility);
      removeEventListener("pagehide", hide);
      removeEventListener("pageshow", onPageShow);
      void recorderRef.current?.seal().catch(report);
    };
  }, [sessionId]);

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { session, set, questions, recorder } = loaded;
  const total = session.questionOrder.length;
  const questionId = session.questionOrder[index]!;
  const question = questions.get(questionId)!;
  const optionOrder = session.optionOrders[questionId] ?? question.options.map((o) => o.id);

  const goTo = (next: number) => {
    setIndex(next);
    recorder.append({ type: "navigate", questionId: session.questionOrder[next]! });
  };
  // Tapping the selected Option again clears the answer.
  const toggle = (optionId: string) => {
    if (answers[questionId]?.includes(optionId)) {
      setAnswers({ ...answers, [questionId]: [] });
      recorder.append({ type: "deselect", questionId, optionId });
    } else {
      setAnswers({ ...answers, [questionId]: [optionId] });
      recorder.append({ type: "select", questionId, optionId });
    }
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
        <p class="stem">{blocksToText(question.stem, optionOrder)}</p>
        <div class="options">
          {optionOrder.map((optionId, i) => {
            const option = question.options.find((o) => o.id === optionId)!;
            const selected = answers[questionId]?.includes(optionId);
            return (
              <button key={optionId} class={`option${selected ? " selected" : ""}`} aria-pressed={selected} onClick={() => toggle(optionId)}>
                <span class="letter">{letterAt(i)}</span>
                <span>{blocksToText(option.content, optionOrder)}</span>
              </button>
            );
          })}
        </div>
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
