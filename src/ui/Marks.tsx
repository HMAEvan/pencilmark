import { useEffect, useRef, useState } from "preact/hooks";
import type { RawEventBody } from "../recorder/recorder";
import type { QuestionMarks, TextEntryMark } from "../derivation/marks";
import { TextEntries } from "./TextEntries";
import type { ComponentChildren } from "preact";
import { CHALLENGE_REASONS, FLAGS, ITEM_FLAGS, flagsOfferedIn, type ChallengeReason, type Confidence, type ContentBlock, type Flag, type ItemFlag, type Phase } from "../domain/types";
import { blocksToText } from "../domain/display";
import { RichText } from "./RichText";
import { t, type TranslationKey } from "../i18n/i18n";

// Marks shared by the Player and the review page. Each change is reported to the caller, which records it in the Raw log.

export const CONFIDENCES: Confidence[] = ["sure", "probably", "guessed"];

/** Three small buttons at the foot of the Question; tapping the chosen one again clears it. */
export function ConfidenceButtons({ value, onChange }: { value: Confidence | null; onChange: (value: Confidence | null) => void }) {
  return (
    <div class="confidence" role="group" aria-label={t("marks.confidence")}>
      <span class="muted">{t("marks.confidence")}</span>
      {CONFIDENCES.map((c) => (
        <button key={c} class={`small${value === c ? "" : " secondary"}`} aria-pressed={value === c} onClick={() => onChange(value === c ? null : c)}>
          {t(`confidence.${c}`)}
        </button>
      ))}
    </div>
  );
}

/** The Flags the Phase offers, as toggle buttons. Never the retired bad_question: a faulty Question is a Challenge. */
export function FlagButtons({ phase, flags, disabled, onToggle }: { phase: Phase; flags: Flag[]; disabled?: boolean; onToggle: (flag: Flag, on: boolean) => void }) {
  return (
    <div class="flags" role="group" aria-label={t("marks.flags")}>
      {flagsOfferedIn(phase).map((f) => {
        const on = flags.includes(f);
        return (
          <button key={f} class={`small${on ? "" : " secondary"}`} aria-pressed={on} disabled={disabled} onClick={() => onToggle(f, !on)}>
            {t(`flag.${f}`)}
          </button>
        );
      })}
    </div>
  );
}

/** The Flag types that can be set: every one but the retired bad_question. */
const MEANT_FLAGS = FLAGS.filter((f): f is Exclude<Flag, "bad_question"> => f !== "bad_question");

/**
 * The blue "Marks and Notes" area: closed by default, its header listing the Flags set. Inside: the Flags of the Phase, a collapsed
 * explanation of each, then `children` (the Notes). The Challenge area sits below it.
 * Without `onToggle` it is read-only: the Flags set are shown without controls.
 */
export function MarksArea({
  phase,
  flags,
  disabled,
  onToggle,
  children,
}: {
  phase: Phase;
  flags: Flag[];
  disabled?: boolean;
  /** Absent where nothing is recorded, as in a Showcase. */
  onToggle?: (flag: Flag, on: boolean) => void;
  children?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const set = MEANT_FLAGS.filter((f) => flags.includes(f));
  return (
    <div class="marks-area">
      <button class="marks-area-header" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t("marksArea.title") + (set.length ? ` · ${set.map((f) => t(`flag.${f}`)).join(t("marksArea.separator"))}` : "")}</span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div class="marks-area-body">
          {onToggle ? (
            <FlagButtons phase={phase} flags={flags} disabled={disabled} onToggle={onToggle} />
          ) : (
            <div class="flags" role="group" aria-label={t("marks.flags")}>
              {set.length ? set.map((f) => <span key={f} class="flag-read">{t(`flag.${f}`)}</span>) : <span class="muted">{t("marksArea.noneSet")}</span>}
            </div>
          )}
          {onToggle && (
            <details class="flag-meanings">
              <summary>{t("marksArea.whatMean")}</summary>
              <ul>
                {(flagsOfferedIn(phase) as Exclude<Flag, "bad_question">[]).map((f) => (
                  <li key={f}>
                    <strong>{t(`flag.${f}`)}</strong>: {t(`flagMeaning.${f}`)}
                  </li>
                ))}
              </ul>
              <p class="muted">{t("marksArea.digestNote")}</p>
            </details>
          )}
          {children}
        </div>
      )}
    </div>
  );
}

