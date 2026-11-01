import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RawEventBody } from "../recorder/recorder";
import { recordTextEntry, type TextEntryRecording, type TextField } from "../recorder/textEntry";
import type { TextEntryMark } from "../derivation/marks";
import { t, type TranslationKey } from "../i18n/i18n";

// The Text entries of one field (a Note or a Challenge statement) in one Phase (ADR-0010): several, each saved and
// collapsed, edited, deleted and restored. Every change is reported to the caller, which records it in the Raw log.

/** Characters, counted as code points. Past it an entry is kept whole; only collapsing it by hand is refused. */
export const TEXT_ENTRY_LIMIT = 2000;
/** The counter turns red when this many or fewer characters remain. */
const COUNTER_WARNING = 200;

const lengthOf = (text: string) => [...text].length;

type Slot = { questionId: string; field: TextField; entry: number };

function TextEntrySlot({
  slot,
  mark,
  placeholder,
  label,
  disabled,
  onRecord,
}: {
  slot: Slot;
  mark: TextEntryMark | undefined;
  placeholder: TranslationKey;
  label: string;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  const saved = mark && !mark.deleted ? mark.text : "";
  const deleted = mark?.deleted === true;
  const [draft, setDraft] = useState(saved);
  // An entry that already holds text starts collapsed, as when the user comes back to the Question.
  const [open, setOpen] = useState(saved === "");
  // The draft follows the saved text as soon as it changes (a restore, a re-derivation), not a render later.
  const [seen, setSeen] = useState(saved);
  if (seen !== saved) {
    setSeen(saved);
    setDraft(saved);
  }
  const record = useRef(onRecord);
  record.current = onRecord;
  const recording = useMemo(() => recordTextEntry((event) => record.current(event), slot, saved), [slot.questionId, slot.field, slot.entry, saved]);
  // Leaving the Question saves what was typed even where the field was never blurred.
  const latest = useRef({ draft, recording });
  latest.current = { draft, recording };
  useEffect(() => () => latest.current.recording.blur(latest.current.draft), []);

  // Deleting empties the box at once: saved text comes back from the Raw log later, and the old text must not be saved again meanwhile.
  const remove = () => {
    recording.blur(draft);
    recording.action("textDelete");
    setDraft("");
  };
  const first = slot.entry === 0;

  if (deleted && !first) {
    return (
      <p class="text-entry text-deleted">
        {t("text.deleted")} ·{" "}
        <button class="link" disabled={disabled} onClick={() => (recording.action("textRestore"), setOpen(false))}>
          {t("text.restore")}
        </button>
      </p>
    );
  }
  if (!open && saved !== "") {
    return (
      <div class="text-entry">
        <p class="note-read text-saved">{saved}</p>
        <div class="actions">
          <button class="small secondary" disabled={disabled} onClick={() => (recording.action("textEdit"), setOpen(true))}>
            {t("text.edit")}
          </button>
          <button class="small secondary" disabled={disabled} onClick={() => (remove(), setOpen(true))}>
            {t("text.delete")}
          </button>
        </div>
      </div>
    );
  }
  const length = lengthOf(draft);
  const over = length > TEXT_ENTRY_LIMIT;
  return (
    <div class="text-entry">
      <textarea
        rows={3}
        value={draft}
        disabled={disabled}
        aria-label={label}
        placeholder={t(placeholder)}
        onInput={(e) => {
          const { inputType, isComposing } = e as InputEvent;
          setDraft(e.currentTarget.value);
          recording.input(e.currentTarget.value, inputType, isComposing);
        }}
        onCompositionEnd={(e) => recording.compositionEnd(e.currentTarget.value)}
        onBlur={(e) => recording.blur(e.currentTarget.value)}
      />
      <div class="text-entry-bar">
        <span class={`text-counter${TEXT_ENTRY_LIMIT - length <= COUNTER_WARNING ? " bad" : ""}`}>{t("text.counter", { n: length, max: TEXT_ENTRY_LIMIT })}</span>
        <div class="actions">
          <button
            class="small"
            disabled={disabled || over || draft === ""}
            onClick={() => {
              recording.blur(draft);
              recording.action("textCollapse");
              setOpen(false);
            }}
          >
            {t("text.saveCollapse")}
          </button>
          {(saved !== "" || draft !== "") && (
            <button class="small secondary" disabled={disabled} onClick={remove}>
              {t("text.delete")}
            </button>
          )}
        </div>
      </div>
      {over ? <p class="bad text-hint">{t("text.tooLong", { max: TEXT_ENTRY_LIMIT })}</p> : <p class="muted text-hint">{t("text.autoSaved")}</p>}
      {deleted && draft === "" && (
        <button class="link" disabled={disabled} onClick={() => (recording.action("textRestore"), setOpen(false))}>
          {t("text.restoreDeleted")}
        </button>
      )}
    </div>
  );
}

/**
 * The Text entries of one field in one Phase. `entries` are the final ones, as derived; the Phase starts with one empty
 * box and "Add another" adds more below.
 */
export function TextEntries({
  field,
  questionId,
  entries,
  label,
  placeholder,
  disabled,
  onRecord,
}: {
  field: TextField;
  questionId: string;
  entries: TextEntryMark[];
  label: string;
  placeholder: TranslationKey;
  disabled?: boolean;
  onRecord: (event: RawEventBody) => void;
}) {
  const known = Math.max(1, ...entries.map((e) => e.entry + 1));
  const [added, setAdded] = useState(known);
  const count = Math.max(added, known);
  const markOf = (entry: number) => entries.find((e) => e.entry === entry);
  const lastEmpty = markOf(count - 1) === undefined;
  return (
    <div class="text-entries">
      {Array.from({ length: count }, (_, entry) => (
        <TextEntrySlot key={entry} slot={{ questionId, field, entry }} mark={markOf(entry)} placeholder={placeholder} label={count > 1 ? `${label} ${entry + 1}` : label} disabled={disabled} onRecord={onRecord} />
      ))}
      <button
        class="small secondary"
        disabled={disabled || lastEmpty}
        onClick={() => {
          recordTextEntry(onRecord, { questionId, field, entry: count }, "").action("textAdd");
          setAdded(count + 1);
        }}
      >
        {t("text.add")}
      </button>
    </div>
  );
}

/** Text entries shown as they are, in a Showcase or for a Phase that is over: a deleted one only says it was written. */
export function TextEntriesRead({ entries, label }: { entries: TextEntryMark[] | undefined; label: TranslationKey }) {
  return (
    <>
      {(entries ?? []).map((e) => (
        <p key={e.entry} class="note-read">
          {e.deleted ? t("text.deletedRead") : t(label, { text: e.text })}
        </p>
      ))}
    </>
  );
}
