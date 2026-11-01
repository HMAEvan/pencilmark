import type { QuestionSet } from "../domain/types";
import type { Storage } from "../storage/storage";
import { createMemoryStorage } from "../storage/memoryStorage";
import { commitImport, packErrorsText, parseQuestionPack, previewImport } from "../importer/importer";
import { openRecorder, type Clock, type RawEventBody } from "../recorder/recorder";
import { recordTextEntry, type TextEntryRecording, type TextField } from "../recorder/textEntry";
import { startSession, submitSession } from "../session/sessions";

// A Showcase replays its Showcase script in memory: the user's own Storage is never touched, and a reload discards everything.

/** One action of the Showcase script: a Raw log event body naming Questions by their label in the Question pack, at `ms` from the start. A resume event's wall-clock time comes from the scripted Clock. */
export type ShowcaseScriptEvent = { ms: number } & (Exclude<RawEventBody, { type: "show" }> | { type: "show" });

/**
 * One stretch in which a Text entry was written, from `from` to `to` ms. First `remove` is taken off the end of the
 * text (it must be what the text ends with), then `add` is typed after it. The changes are spread evenly over the stretch,
 * word by word: the first at `from`, the last at `to`.
 */
export type WritingStretch = { from: number; to: number; add?: string; remove?: string };

/** Writing a Note or Challenge statement over time: the stretches in order, then one save at the end of the last. It has no `ms`; other actions may fall between its stretches. */
export type ShowcaseWriteAction = { type: "write"; questionId: string; field: TextField; entry: number; stretches: WritingStretch[] };

const WORDS = /\S+\s*|\s+/g;

export type ShowcaseScript = {
  /** A file name under `samples/`, so the Importer's sample-pack test covers it. */
  questionPack: string;
  /** When the scripted Session starts, ISO 8601. */
  startedAt: string;
  /** The displayed Question order, by label. */
  questionOrder: string[];
  /** Displayed Option orders by Question label; a Question left out shows its Options in authored order. */
  optionOrders?: Record<string, string[]>;
  /** In time order. `submit` reveals the answers; the events after it are on the review page, which opens its own Recorder. */
  events: (ShowcaseScriptEvent | ShowcaseWriteAction)[];
};

/** What a Feedback was written by and from: the model, the grading Skill version and the date, and the claude.ai conversation when shared. */
export type FeedbackLabel = { model: string; gradingSkillVersion: string; date: string; conversationUrl?: string };

export type Showcase = { name: string; script: ShowcaseScript; pack: string; feedback?: { label: FeedbackLabel; text: string } };

const scripts = import.meta.glob<ShowcaseScript>("../../showcases/*/script.json", { import: "default", eager: true });
const packs = import.meta.glob<string>("../../samples/*.json", { query: "?raw", import: "default", eager: true });
const feedbackTexts = import.meta.glob<string>("../../showcases/*/feedback.md", { query: "?raw", import: "default", eager: true });
const feedbackLabels = import.meta.glob<FeedbackLabel>("../../showcases/*/feedback.json", { import: "default", eager: true });

/** Each Showcase is a folder under `showcases/`: `script.json`, the stored `digest.md`, and optionally `feedback.md` with its `feedback.json` label. */
export const SHOWCASES: Showcase[] = Object.entries(scripts).map(([path, script]) => {
  const folder = path.slice(0, -"script.json".length);
  const pack = packs[`../../samples/${script.questionPack}`];
  if (pack === undefined) throw new Error(`${path} names a Question pack not under samples/: ${script.questionPack}`);
  const text = feedbackTexts[`${folder}feedback.md`];
  const label = feedbackLabels[`${folder}feedback.json`];
  return { name: folder.split("/").at(-2)!, script, pack, ...(text !== undefined && label && { feedback: { label, text } }) };
});

export const showcaseNamed = (name: string) => SHOWCASES.find((s) => s.name === name);

/**
 * Sits the Showcase's Session in a fresh in-memory Storage: the Question pack through the Importer, then the Showcase
 * script through the real Recorder with a scripted Clock, submitted and derived as the Player and review page would.
 */
