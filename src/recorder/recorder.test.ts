import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { openRecorder, readRawLog, recoverRawLog, type RawLogChunk } from "./recorder";
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

  it("seals the chunk when the page is hidden, and starts a new chunk with wall-clock times when it is shown", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(Date.UTC(2026, 9, 26, 9, 0, 0));
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);

    recorder.append({ type: "select", questionId: "q_x", optionId: "opt_a" });
    advance(2000);
    recorder.append({ type: "deselect", questionId: "q_x", optionId: "opt_a" });
    advance(1000);
    await recorder.hide();
    expect(await readRawLog(storage, "ss_20261026_abcdef")).toHaveLength(1);

    advance(5 * 60_000);
    recorder.show();
    advance(1500);
    recorder.append({ type: "navigate", questionId: "q_y" });
    await recorder.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks[0]!.events).toEqual([
      { seq: 1, at: 0, type: "select", questionId: "q_x", optionId: "opt_a" },
      { seq: 2, at: 2000, type: "deselect", questionId: "q_x", optionId: "opt_a" },
      { seq: 3, at: 3000, type: "hide" },
    ]);
    expect(chunks[1]!.startedAt).toBe(Date.UTC(2026, 9, 26, 9, 5, 3));
    expect(chunks[1]!.events).toEqual([
      { seq: 4, at: 0, type: "show", wall: Date.UTC(2026, 9, 26, 9, 5, 3) },
      { seq: 5, at: 1500, type: "navigate", questionId: "q_y" },
    ]);
  });

  it("at a checkpoint, seals the chunk and starts the next one at once, so no foreground time is lost", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(Date.UTC(2026, 9, 26, 9, 0, 0));
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);

    recorder.append({ type: "onScreen", questionId: "q_x" });
    advance(3000);
    recorder.append({ type: "exportAnswerPack", includeRawLog: true });
    await recorder.checkpoint();
    expect(await readRawLog(storage, "ss_20261026_abcdef")).toHaveLength(1);

    advance(4000);
    recorder.append({ type: "onScreen", questionId: "q_y" });
    advance(1000);
    await recorder.hide();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks[0]).toMatchObject({ activeMs: 3000, events: [{ seq: 1, at: 0, type: "onScreen", questionId: "q_x" }, { seq: 2, at: 3000, type: "exportAnswerPack", includeRawLog: true }] });
    expect(chunks[1]).toMatchObject({
      startedAt: Date.UTC(2026, 9, 26, 9, 0, 3),
      activeMs: 5000,
      events: [{ seq: 3, at: 4000, type: "onScreen", questionId: "q_y" }, { seq: 4, at: 5000, type: "hide" }],
    });
    expect(recorder.activeMs()).toBe(8000);
    expect((await openRecorder(storage, "ss_20261026_abcdef", clock)).integrity).toEqual({ ok: true });
  });

  it("seals a chunk nearing the size limit and continues recording in a new chunk", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock, { maxChunkBytes: 2000 });

    for (let i = 0; i < 40; i++) {
      recorder.append({ type: "select", questionId: "q_x", optionId: `opt_${i}` });
      advance(100);
    }
    await recorder.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(new TextEncoder().encode(JSON.stringify(chunk)).length).toBeLessThanOrEqual(2000);
    expect(chunks.flatMap((c) => c.events.map((e) => e.seq))).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
    expect(chunks[1]!.events[0]!.at).toBe(0);
    expect((await openRecorder(storage, "ss_20261026_abcdef", clock)).integrity).toEqual({ ok: true });
  });

  it("keeps the default chunk size limit below 256 kB", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    for (let i = 0; i < 5000; i++) recorder.append({ type: "select", questionId: "q_20261026_xxxxxx", optionId: `opt_${i}` });
    await recorder.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(new TextEncoder().encode(JSON.stringify(chunk)).length).toBeLessThan(256 * 1024);
  });

  it("seals a buffer left by a killed page as interrupted, losing only events after the last save", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(Date.UTC(2026, 9, 26, 9, 0, 0));
    const killed = await openRecorder(storage, "ss_20261026_abcdef", clock);
    killed.append({ type: "navigate", questionId: "q_x" });
    advance(3000);
    killed.append({ type: "select", questionId: "q_x", optionId: "opt_a" });
    await killed.save();
    killed.append({ type: "select", questionId: "q_x", optionId: "opt_b" });

    advance(60_000);
    const reopened = await openRecorder(storage, "ss_20261026_abcdef", clock);
    reopened.show();
    await reopened.seal();

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks[0]).toMatchObject({ n: 0, startedAt: Date.UTC(2026, 9, 26, 9, 0, 0), interrupted: true });
    expect(chunks[0]!.events).toEqual([
      { seq: 1, at: 0, type: "navigate", questionId: "q_x" },
      { seq: 2, at: 3000, type: "select", questionId: "q_x", optionId: "opt_a" },
    ]);
    expect(chunks[1]!.events).toEqual([{ seq: 3, at: 0, type: "show", wall: Date.UTC(2026, 9, 26, 9, 1, 3) }]);
    expect(chunks[1]!.interrupted).toBeUndefined();
    expect(reopened.integrity).toEqual({ ok: true });
  });

  it("recovers a leftover buffer without opening a Recorder", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const killed = await openRecorder(storage, "ss_20261026_abcdef", clock);
    killed.append({ type: "navigate", questionId: "q_x" });
    await killed.save();

    const chunks = await recoverRawLog(storage, "ss_20261026_abcdef");
    expect(chunks).toMatchObject([{ n: 0, interrupted: true, events: [{ seq: 1, type: "navigate" }] }]);
    expect(await readRawLog(storage, "ss_20261026_abcdef")).toHaveLength(1);
  });

  it("does not recover a buffer whose chunk was sealed", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    recorder.append({ type: "navigate", questionId: "q_x" });
    await recorder.save();
    await recorder.seal();

    await openRecorder(storage, "ss_20261026_abcdef", clock);
    await openRecorder(storage, "ss_20261026_abcdef", clock);

    const chunks = await readRawLog(storage, "ss_20261026_abcdef");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.interrupted).toBeUndefined();
  });

  it("counts active time only while chunks are open, not while the page is hidden", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    recorder.show();
    advance(3000);
    await recorder.hide();
    advance(5 * 60_000);
    recorder.show();
    advance(2000);

    expect(recorder.activeMs()).toBe(5000);
    await recorder.seal();
    expect((await readRawLog(storage, "ss_20261026_abcdef")).map((c) => c.activeMs)).toEqual([3000, 2000]);
  });

  it("resumes active time after a reload from the sealed chunks and the last saved buffer, not counting the gap", async () => {
    const storage = makeStorage();
    const { clock, advance } = fakeClock(0);
    const first = await openRecorder(storage, "ss_20261026_abcdef", clock);
    first.show();
    advance(3000);
    await first.hide();
    first.show();
    advance(4000);
    await first.save();
    advance(500);

    advance(10 * 60_000);
    const reopened = await openRecorder(storage, "ss_20261026_abcdef", clock);
    expect(reopened.activeMs()).toBe(7000);
    reopened.show();
    advance(1000);
    expect(reopened.activeMs()).toBe(8000);
    expect((await readRawLog(storage, "ss_20261026_abcdef"))[1]).toMatchObject({ interrupted: true, activeMs: 4000 });
  });

  it("reports an intact hash chain on load", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    for (const optionId of ["opt_a", "opt_b", "opt_c"]) {
      recorder.append({ type: "select", questionId: "q_x", optionId });
      await recorder.seal();
    }

    expect((await openRecorder(storage, "ss_20261026_abcdef", clock)).integrity).toEqual({ ok: true });
  });

  it.each([
    ["an event is changed", (chunk: RawLogChunk) => ({ ...chunk, events: [{ ...chunk.events[0]!, optionId: "opt_z" }] })],
    ["the start time is changed", (chunk: RawLogChunk) => ({ ...chunk, startedAt: chunk.startedAt + 1 })],
    ["its stored hash is replaced", (chunk: RawLogChunk) => ({ ...chunk, hash: "0".repeat(64) })],
  ])("names the altered chunk when %s", async (_what, alter) => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    for (const optionId of ["opt_a", "opt_b", "opt_c"]) {
      recorder.append({ type: "select", questionId: "q_x", optionId });
      await recorder.seal();
    }
    const middle = (await readRawLog(storage, "ss_20261026_abcdef"))[1]!;
    await storage.set("rawLogChunks", alter(middle));

    expect((await openRecorder(storage, "ss_20261026_abcdef", clock)).integrity).toEqual({ ok: false, chunkId: "ss_20261026_abcdef_1" });
  });

  it("names the chunk that is missing from the chain", async () => {
    const storage = makeStorage();
    const { clock } = fakeClock(0);
    const recorder = await openRecorder(storage, "ss_20261026_abcdef", clock);
    for (const optionId of ["opt_a", "opt_b", "opt_c"]) {
      recorder.append({ type: "select", questionId: "q_x", optionId });
      await recorder.seal();
    }
    // Moving chunk 1 to another Session removes it from this one's Raw log.
    const middle = (await readRawLog(storage, "ss_20261026_abcdef"))[1]!;
    await storage.set("rawLogChunks", { ...middle, sessionId: "ss_20261026_zzzzzz" });

    expect((await openRecorder(storage, "ss_20261026_abcdef", clock)).integrity).toEqual({ ok: false, chunkId: "ss_20261026_abcdef_1" });
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
