import type { Storage } from "../storage/storage";

// ADR-0001: one append-only, time-ordered stream per Session, chunked only by saving.
// Buffer saving, the hash chain and recovery of an interrupted buffer arrive with issue #3.

export type RawEventBody =
  | { type: "navigate"; questionId: string }
  | { type: "select"; questionId: string; optionId: string }
  | { type: "submit" };

/** `seq` orders events across the whole Session; `at` is monotonic ms since its own chunk started. */
export type RawEvent = RawEventBody & { seq: number; at: number };

export type RawLogChunk = {
  id: string;
  sessionId: string;
  n: number;
  /** Wall-clock start of the chunk, UTC epoch ms. */
  startedAt: number;
  events: RawEvent[];
};

export type Clock = { wall: () => number; monotonic: () => number };

const browserClock: Clock = { wall: () => Date.now(), monotonic: () => performance.now() };

export type Recorder = {
  append(event: RawEventBody): void;
  /** Writes the current chunk once and starts a new one. A sealed chunk is never written again. */
  seal(): Promise<void>;
};

/** Opens the Session's Raw log for appending, continuing after any chunks already sealed. */
export async function openRecorder(storage: Storage, sessionId: string, clock: Clock = browserClock): Promise<Recorder> {
  const sealed = await readRawLog(storage, sessionId);
  const last = sealed.at(-1);
  let n = last ? last.n + 1 : 0;
  let seq = sealed.reduce((max, chunk) => Math.max(max, ...chunk.events.map((e) => e.seq)), 0);
  let current: { startedAt: number; monotonicStart: number; events: RawEvent[] } | undefined;

  return {
    append(event) {
      current ??= { startedAt: clock.wall(), monotonicStart: clock.monotonic(), events: [] };
      current.events.push({ ...event, seq: ++seq, at: Math.round(clock.monotonic() - current.monotonicStart) });
    },
    async seal() {
      if (!current) return;
      const chunk: RawLogChunk = { id: `${sessionId}_${n}`, sessionId, n, startedAt: current.startedAt, events: current.events };
      n += 1;
      current = undefined;
      await storage.add("rawLogChunks", chunk);
    },
  };
}

export async function readRawLog(storage: Storage, sessionId: string): Promise<RawLogChunk[]> {
  const chunks = await storage.query<RawLogChunk>("rawLogChunks", { sessionId });
  return chunks.sort((a, b) => a.n - b.n);
}
