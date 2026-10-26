import { useEffect, useState } from "preact/hooks";
import type { Confidence, Flag, Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt } from "../domain/display";
import { t } from "../i18n/i18n";
import { openRecorder, type Recorder } from "../recorder/recorder";
import { currentAttempts, loadQuestions, submitSession } from "../session/sessions";
import { DEFAULT_PREFERENCES } from "../domain/settings";
import { ConfidenceButtons, FlagButtons, NoteField } from "./Marks";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { formatDuration } from "./format";
import { isGraded, questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { useRecorder } from "./useRecorder";

type Loaded = { session: Session; set: QuestionSet; questions: Map<string, Question>; recorder: Recorder };

/** What the user has done to each Question so far, keyed by Question id. */
type Marked = { answers: Record<string, string[]>; confidence: Record<string, Confidence | null>; flags: Record<string, Flag[]>; notes: Record<string, string> };

async function load(sessionId: string): Promise<(Loaded & { marked: Marked }) | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  const set = session && (await storage.get<QuestionSet>("sets", session.setId));
  if (!session || !set) return undefined;
  const questions = new Map((await loadQuestions(storage, set)).map((q) => [q.id, q]));
  // Opened first: it seals a buffer a killed page left behind, so those answers are read back too.
  const recorder = await openRecorder(storage, session.id);
  const attempts = await currentAttempts(storage, session, set);
  const marked: Marked = {
    answers: Object.fromEntries(attempts.map((a) => [a.questionId, a.answer])),
    confidence: Object.fromEntries(attempts.map((a) => [a.questionId, a.confidence])),
    flags: Object.fromEntries(attempts.map((a) => [a.questionId, a.flags.map((f) => f.flag)])),
    notes: Object.fromEntries(attempts.map((a) => [a.questionId, a.notes.answering ?? ""])),
  };
  return { session, set, questions, marked, recorder };
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
  const [marked, setMarked] = useState<Marked>({ answers: {}, confidence: {}, flags: {}, notes: {} });
  const [index, setIndex] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const recorderRef = useRecorder(
    async () => {
      const result = await load(sessionId);
      if (result && result.session.status !== "in_progress") return void navigate("review", sessionId);
      setLoaded(result ?? null);
      if (!result) return;
      setMarked(result.marked);
      const first = result.session.questionOrder[0];
      return { recorder: result.recorder, afterShow: () => first && result.recorder.append({ type: "navigate", questionId: first }) };
    },
    sessionId,
  );

  if (loaded === undefined) return <main>{t("common.loading")}</main>;
  if (loaded === null) return <main>{t("common.notFound")}</main>;

  const { session, set, questions, recorder } = loaded;
  const total = session.questionOrder.length;
  const questionId = session.questionOrder[index]!;
  const question = questions.get(questionId)!;
  const optionOrder = session.optionOrders[questionId] ?? question.options.map((o) => o.id);
  const type = questionTypeOf(question);
  const { answers, confidence, flags, notes } = marked;
  const answer = answers[questionId] ?? [];
  // Sessions from before settings snapshots were kept all ran with the defaults.
  const collectConfidence = (session.settings?.rules ?? DEFAULT_PREFERENCES.rules).collectConfidence;

  const goTo = (next: number) => {
    setIndex(next);
    recorder.append({ type: "navigate", questionId: session.questionOrder[next]! });
  };
  // Tapping a selected Option again deselects it.
  const toggle = (optionId: string) => {
    if (answer.includes(optionId)) {
      setMarked((m) => ({ ...m, answers: { ...m.answers, [questionId]: answer.filter((id) => id !== optionId) } }));
      recorder.append({ type: "deselect", questionId, optionId });
    } else {
      setMarked((m) => ({ ...m, answers: { ...m.answers, [questionId]: type.select(answer, optionId) } }));
      recorder.append({ type: "select", questionId, optionId });
    }
  };
  const setConfidence = (value: Confidence | null) => {
    setMarked((m) => ({ ...m, confidence: { ...m.confidence, [questionId]: value } }));
    recorder.append({ type: "confidence", questionId, confidence: value });
  };
  const toggleFlag = (flag: Flag, on: boolean) => {
    setMarked((m) => {
      const current = (m.flags[questionId] ?? []).filter((f) => f !== flag);
      return { ...m, flags: { ...m.flags, [questionId]: on ? [...current, flag] : current } };
    });
    recorder.append({ type: on ? "flag" : "unflag", questionId, flag });
  };
  const saveNote = (text: string) => {
    setMarked((m) => ({ ...m, notes: { ...m.notes, [questionId]: text } }));
    recorder.append({ type: "note", questionId, text });
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
      <nav class="question-nav" aria-label={t("player.navigation")}>
        {session.questionOrder.map((id, i) => {
          const answered = (answers[id]?.length ?? 0) > 0;
          const flagged = (flags[id]?.length ?? 0) > 0;
          const label = t(answered ? "player.navAnswered" : "player.navUnanswered", { n: i + 1 }) + (flagged ? t("player.navFlagged") : "");
          return (
            <button
              key={id}
              class={`nav-item${answered ? " answered" : ""}${flagged ? " flagged" : ""}${i === index ? " current" : ""}`}
              aria-label={label}
              aria-current={i === index ? "step" : undefined}
              onClick={() => i !== index && goTo(i)}
            >
              {i + 1}
            </button>
          );
        })}
      </nav>
      <div class="card">
        {type === multipleAnswer && <p class="muted">{t("player.multipleAnswerInstruction")}</p>}
        {!isGraded(question) && <p class="muted">{t("player.unsupportedType")}</p>}
        <p class="stem">{blocksToText(question.stem, optionOrder)}</p>
        {/* A type shown read-only offers nothing to answer. */}
        {isGraded(question) && (
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
        {isGraded(question) && collectConfidence && <ConfidenceButtons value={confidence[questionId] ?? null} onChange={setConfidence} />}
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
      <div class={`drawer${drawerOpen ? " open" : ""}`}>
        <button class="secondary small" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)}>
          {t(drawerOpen ? "player.marksClose" : "player.marksOpen")}
          {(flags[questionId]?.length ?? 0) > 0 && ` ${t("player.flaggedMark")}`}
        </button>
        {drawerOpen && (
          <div class="drawer-body">
            <FlagButtons flags={flags[questionId] ?? []} onToggle={toggleFlag} />
            <NoteField key={questionId} note={notes[questionId] ?? ""} onSave={saveNote} />
          </div>
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
