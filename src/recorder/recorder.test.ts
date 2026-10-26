import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openRecorder, readRawLog } from "./recorder";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createIndexedDbStorage } from "../storage/indexedDbStorage";
import type { Storage } from "../storage/storage";

let dbCounter = 0;
const adapters: [string, () => Storage][] = [
  ["in-memory", () => createMemoryStorage()],
  ["IndexedDB", () => createIndexedDbStorage(`pencilmark-recorder-test-${++dbCounter}`)],
];

/** A fake pair of clocks: wall-clock UTC ms and monotonic ms, advanced together. */
function fakeClock(wallStart: number) {
  let elapsed = 0;
  return {
    clock: { wall: () => wallStart + elapsed, monotonic: () => 1000 + elapsed },
    advance: (ms: number) => (elapsed += ms),
  };
}

describe.each(adapters)("Recorder with the %s Storage adapter", (_name, makeStorage) => {
  it("keeps events in order with increasing sequence numbers and times relative to the chunk start", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(Date.UTC(2026, 9, 26, 9, 0, 0));
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);

    recorder.append({ type: "navigate", questionId: "q_x" });
    advance(4200);
    recorder.append({ type: "select", questionId: "q_x", optionId: "opt_b" });
    advance(800);
    recorder.append({ type: "submit" });
    await recorder.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.startedAt).toBe(Date.UTC(2026, 9, 26, 9, 0, 0));
    expect(chunks[0]!.events).toEqual([
      { seq: 1, at: 0, type: "navigate", questionId: "q_x" },
      { seq: 2, at: 4200, type: "select", questionId: "q_x", optionId: "opt_b" },
      { seq: 3, at: 5000, type: "submit" },
    ]);
  });

  it("starts a new chunk after sealing, continuing the sequence numbers", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(Date.UTC(2026, 9, 26, 9, 0, 0));
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);

    recorder.append({ type: "navigate", questionId: "q_x" });
    await recorder.seal();
    advance(60_000);
    recorder.append({ type: "submit" });
    await recorder.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks.map((c) => c.id)).toEqual(["ss_20261026_abcdef_0", "ss_20261026_abcdef_1"]);
    expect(chunks[1]!.startedAt).toBe(Date.UTC(2026, 9, 26, 9, 1, 0));
    expect(chunks[1]!.events).toEqual([{ seq: 2, at: 0, type: "submit" }]);
  });

  it("reopened for a Session, continues after its sealed chunks without rewriting them", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const before = await openRecorder(storage, "ss_20261026_abcdef", clock);
    before.append({ type: "navigate", questionId: "q_x" });
    before.append({ type: "select", questionId: "q_x", optionId: "opt_a" });
    await before.seal();

    const after = await openRecorder(storage, "ss_20261026_abcdef", clock);
    after.append({ type: "submit" });
    await after.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks.map((c) => c.events.map((e) => e.seq))).toEqual([[1, 2], [3]]);
  });

  it("refuses to overwrite a sealed chunk when two Recorders are open for one Session", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const first = await openRecorder(storage, "ss_20261026_abcdef", clock);
    const second = await openRecorder(storage, "ss_20261026_abcdef", clock);

    first.append({ type: "select", questionId: "q_x", optionId: "opt_a" });
    await first.seal();
    second.append({ type: "select", questionId: "q_x", optionId: "opt_b" });
    await expect(second.seal()).rejects.toThrow();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks.flatMap((c) => c.events)).toEqual([{ seq: 1, at: 0, type: "select", questionId: "q_x", optionId: "opt_a" }]);
  });

  it("keeps the Raw logs of different Sessions apart", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const first = await openRecorder(storage, "ss_20261026_aaaaaa", clock);
    const second = await openRecorder(storage, "ss_20261026_bbbbbb", clock);

    first.append({ type: "navigate", questionId: "q_x" });
    second.append({ type: "submit" });
    await first.seal();
    await second.seal();

    const chunks = await readRawLog(storage, "ss_20261026_bbbbbb");
    expect(chunks.flatMap((c) => c.events)).toEqual([{ seq: 1, at: 0, type: "submit" }]);
  });
});
