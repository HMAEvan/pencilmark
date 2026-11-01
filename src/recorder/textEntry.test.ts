import { describe, expect, it } from "vitest";
import { openRecorder, type RawEventBody } from "./recorder";
import { recordTextEntry } from "./textEntry";
import { createMemoryStorage } from "../storage/memoryStorage";

// ADR-0010: every change to a Text entry is a Raw log event; a save carries the whole text when the field loses focus.

const clock = { wall: () => 0, monotonic: () => 0 };
const NOTE = { questionId: "q_x", field: "note", entry: 0 } as const;

/** The events a Text entry records into a real Recorder, without the Recorder's `seq` and `at`. */
async function recorded(saved: string, act: (entry: ReturnType<typeof recordTextEntry>) => void, target: { questionId: string; field: "note" | "challenge"; entry: number } = NOTE): Promise<RawEventBody[]> {
  const recorder = await openRecorder(createMemoryStorage(), "ss_20261101_tttttt", clock);
  act(recordTextEntry((event) => recorder.append(event), target, saved));
  return recorder.rawLog().flatMap((chunk) => chunk.events.map(({ seq: _seq, at: _at, ...event }) => event as RawEventBody));
}

const change = (position: number, removed: string, inserted: string, kind: string) => ({ type: "textInput", ...NOTE, position, removed, inserted, kind });

describe("Recorder: Text entry", () => {
  it("records typing, deleting and pasting as changes with their position, removed and inserted text, and kind", async () => {
    const events = await recorded("", (entry) => {
      entry.input("H", "insertText", false);
      entry.input("Hi", "insertText", false);
      entry.input("H", "deleteContentBackward", false);
      entry.input("Hello there", "insertFromPaste", false);
      entry.input("Hello", "deleteByCut", false);
      entry.input("Hello there", "historyUndo", false);
      entry.input("Hello", "historyRedo", false);
      entry.input("Hello\n", "insertLineBreak", false);
    });
    expect(events).toEqual([
      change(0, "", "H", "typing"),
      change(1, "", "i", "typing"),
      change(1, "i", "", "deleting"),
      change(1, "", "ello there", "pasting"),
      change(5, " there", "", "cutting"),
      change(5, "", " there", "undo"),
      change(5, " there", "", "redo"),
      change(5, "", "\n", "typing"),
    ]);
  });

  it("records a paste over a selection as one change removing the selection", async () => {
    const events = await recorded("The cat sat", (entry) => entry.input("The dog sat", "insertFromPaste", false));
    expect(events).toEqual([change(4, "cat", "dog", "pasting")]);
  });

  it("records an input method's composition once, when committed, never its intermediate states", async () => {
    const events = await recorded("我", (entry) => {
      entry.input("我s", "insertCompositionText", true);
      entry.input("我shi", "insertCompositionText", true);
      entry.input("我是", "insertCompositionText", true);
      entry.compositionEnd("我是");
      // Some browsers send one more input event after the composition ends; it changes nothing.
      entry.input("我是", "insertCompositionText", false);
    });
    expect(events).toEqual([change(1, "", "是", "typing")]);
  });

  it("records a save with the whole text when the field loses focus, and none when nothing changed since the last save", async () => {
    const events = await recorded("Old", (entry) => {
      entry.blur("Old");
      entry.input("Old!", "insertText", false);
      entry.blur("Old!");
      entry.blur("Old!");
    });
    expect(events).toEqual([change(3, "", "!", "typing"), { type: "textSave", ...NOTE, text: "Old!" }]);
  });

  it("records a change not yet seen, such as a composition cut short by leaving the field, before the save", async () => {
    const events = await recorded("", (entry) => {
      entry.input("n", "insertCompositionText", true);
      entry.blur("你");
    });
    expect(events).toEqual([change(0, "", "你", "typing"), { type: "textSave", ...NOTE, text: "你" }]);
  });

  it("names the field and entry, so a Challenge statement is recorded as `challenge`", async () => {
    const target = { questionId: "q_y", field: "challenge", entry: 0 } as const;
    const events = await recorded("", (entry) => {
      entry.input("Two answers fit", "insertFromPaste", false);
      entry.blur("Two answers fit");
    }, target);
    expect(events).toEqual([
      { type: "textInput", ...target, position: 0, removed: "", inserted: "Two answers fit", kind: "pasting" },
      { type: "textSave", ...target, text: "Two answers fit" },
    ]);
  });
});
