import type { Storage } from "../storage/storage";

// ADR-0001: one append-only, time-ordered stream per Session, chunked only by saving.

export type RawEventBody =
  | { type: "navigate"; questionId: string }
  | { type: "select"; questionId: string; optionId: string }
  | { type: "deselect"; questionId: string; optionId: string }
  | { type: "hide" }
  /** A resume event: the page was shown or reopened. `wall` is UTC epoch ms. */
  | { type: "show"; wall: number }
  | { type: "submit" }
  /** On the review page: the Question now occupying the main part of the screen, absent when none does. */
  | { type: "onScreen"; questionId?: string }
  | { type: "expandRationale"; questionId: string; optionId: string }
  | { type: "collapseRationale"; questionId: string; optionId: string };

/** `seq` orders events across the whole Session; `at` is monotonic ms since its own chunk started. */
export type RawEvent = RawEventBody & { seq: number; at: number };

export type RawLogChunk = {
  id: string;
  sessionId: string;
  n: number;
  /** Wall-clock start of the chunk, UTC epoch ms. */
  startedAt: number;
  events: RawEvent[];
  /** Foreground time the chunk was open, monotonic ms; for an interrupted chunk, as of its last save. */
  activeMs: number;
  /** Set when the chunk was recovered from a buffer the page left behind instead of sealed by it. */
  interrupted?: true;
  /** `hash` of the chunk before this one; null for the first chunk. */
  prevHash: string | null;
  /** SHA-256 of every other field of this chunk, hex. */
  hash: string;
};

/** The chunk being recorded, saved every few seconds by overwriting; one per Session, keyed by Session id. */
type RawLogBuffer = { id: string; sessionId: string; n: number; startedAt: number; events: RawEvent[]; activeMs: number };

/** The result of checking a Raw log's hash chain; `chunkId` names the first chunk that fails. */
export type Integrity = { ok: true } | { ok: false; chunkId: string };

export type Clock = { wall: () => number; monotonic: () => number };

const browserClock: Clock = { wall: () => Date.now(), monotonic: () => performance.now() };

// Kept below the artifact mode's 256 kB per-document limit.
const DEFAULT_MAX_CHUNK_BYTES = 200 * 1024;
// Room for a chunk's header fields and for each event's `seq` and `at`, which are not known when sizing.
const HEADER_BYTES = 512;
const STAMP_BYTES = 40;

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

export type RecorderOptions = { maxChunkBytes?: number };

export type Recorder = {
  /** The hash chain as found when the Recorder was opened. */
  integrity: Integrity;
  append(event: RawEventBody): void;
  /** Overwrites the saved buffer with the current chunk, so a killed page loses only what came after. */
  save(): Promise<void>;
  /** Writes the current chunk once and starts a new one. A sealed chunk is never written again. */
  seal(): Promise<void>;
  /** The page was hidden and may be killed: records it and seals the chunk. */
  hide(): Promise<void>;
  /** The page was shown or reopened: records a resume event, which starts a new chunk after a seal. */
  show(): void;
  /** Foreground time of the whole Session so far: earlier chunks plus the current one, never the gaps between. */
  activeMs(): number;
};

/** Raw log chunks use composite IDs (ADR-0003). */
const chunkId = (sessionId: string, n: number) => `${sessionId}_${n}`;

/** Seals a buffer the page left behind as `interrupted`, and returns the whole Raw log including it. */
export async function recoverRawLog(storage: Storage, sessionId: string): Promise<RawLogChunk[]> {
  let sealed = await readRawLog(storage, sessionId);
  const buffer = await storage.get<RawLogBuffer>("rawLogBuffers", sessionId);
  if (!buffer) return sealed;
  const last = sealed.at(-1);
  // A buffer whose chunk was already sealed is left over from a seal that ran before the buffer was removed.
  if (buffer.n === (last ? last.n + 1 : 0) && buffer.events.length > 0) {
    const { n, startedAt, events, activeMs } = buffer;
    const chunk = await withHash({ id: chunkId(sessionId, n), sessionId, n, startedAt, events, activeMs, interrupted: true }, last?.hash ?? null);
    await storage.add("rawLogChunks", chunk);
    sealed = [...sealed, chunk];
  }
  await storage.delete("rawLogBuffers", sessionId);
  return sealed;
}

