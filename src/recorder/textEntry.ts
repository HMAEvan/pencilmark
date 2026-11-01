import type { RawEventBody } from "./recorder";

// ADR-0010: every change to a Text entry (a Note or a Challenge statement) is a Raw log event, and a save carries the
// whole text when the field loses focus. Shared by every field that holds a Text entry, so they all record alike.

/** Which kind of Text entry: stored in every event, so the values never change. */
export type TextField = "note" | "challenge";

/** Taken from the input event's `inputType`; a committed composition is typing. */
export type TextChangeKind = "typing" | "deleting" | "pasting" | "cutting" | "dragging" | "undo" | "redo" | "other";

/** `entry` is the Text entry's place among the Phase's entries of that field, 0 for the first. */
export type TextEntryTarget = { questionId: string; field: TextField; entry: number };

export function textChangeKind(inputType: string): TextChangeKind {
  if (inputType === "insertFromPaste" || inputType === "insertFromPasteAsQuotation") return "pasting";
  if (inputType === "deleteByCut") return "cutting";
  if (inputType === "insertFromDrop" || inputType === "deleteByDrag") return "dragging";
  if (inputType === "historyUndo") return "undo";
  if (inputType === "historyRedo") return "redo";
  if (inputType.startsWith("delete")) return "deleting";
  if (inputType.startsWith("insert")) return "typing";
  return "other";
}

/** The one stretch that differs between two texts, at a position in UTF-16 code units; undefined when they are equal. */
export function textDifference(before: string, after: string): { position: number; removed: string; inserted: string } | undefined {
  if (before === after) return undefined;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return { position: start, removed: before.slice(start, before.length - end), inserted: after.slice(start, after.length - end) };
}

export type TextEntryRecording = {
  /** An `input` event, with the field's value after it. Ignored while an input method is composing. */
  input(value: string, inputType: string, isComposing: boolean): void;
  /** The composition was committed: its text is recorded as one change. */
  compositionEnd(value: string): void;
  /** The field lost focus: the whole text is saved, when it changed since the last save. */
  blur(value: string): void;
};

/** Records one Text entry's changes and saves; `saved` is its text as last saved. */
export function recordTextEntry(append: (event: RawEventBody) => void, target: TextEntryTarget, saved: string): TextEntryRecording {
  let text = saved;
  let lastSaved = saved;
  const record = (value: string, kind: TextChangeKind) => {
    const difference = textDifference(text, value);
    if (!difference) return;
    text = value;
    append({ type: "textInput", ...target, ...difference, kind });
  };
  return {
    input(value, inputType, isComposing) {
      if (!isComposing) record(value, textChangeKind(inputType));
    },
    compositionEnd(value) {
      record(value, "typing");
    },
    blur(value) {
      record(value, "typing");
      if (value === lastSaved) return;
      lastSaved = value;
      append({ type: "textSave", ...target, text: value });
    },
  };
}
