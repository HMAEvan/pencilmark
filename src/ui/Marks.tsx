import { useEffect, useState } from "preact/hooks";
import { FLAGS, type Confidence, type Flag } from "../domain/types";
import { t } from "../i18n/i18n";

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
export function NoteField({ note, disabled, onSave }: { note: string; disabled?: boolean; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(note);
  useEffect(() => setDraft(note), [note]);
  return (
    <label class="note">
      {t("marks.note")}
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