/** Opens the Session's Raw log for appending, continuing after any chunks already sealed. */
export async function openRecorder(
  storage: Storage,
  sessionId: string,
  clock: Clock = browserClock,
  { maxChunkBytes = DEFAULT_MAX_CHUNK_BYTES }: RecorderOptions = {},
): Promise<Recorder> {
  const sealed = await recoverRawLog(storage, sessionId);
  const last = sealed.at(-1);
  let n = last ? last.n + 1 : 0;
  let seq = sealed.reduce((max, chunk) => Math.max(max, ...chunk.events.map((e) => e.seq)), 0);
  let current: { startedAt: number; monotonicStart: number; events: RawEvent[]; bytes: number } | undefined;
  let sealedActiveMs = sealed.reduce((sum, chunk) => sum + chunk.activeMs, 0);
  // Monotonic time is only meaningful within the chunk it was read in.
  const elapsed = (chunk: { monotonicStart: number }) => Math.round(clock.monotonic() - chunk.monotonicStart);
  let prevHash = last?.hash ?? null;
  // Each chunk's hash depends on the one before, so writes run one at a time, in order.
  let writes = Promise.resolve();
  const enqueue = (write: () => Promise<void>) => {
    const done = writes.then(write);
    writes = done.catch(() => {});
    return done;
  };

  const recorder: Recorder = {
    integrity: await checkChain(sessionId, sealed),
    append(event) {
      const bytes = byteLength(event) + STAMP_BYTES;
      if (current && HEADER_BYTES + current.bytes + bytes > maxChunkBytes) {
        void recorder.seal().catch((e: unknown) => console.error("Sealing a full Raw log chunk failed", e));
      }
      current ??= { startedAt: clock.wall(), monotonicStart: clock.monotonic(), events: [], bytes: 0 };
      current.bytes += bytes;
      current.events.push({ ...event, seq: ++seq, at: elapsed(current) });
    },
    save() {
      if (!current) return writes;
      const buffer: RawLogBuffer = { id: sessionId, sessionId, n, startedAt: current.startedAt, events: [...current.events], activeMs: elapsed(current) };
      return enqueue(() => storage.set("rawLogBuffers", buffer));
    },
    seal() {
      if (!current) return writes;
      const body = { id: chunkId(sessionId, n), sessionId, n, startedAt: current.startedAt, events: current.events, activeMs: elapsed(current) };
      sealedActiveMs += body.activeMs;
      n += 1;
      current = undefined;
      return enqueue(async () => {
        const chunk = await withHash(body, prevHash);
        await storage.add("rawLogChunks", chunk);
        prevHash = chunk.hash;
        await storage.delete("rawLogBuffers", sessionId);
      });
    },
    async hide() {
      recorder.append({ type: "hide" });
      await recorder.seal();
    },
    show() {
      recorder.append({ type: "show", wall: clock.wall() });
    },
    activeMs() {
      return sealedActiveMs + (current ? elapsed(current) : 0);
    },
  };
  return recorder;
}

/** JSON with object keys sorted, so a chunk hashes the same however storage orders its fields. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hashOf(chunk: Omit<RawLogChunk, "hash">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(chunk)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function withHash(body: Omit<RawLogChunk, "prevHash" | "hash">, prevHash: string | null): Promise<RawLogChunk> {
  const unhashed = { ...body, prevHash };
  return { ...unhashed, hash: await hashOf(unhashed) };
}

async function checkChain(sessionId: string, chunks: RawLogChunk[]): Promise<Integrity> {
  let prevHash: string | null = null;
  for (const [n, chunk] of chunks.entries()) {
    if (chunk.n !== n) return { ok: false, chunkId: chunkId(sessionId, n) };
    const { hash, ...unhashed } = chunk;
    if (chunk.prevHash !== prevHash || (await hashOf(unhashed)) !== hash) return { ok: false, chunkId: chunk.id };
    prevHash = hash;
  }
  return { ok: true };
}

export async function readRawLog(storage: Storage, sessionId: string): Promise<RawLogChunk[]> {
  const chunks = await storage.query<RawLogChunk>("rawLogChunks", { sessionId });
  return chunks.sort((a, b) => a.n - b.n);
}
