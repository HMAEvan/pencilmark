import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Confidence, Flag, ItemFlag, Question, QuestionSet, Session } from "../domain/types";
import { blocksToText, letterAt } from "../domain/display";
import { RichText } from "./RichText";
import { t } from "../i18n/i18n";
import { openRecorder, type Recorder } from "../recorder/recorder";
import { abandonSession, currentAttempts, loadOverrides, loadQuestions, setOverride, submitSession, type Override } from "../session/sessions";
import { DEFAULT_PREFERENCES, type Display, type Rules } from "../domain/settings";
import { answeringTimesSoFar } from "../derivation/derivation";
import { AnsweringTime, TimeOverrideField } from "./AnsweringTime";
import { AppealForm, ConfidenceButtons, FlagButtons, HintPanel, ItemFlagMarks, ItemFlagMenu, NoteField, useLongPress } from "./Marks";
import { storage } from "./appStorage";
import { navigate } from "./App";
import { displayOf, formatDuration } from "./format";
import { isGraded, questionTypeOf } from "../questionTypes/questionType";
import { multipleAnswer } from "../questionTypes/multipleAnswer";
import { useRecorder } from "./useRecorder";
import { Dialog } from "./Dialog";

type Loaded = { session: Session; set: QuestionSet; questions: Map<string, Question>; overrides: Map<string, Override>; recorder: Recorder };

/** What the user has done to each Question so far, keyed by Question id. Item flags are keyed by Option id within the Question. */
type Marked = {
  answers: Record<string, string[]>;
  confidence: Record<string, Confidence | null>;
  flags: Record<string, Flag[]>;
  itemFlags: Record<string, Record<string, ItemFlag[]>>;
  /** How many Hints are open: they open in level order, so this is also the next level. */
  hintsOpened: Record<string, number>;
  appeals: Record<string, string[]>;
  notes: Record<string, string>;
};

const NOTHING_MARKED: Marked = { answers: {}, confidence: {}, flags: {}, itemFlags: {}, hintsOpened: {}, appeals: {}, notes: {} };

/** A judgement on an Option: an Option is eliminated, eliminated but unsure, or sure right, never two of these at once. */
const JUDGEMENTS: ItemFlag[] = ["eliminated", "eliminated_unsure", "sure_right"];

/** An Option: a tap selects it, a long press opens its Item flag menu. */
function OptionButton({ letter, text, selected, itemFlags, onSelect, onMenu }: { letter: string; text: string; selected: boolean; itemFlags: ItemFlag[]; onSelect: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu, onSelect);
  const judgement = JUDGEMENTS.find((f) => itemFlags.includes(f));
  return (
    <button class={`option${selected ? " selected" : ""}${judgement ? ` ${judgement}` : ""}`} aria-pressed={selected} {...press}>
      <span class="letter">{letter}</span>
      <span><RichText source={text} inline /></span>
      <ItemFlagMarks flags={itemFlags} />
    </button>
  );
}

async function load(sessionId: string): Promise<(Loaded & { marked: Marked }) | undefined> {
  const session = await storage.get<Session>("sessions", sessionId);
  const set = session && (await storage.get<QuestionSet>("sets", session.setId));
  if (!session || !set) return undefined;
  const questions = new Map((await loadQuestions(storage, set, session)).map((q) => [q.id, q]));
  // Opened first: it seals a buffer a killed page left behind, so those answers are read back too.
  const recorder = await openRecorder(storage, session.id);
  const attempts = await currentAttempts(storage, session, set);
  const marked: Marked = {
    answers: Object.fromEntries(attempts.map((a) => [a.questionId, a.answer])),
    confidence: Object.fromEntries(attempts.map((a) => [a.questionId, a.confidence])),
    flags: Object.fromEntries(attempts.map((a) => [a.questionId, a.flags.map((f) => f.flag)])),
    itemFlags: Object.fromEntries(attempts.map((a) => [a.questionId, Object.fromEntries(Object.entries(a.itemFlags).map(([optionId, marks]) => [optionId, marks.map((m) => m.itemFlag)]))])),
    hintsOpened: Object.fromEntries(attempts.map((a) => [a.questionId, a.hintsUsed.length])),
    appeals: Object.fromEntries(attempts.map((a) => [a.questionId, a.appeals.map((x) => x.reason)])),
    notes: Object.fromEntries(attempts.map((a) => [a.questionId, a.notes.answering ?? ""])),
  };
  return { session, set, questions, overrides: await loadOverrides(storage, session.id), marked, recorder };
}

/** The open Question's answering time so far, by the same rules as Derivation. */
const answeringTimeSoFar = (recorder: Recorder, rules: Rules, questionId: string) => answeringTimesSoFar(recorder.rawLog(), rules).get(questionId) ?? 0;