/** The Note: several entries per Phase, each recorded change by change and saved when its field loses focus (ADR-0010). */
export function NoteField({
  entries,
  questionId,
  label = "marks.note",
  disabled,
  onRecord,
}: {
  entries: TextEntryMark[];
  questionId: string;
  label?: TranslationKey;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  return (
    <div class="note">
      {t(label)}
      <TextEntries field="note" questionId={questionId} entries={entries} label={t(label)} placeholder="marks.notePlaceholder" disabled={disabled} onRecord={onRecord} />
    </div>
  );
}

/** The small marks an Option carries for its Item flags, in the menu's order. */
export function ItemFlagMarks({ flags }: { flags: ItemFlag[] }) {
  if (!flags.length) return null;
  return (
    <span class="item-flag-marks">
      {ITEM_FLAGS.filter((f) => flags.includes(f)).map((f) => (
        <span key={f} class={`item-flag-mark ${f}`} title={t(`itemFlag.${f}`)}>
          {t(`itemFlag.mark.${f}`)}
        </span>
      ))}
    </span>
  );
}

/** The Item flag menu for one Option, opened by long-pressing it. */
export function ItemFlagMenu({ letter, flags, onToggle, onClose }: { letter: string; flags: ItemFlag[]; onToggle: (flag: ItemFlag, on: boolean) => void; onClose: () => void }) {
  return (
    <div class="item-flag-menu" role="group" aria-label={t("itemFlags.menu", { letter })}>
      <span class="muted">{t("itemFlags.menu", { letter })}</span>
      {ITEM_FLAGS.map((f) => {
        const on = flags.includes(f);
        return (
          <button key={f} class={`small${on ? "" : " secondary"}`} aria-pressed={on} onClick={() => onToggle(f, !on)}>
            {t(`itemFlag.mark.${f}`)} {t(`itemFlag.${f}`)}
          </button>
        );
      })}
      <button class="small secondary" onClick={onClose}>
        {t("itemFlags.close")}
      </button>
    </div>
  );
}

const LONG_PRESS_MS = 500;
/** A finger that moves further than this is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10;

/**
 * Handlers that tell a long press from a tap: a tap calls `onTap`, a long press (or a right-click) calls `onLongPress`
 * and swallows the click that follows, so a long press never also selects.
 */
export function useLongPress(onLongPress: () => void, onTap: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const pressed = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };
  useEffect(() => cancel, []);
  return {
    onPointerDown: (e: PointerEvent) => {
      if (e.button !== 0) return;
      pressed.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      cancel();
      timer.current = setTimeout(() => {
        pressed.current = true;
        onLongPress();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > LONG_PRESS_SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      pressed.current = true;
      onLongPress();
    },
    onClick: () => {
      if (pressed.current) pressed.current = false;
      else onTap();
    },
  };
}

/**
 * The Question's Hints: those opened so far, and a button for the next level only, so Hints open strictly lightest first.
 * On the review page each opened Hint says whether it was used while answering or opened after the reveal.
 */
export function HintPanel({
  hints,
  opened,
  optionOrder,
  showPhase,
  disabled,
  onOpen,
}: {
  hints: ContentBlock[][];
  opened: { level: number; phase: Phase }[];
  optionOrder: string[];
  showPhase?: boolean;
  disabled?: boolean;
  /** Absent where nothing is recorded, as in a Showcase: only the Hints opened are shown. */
  onOpen?: (level: number) => void;
}) {
  if (!hints.length || (!onOpen && !opened.length)) return null;
  const next = opened.length;
  return (
    <div class="hints">
      {opened.map(({ level, phase }) => (
        <div key={level} class={`hint${phase === "answering" ? " used" : ""}`}>
          <strong>{t("hints.label", { n: level + 1 })}</strong>
          {showPhase && <span class="muted">{t(phase === "answering" ? "hints.answering" : "hints.reviewing")}</span>}
          <RichText source={blocksToText(hints[level]!, optionOrder)} />
        </div>
      ))}
      {onOpen && next < hints.length && (
        <button class="small secondary" disabled={disabled} onClick={() => onOpen(next)}>
          {t("hints.open", { n: next + 1 })}
        </button>
      )}
    </div>
  );
}

/** Whether a Question's Challenge is on, turned off (by a stored `bad_question` removal), or was never raised. */
export type ChallengeState = "on" | "off" | "none";

export const challengeStateOf = ({ challenge }: Pick<QuestionMarks, "challenge">): ChallengeState => (!challenge ? "none" : challenge.on ? "on" : "off");

/**
 * The orange Challenge area (⚠), below the Marks and Notes area and opening independently of it: closed by default, its header
 * saying whether a Challenge is on and listing the Challenge reasons picked. Only the first opening on a Question that was never
 * Challenged raises the Challenge (`onRaise`), whatever the Phase; after that the header only opens and closes it. Inside: the
 * Challenge reasons as toggles, then `children` (the Challenge statements), with the AI line beside them when `aiWritten`.
 * Without `onReason` it is read-only: what was set is shown without controls.
 */
export function ChallengeArea({
  state,
  reasons,
  aiWritten,
  disabled,
  onRaise,
  onReason,
  children,
}: {
  state: ChallengeState;
  reasons: ChallengeReason[];
  /** The Question's provenance names a model. */
  aiWritten?: boolean;
  disabled?: boolean;
  /** Both absent where nothing is recorded, as in a Showcase. */
  onRaise?: () => void;
  onReason?: (reason: ChallengeReason, on: boolean) => void;
  children?: ComponentChildren;
}) {
  const [open, setOpen] = useState(false);
  const picked = CHALLENGE_REASONS.filter((r) => reasons.includes(r));
  // While a mark is being recorded (`disabled`), presses that would record are ignored, but no control is `disabled`: that
  // would drop the focus of the control just pressed to the page (#75, accessibility). They carry `aria-disabled` instead.
  const raises = !open && state === "none" && onRaise !== undefined;
  const toggle = () => {
    if (raises && disabled) return;
    if (raises) onRaise();
    setOpen(!open);
  };
  const summary = [
    ...(state === "on" ? [t("challengeArea.on")] : []),
    ...(picked.length ? [picked.map((r) => t(`challengeReason.${r}`)).join(t("marksArea.separator"))] : []),
  ];
  return (
    <div class={`challenge-area${state === "on" ? " challenged" : ""}`}>
      <button class="challenge-area-header" aria-expanded={open} aria-disabled={raises && disabled ? true : undefined} onClick={toggle}>
        <span>
          <span class="mark-challenge" aria-hidden="true">
            ⚠{" "}
          </span>
          {t("challengeArea.title") + summary.map((part) => ` · ${part}`).join("")}
        </span>
        <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div class="challenge-area-body">
          <p class="muted challenge-reasons-label">{t(onReason ? "challengeArea.reasons" : "challengeArea.reasonsRead")}</p>
          {onReason ? (
            <div class="flags challenge-reasons" role="group" aria-label={t("challengeArea.reasons")}>
              {CHALLENGE_REASONS.map((r) => {
                const on = reasons.includes(r);
                return (
                  <button key={r} class={`small${on ? "" : " secondary"}`} aria-pressed={on} aria-disabled={disabled ? true : undefined} onClick={() => !disabled && onReason(r, !on)}>
                    {t(`challengeReason.${r}`)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div class="flags challenge-reasons" role="group" aria-label={t("challengeArea.reasonsRead")}>
              {picked.length ? picked.map((r) => <span key={r} class="flag-read challenge-read">{t(`challengeReason.${r}`)}</span>) : <span class="muted">{t("challengeArea.noReasons")}</span>}
            </div>
          )}
          {onReason && aiWritten && <p class="muted ai-line">{t("challengeArea.aiLine")}</p>}
          {children}
        </div>
      )}
    </div>
  );
}

/** The Challenge statement of the Phase: several entries, recorded like Notes (ADR-0010); the first holding text turns the Challenge on, which Derivation works out. */
export function ChallengeStatementField({
  entries,
  questionId,
  label = "challenge.statementLabel",
  disabled,
  onRecord,
}: {
  entries: TextEntryMark[];
  questionId: string;
  label?: TranslationKey;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  return (
    <div class="note">
      {t(label)}
      <TextEntries field="challenge" questionId={questionId} entries={entries} label={t(label)} placeholder="challenge.statementPlaceholder" disabled={disabled} onRecord={onRecord} />
    </div>
  );
}
