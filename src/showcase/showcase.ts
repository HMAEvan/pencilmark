import type { QuestionSet } from "../domain/types";
import type { Storage } from "../storage/storage";
import { createMemoryStorage } from "../storage/memoryStorage";
import { commitImport, packErrorsText, parseQuestionPack, previewImport } from "../importer/importer";
import { openRecorder, type Clock, type RawEventBody } from "../recorder/recorder";
import { startSession, submitSession } from "../session/sessions";

// A Showcase replays its Showcase script in memory: the user's own Storage is never touched, and a reload discards everything.

/** One action of the Showcase script: a Raw log event body naming Questions by their label in the Question pack, at `ms` from the start. A resume event's wall-clock time comes from the scripted Clock. */
export type ShowcaseScriptEvent = { ms: number } & (Exclude<RawEventBody, { type: "show" }> | { type: "show" });

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
  events: ShowcaseScriptEvent[];
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
  let ms = 0;
  const clock: Clock = { wall: () => start + ms, monotonic: () => ms };
  let recorder = await openRecorder(storage, session.id, clock);
  for (const { ms: at, ...event } of script.events) {
    if (at < ms) throw new Error(`Showcase ${name}: events must be in time order, but ${at} ms follows ${ms} ms`);
    ms = at;
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
