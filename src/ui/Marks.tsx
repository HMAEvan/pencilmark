import { useEffect, useRef, useState } from "preact/hooks";
import { FLAGS, ITEM_FLAGS, type Confidence, type ContentBlock, type Flag, type ItemFlag, type Phase } from "../domain/types";
import { blocksToText } from "../domain/display";
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

export function FlagButtons({ flags, disabled, onToggle }: { flags: Flag[]; disabled?: boolean; onToggle: (flag: Flag, on: boolean) => void }) {
  return (
    <div class="flags" role="group" aria-label={t("marks.flags")}>
      {FLAGS.map((f) => {
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

/** The Note is recorded when the field loses focus, not on every keystroke. */
export function NoteField({
  note,
  label = "marks.note",
  disabled,
  onSave,
}: {
  note: string;
  label?: TranslationKey;
  disabled?: boolean;
  onSave: (text: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  return (
    <label class="note">
      {t(label)}
      <textarea
        rows={3}
        value={draft}
        disabled={disabled}
        placeholder={t("marks.notePlaceholder")}
        onInput={(e) => setDraft(e.currentTarget.value)}
        onBlur={() => draft !== note && onSave(draft)}
      />
    </label>
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
  onOpen: (level: number) => void;
}) {
  if (!hints.length) return null;
  const next = opened.length;
  return (
    <div class="hints">
      {opened.map(({ level, phase }) => (
        <div key={level} class={`hint${phase === "answering" ? " used" : ""}`}>
          <strong>{t("hints.label", { n: level + 1 })}</strong>
          {showPhase && <span class="muted">{t(phase === "answering" ? "hints.answering" : "hints.reviewing")}</span>}
          <p class="stem">{blocksToText(hints[level]!, optionOrder)}</p>
        </div>
      ))}
      {next < hints.length && (
        <button class="small secondary" disabled={disabled} onClick={() => onOpen(next)}>
          {t("hints.open", { n: next + 1 })}
        </button>
      )}
    </div>
  );
}

/** "I think the answer is wrong": the reason is required, so the button stays disabled until one is written. */
export function AppealForm({ appeals, disabled, onSubmit }: { appeals: string[]; disabled?: boolean; onSubmit: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const send = () => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setReason("");
    setOpen(false);
  };
  return (
    <div class="appeal">
      {appeals.map((a, i) => (
        <p key={i} class="note-read">
          {t("appeal.recorded", { reason: a })}
        </p>
      ))}
      {open ? (
        <>
          <label class="note">
            {t("appeal.reasonLabel")}
            <textarea rows={3} value={reason} disabled={disabled} placeholder={t("appeal.reasonPlaceholder")} onInput={(e) => setReason(e.currentTarget.value)} />
          </label>
          <div class="actions">
            <button class="small" disabled={disabled || !reason.trim()} onClick={send}>
              {t("appeal.submit")}
            </button>
            <button class="small secondary" onClick={() => setOpen(false)}>
              {t("player.cancel")}
            </button>
          </div>
        </>
      ) : (
        <button class="small secondary" disabled={disabled} onClick={() => setOpen(true)}>
          {t("appeal.open")}
        </button>
      )}
    </div>
  );
}