/**
 * The Session's active time and the open Question's answering time, each shown unless its display preference hides it.
 * They tick once a second, or ten times a second when shown to the millisecond. Hiding a timer never stops recording.
 */
function Timers({ recorder, rules, display, questionId, override }: { recorder: Recorder; rules: Rules; display: Display; questionId: string; override?: Override }) {
  const precision = display.timePrecision;
  const [, setTick] = useState(0);
  useEffect(() => {
    const tick = setInterval(() => setTick((n) => n + 1), precision === "milliseconds" ? 100 : 1000);
    return () => clearInterval(tick);
  }, [precision]);
  return (
    <div class="timers">
      {display.sessionTimer === "shown" && <span class="muted">{t("player.sessionTimer", { time: formatDuration(recorder.activeMs(), precision) })}</span>}
      {display.questionTimer === "shown" && <AnsweringTime label="player.questionTimer" derivedMs={answeringTimeSoFar(recorder, rules, questionId)} override={override} precision={precision} />}
    </div>
  );
}

export function Player({ sessionId }: { sessionId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>();
  const [marked, setMarked] = useState<Marked>(NOTHING_MARKED);
  const [index, setIndex] = useState(0);
  /** The Option whose Item flag menu is open. */
  const [menuFor, setMenuFor] = useState<string | undefined>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** The Leave dialog's step: choosing, or confirming the Abandon. */
  const [leaving, setLeaving] = useState<"choose" | "abandon">();

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

  const { session, set, questions, overrides, recorder } = loaded;
  const total = session.questionOrder.length;
  const questionId = session.questionOrder[index]!;
  const question = questions.get(questionId)!;
  const optionOrder = session.optionOrders[questionId] ?? question.options.map((o) => o.id);
  const type = questionTypeOf(question);
  const { answers, confidence, flags, itemFlags, hintsOpened, appeals, notes } = marked;
  const answer = answers[questionId] ?? [];
  // Sessions from before settings snapshots were kept all ran with the defaults.
  const rules = session.settings?.rules ?? DEFAULT_PREFERENCES.rules;

  const goTo = (next: number) => {
    setIndex(next);
    setMenuFor(undefined);
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
  // Choosing one judgement takes back any other the Option had; each change is its own event.
  const toggleItemFlag = (optionId: string, flag: ItemFlag, on: boolean) => {
    const current = itemFlags[questionId]?.[optionId] ?? [];
    const removed = on && JUDGEMENTS.includes(flag) ? current.filter((f) => f !== flag && JUDGEMENTS.includes(f)) : on ? [] : [flag];
    for (const f of removed) recorder.append({ type: "itemUnflag", questionId, optionId, itemFlag: f });
    if (on) recorder.append({ type: "itemFlag", questionId, optionId, itemFlag: flag });
    const next = [...current.filter((f) => f !== flag && !removed.includes(f)), ...(on ? [flag] : [])];
    setMarked((m) => ({ ...m, itemFlags: { ...m.itemFlags, [questionId]: { ...m.itemFlags[questionId], [optionId]: next } } }));
  };
  const openHint = (level: number) => {
    setMarked((m) => ({ ...m, hintsOpened: { ...m.hintsOpened, [questionId]: level + 1 } }));
    recorder.append({ type: "openHint", questionId, level });
  };
  // Derivation adds the bad-question Flag for an appeal, so the Flag is shown at once too.
  const appeal = (reason: string) => {
    setMarked((m) => ({
      ...m,
      flags: { ...m.flags, [questionId]: [...(m.flags[questionId] ?? []).filter((f) => f !== "bad_question"), "bad_question"] },
      appeals: { ...m.appeals, [questionId]: [...(m.appeals[questionId] ?? []), reason] },
    }));
    recorder.append({ type: "appeal", questionId, reason });
  };
  const saveNote = (text: string) => {
    setMarked((m) => ({ ...m, notes: { ...m.notes, [questionId]: text } }));
    recorder.append({ type: "note", questionId, text });
  };
  // An Override beside the derived time, which keeps counting: time spent on the Question afterwards is added on top.
  const overrideTime = async (ms: number | undefined) => {
    const values = ms === undefined ? { answeringActiveMs: undefined, answeringActiveMsAtOverride: undefined } : { answeringActiveMs: ms, answeringActiveMsAtOverride: answeringTimeSoFar(recorder, rules, questionId) };
    const saved = await setOverride(storage, session.id, questionId, values);
    setLoaded({ ...loaded, overrides: new Map(overrides).set(questionId, saved) });
  };
  const submit = async () => {
    // The ref, not the state, guards: two clicks can land before a re-render.
    if (!recorderRef.current) return;
    setSubmitting(true);
    recorderRef.current = undefined;
    await submitSession(storage, session, set, recorder);
    navigate("review", session.id);
  };
  // Leaving the Player hides the page in the Raw log and seals the chunk, so the time away never counts. Browser back and closing the page do the same.
  const continueLater = () => navigate();
  const abandon = async () => {
    if (!recorderRef.current) return;
    setSubmitting(true);
    recorderRef.current = undefined;
    await recorder.hide();
    await abandonSession(storage, session);
    navigate();
  };

  return (
    <main>
      {!recorder.integrity.ok && <p class="bad">{t("player.integrityFailed", { chunk: recorder.integrity.chunkId })}</p>}
      <div class="player-header">
        <p class="muted">{t("player.questionNumber", { n: index + 1, total })}</p>
        <button class="secondary small" disabled={leaving !== undefined} onClick={() => setLeaving("choose")}>
          {t("player.leave")}
        </button>
      </div>
      <Timers recorder={recorder} rules={rules} display={displayOf(session)} questionId={questionId} override={overrides.get(questionId)} />
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
        <RichText source={blocksToText(question.stem, optionOrder)} />
        {/* A type shown read-only offers nothing to answer. */}
        {isGraded(question) && (
          <div class="options">
            <p class="muted">{t("itemFlags.instruction")}</p>
            {optionOrder.map((optionId, i) => {
              const option = question.options.find((o) => o.id === optionId)!;
              const optionFlags = itemFlags[questionId]?.[optionId] ?? [];
              return (
                <Fragment key={optionId}>
                  <OptionButton
                    letter={letterAt(i)}
                    text={blocksToText(option.content, optionOrder)}
                    selected={answer.includes(optionId)}
                    itemFlags={optionFlags}
                    onSelect={() => toggle(optionId)}
                    onMenu={() => setMenuFor(optionId)}
                  />
                  {menuFor === optionId && (
                    <ItemFlagMenu letter={letterAt(i)} flags={optionFlags} onToggle={(flag, on) => toggleItemFlag(optionId, flag, on)} onClose={() => setMenuFor(undefined)} />
                  )}
                </Fragment>
              );
            })}
          </div>
        )}
        <HintPanel
          key={questionId}
          hints={question.hints ?? []}
          opened={Array.from({ length: hintsOpened[questionId] ?? 0 }, (_, level) => ({ level, phase: "answering" as const }))}
          optionOrder={optionOrder}
          onOpen={openHint}
        />
        {isGraded(question) && rules.collectConfidence && <ConfidenceButtons value={confidence[questionId] ?? null} onChange={setConfidence} />}
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
            <AppealForm key={`appeal-${questionId}`} appeals={appeals[questionId] ?? []} onSubmit={appeal} />
            <NoteField key={questionId} note={notes[questionId] ?? ""} onSave={saveNote} />
            <details class="override">
              <summary>{t("player.overrideTime")}</summary>
              <TimeOverrideField key={questionId} overridden={overrides.get(questionId)?.answeringActiveMs !== undefined} onSave={(ms) => void overrideTime(ms)} />
            </details>
          </div>
        )}
      </div>
      {confirming && (
        <Dialog label={t("player.confirmSubmit")} onCancel={() => !submitting && setConfirming(false)}>
          <p>{t("player.confirmSubmit")}</p>
          <div class="actions">
            <button disabled={submitting} onClick={submit}>
              {t("player.confirmSubmitYes")}
            </button>
            <button class="secondary" disabled={submitting} onClick={() => setConfirming(false)}>
              {t("player.cancel")}
            </button>
          </div>
        </Dialog>
      )}
      {leaving === "choose" && (
        <Dialog label={t("player.leaveHeading")} onCancel={() => setLeaving(undefined)}>
          <h3>{t("player.leaveHeading")}</h3>
          <p>{t("player.leaveExplained")}</p>
          <div class="actions">
            <button onClick={continueLater}>{t("player.continueLater")}</button>
            <button class="secondary" onClick={() => setLeaving("abandon")}>
              {t("player.abandon")}
            </button>
            <button class="secondary" onClick={() => setLeaving(undefined)}>
              {t("player.cancel")}
            </button>
          </div>
        </Dialog>
      )}
      {leaving === "abandon" && (
        <Dialog label={t("player.confirmAbandon")} onCancel={() => !submitting && setLeaving(undefined)}>
          <p>{t("player.confirmAbandon")}</p>
          <div class="actions">
            <button disabled={submitting} onClick={abandon}>
              {t("player.confirmAbandonYes")}
            </button>
            <button class="secondary" disabled={submitting} onClick={() => setLeaving(undefined)}>
              {t("player.cancel")}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
