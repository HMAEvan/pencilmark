import { useEffect, useRef, useState } from "preact/hooks";
import type { RawEventBody } from "../recorder/recorder";
import type { TextEntryMark } from "../derivation/marks";
import { TextEntries } from "./TextEntries";
import type { ComponentChildren } from "preact";
import { FLAGS, ITEM_FLAGS, flagsOfferedIn, type Confidence, type ContentBlock, type Flag, type ItemFlag, type Phase } from "../domain/types";
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

/** The Flags the Phase offers, as toggle buttons. The bad-question Flag is not among them: #64 turns it into the Challenge. */
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

/** One line per Flag type that can be set, then the closing line. */
const MEANT_FLAGS = FLAGS.filter((f): f is Exclude<Flag, "bad_question"> => f !== "bad_question");

/**
 * The blue "Marks and Notes" area: closed by default, its header listing the Flags set. Inside: the Flags of the Phase, a collapsed
 * explanation of each, the bad-question Flag set apart (until #64), then `children` (Challenge statements and Notes).
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
  const badQuestion = flags.includes("bad_question");
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
          {onToggle && (
            <div class="flags challenge-flag">
              <button class={`small${badQuestion ? "" : " secondary"}`} aria-pressed={badQuestion} disabled={disabled} onClick={() => onToggle("bad_question", !badQuestion)}>
                {t("flag.bad_question")}
              </button>
            </div>
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

/**
 * "I think the answer is wrong": the Phase's Challenge statement entries, recorded like Notes (ADR-0010). There is no
 * submit: the first entry holding text sets the bad-question Flag, which Derivation adds. `entries` are this Phase's as derived.
 */
export function ChallengeForm({
  entries,
  questionId,
  disabled,
  onRecord,
}: {
  entries: TextEntryMark[];
  questionId: string;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div class="challenge">
      {open || entries.length > 0 ? (
        <div class="note">
          {t("challenge.reasonLabel")}
          <TextEntries field="challenge" questionId={questionId} entries={entries} label={t("challenge.reasonLabel")} placeholder="challenge.reasonPlaceholder" disabled={disabled} onRecord={onRecord} />
        </div>
      ) : (
        <button class="small secondary" disabled={disabled} onClick={() => setOpen(true)}>
          {t("challenge.open")}
        </button>
      )}
    </div>
  );
}