export async function replayShowcase({ name, script, pack }: Showcase): Promise<{ storage: Storage; sessionId: string }> {
  const storage = createMemoryStorage();
  const start = Date.parse(script.startedAt);
  const parsed = parseQuestionPack(pack);
  if (!parsed.ok) throw new Error(packErrorsText(parsed.errors));
  const preview = await previewImport(parsed.pack, storage);
  const { setId } = await commitImport(preview, storage, { confirmedTopicPaths: preview.newTopicPaths }, new Date(start));
  const set = (await storage.get<QuestionSet>("sets", setId))!;

  // In an empty Storage every Question is new, so the Set lists them in the pack's order.
  const byLabel = new Map(parsed.pack.questions.map((q, i) => [q.label, { id: set.entries[i]!.questionId, optionIds: q.options.map((o) => o.id) }]));
  const question = (label: string) => {
    const found = byLabel.get(label);
    if (!found) throw new Error(`Showcase ${name} names no Question "${label}" of its Question pack`);
    return found;
  };
  const withIds = (event: Exclude<RawEventBody, { type: "show" | "hide" | "submit" }>): RawEventBody => {
    if (!("questionId" in event) || event.questionId === undefined) return event;
    const { id, optionIds } = question(event.questionId);
    if ("optionId" in event && !optionIds.includes(event.optionId)) throw new Error(`Showcase ${name}: Question "${event.questionId}" has no Option ${event.optionId}`);
    return { ...event, questionId: id };
  };

  const session = await startSession(storage, set, {
    now: new Date(start),
    orders: {
      questionOrder: script.questionOrder.map((label) => question(label).id),
      optionOrders: Object.fromEntries([...byLabel].map(([label, q]) => [q.id, script.optionOrders?.[label] ?? q.optionIds])),
    },
  });
  // A writing action becomes timed changes and a save, merged with the other actions by time (equal times keep script order).
  type Change = { inputType: string; value: string } | { save: string };
  type Timed = { ms: number; event: ShowcaseScriptEvent } | { ms: number; write: ShowcaseWriteAction; change: Change };
  const timed: Timed[] = script.events.flatMap((action): Timed[] => {
    if (action.type !== "write") return [{ ms: action.ms, event: action }];
    question(action.questionId);
    const where = `Showcase ${name}: writing ${action.field} ${action.entry} of ${action.questionId}`;
    const out: Timed[] = [];
    let text = "";
    let last = 0;
    for (const { from, to, add = "", remove = "" } of action.stretches) {
      if (from > to || from < last) throw new Error(`${where}: stretches must be in time order, but ${from}-${to} ms follows ${last} ms`);
      last = to;
      if (!text.endsWith(remove)) throw new Error(`${where}: cannot remove "${remove}", the text ends with "${text.slice(-remove.length)}"`);
      const changes: Change[] = [];
      // Deleting runs back from the end a word at a time, then typing runs forward.
      for (const word of [...(remove.match(WORDS) ?? [])].reverse()) {
        text = text.slice(0, text.length - word.length);
        changes.push({ inputType: "deleteContentBackward", value: text });
      }
      for (const word of add.match(WORDS) ?? []) {
        text += word;
        changes.push({ inputType: "insertText", value: text });
      }
      changes.forEach((change, i) => out.push({ ms: changes.length === 1 ? from : Math.round(from + ((to - from) * i) / (changes.length - 1)), write: action, change }));
    }
    out.push({ ms: last, write: action, change: { save: text } });
    return out;
  });
  timed.sort((a, b) => a.ms - b.ms);
  const recordings = new Map<string, TextEntryRecording>();
  let ms = 0;
  const clock: Clock = { wall: () => start + ms, monotonic: () => ms };
  let recorder = await openRecorder(storage, session.id, clock);
  let authored = 0;
  for (const item of timed) {
    ms = item.ms;
    if ("write" in item) {
      const { questionId, field, entry } = item.write;
      const key = `${questionId} ${field} ${entry}`;
      if (!recordings.has(key)) recordings.set(key, recordTextEntry((e) => recorder.append(withIds(e as never)), { questionId, field, entry }, ""));
      const recording = recordings.get(key)!;
      if ("save" in item.change) recording.blur(item.change.save);
      else recording.input(item.change.value, item.change.inputType, false);
      continue;
    }
    const { ms: at, ...event } = item.event;
    if (at < authored) throw new Error(`Showcase ${name}: events must be in time order, but ${at} ms follows ${authored} ms`);
    authored = at;
    if (event.type === "show") recorder.show();
    else if (event.type === "hide") await recorder.hide();
    else if (event.type === "submit") {
      await submitSession(storage, session, set, recorder, clock.wall());
      recorder = await openRecorder(storage, session.id, clock);
    } else recorder.append(withIds(event));
  }
  // Like leaving the review page; reading the Session derives it again with these chunks.
  await recorder.seal();
  return { storage, sessionId: session.id };
}
