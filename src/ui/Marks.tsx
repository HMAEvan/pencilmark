import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RawEventBody } from "../recorder/recorder";
import { recordTextEntry, type TextEntryTarget } from "../recorder/textEntry";
import { FLAGS, ITEM_FLAGS, type Confidence, type ContentBlock, type Flag, type ItemFlag, type Phase } from "../domain/types";
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

/**
 * A textarea holding one Text entry (ADR-0010): every change is reported as a `textInput` event, and the whole text as a
 * `textSave` event when it loses focus. `saved` is the entry's text as last saved.
 */
function TextEntryArea({
  saved,
  target,
  placeholder,
  disabled,
  onRecord,
  onDraft,
}: {
  saved: string;
  target: TextEntryTarget;
  placeholder: TranslationKey;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
  /** The text as it stands, after every input. */
  onDraft?: (text: string) => void;
}) {
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const record = useRef(onRecord);
  record.current = onRecord;
  const entry = useMemo(() => recordTextEntry((event) => record.current(event), target, saved), [target.questionId, target.field, target.entry, saved]);
  return (
    <textarea
      rows={3}
      value={draft}
      disabled={disabled}
      placeholder={t(placeholder)}
      onInput={(e) => {
        const { inputType, isComposing } = e as InputEvent;
        setDraft(e.currentTarget.value);
        onDraft?.(e.currentTarget.value);
        entry.input(e.currentTarget.value, inputType, isComposing);
      }}
      onCompositionEnd={(e) => entry.compositionEnd(e.currentTarget.value)}
      onBlur={(e) => entry.blur(e.currentTarget.value)}
    />
  );
}

/** The Note: each change is recorded, and the whole Note is saved when the field loses focus. */
export function NoteField({
  note,
  questionId,
  label = "marks.note",
  disabled,
  onRecord,
}: {
  note: string;
  questionId: string;
  label?: TranslationKey;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  return (
    <label class="note">
      {t(label)}
      <TextEntryArea saved={note} target={{ questionId, field: "note", entry: 0 }} placeholder="marks.notePlaceholder" disabled={disabled} onRecord={onRecord} />
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
 * "I think the answer is wrong": the reason is the Phase's Challenge statement, one Text entry recorded like a Note
 * (ADR-0010), saved when its field loses focus; submitting closes the field. `statement` is this Phase's as last saved.
 * Without `onRecord`, as in a Showcase, only the Appeals made are shown.
 */
export function AppealForm({
  appeals,
  statement,
  questionId,
  disabled,
  onRecord,
}: {
  appeals: string[];
  statement: string;
  questionId: string;
  disabled?: boolean;
  onRecord?: (event: RawEventBody) => void;
}) {
  const [open, setOpen] = useState(false);
  const [written, setWritten] = useState(statement);
  useEffect(() => setWritten(statement), [statement]);
  return (
    <div class="appeal">
      {appeals.map((a, i) => (
        <p key={i} class="note-read">
          {t("appeal.recorded", { reason: a })}
        </p>
      ))}
      {open && onRecord ? (
        <>
          <label class="note">
            {t("appeal.reasonLabel")}
            <TextEntryArea saved={statement} target={{ questionId, field: "challenge", entry: 0 }} placeholder="appeal.reasonPlaceholder" disabled={disabled} onRecord={onRecord} onDraft={setWritten} />
          </label>
          <div class="actions">
            {/* Pressing the button takes the focus from the field first, which saves the statement. */}
            <button class="small" disabled={disabled || !written.trim()} onClick={() => setOpen(false)}>
              {t("appeal.submit")}
            </button>
          </div>
        </>
      ) : (
        onRecord && (
          <button class="small secondary" disabled={disabled} onClick={() => setOpen(true)}>
            {t("appeal.open")}
          </button>
        )
      )}
    </div>
  );
}
