import type { Question, QuestionSet, Session } from "../domain/types";
import { newId } from "../domain/ids";
import type { Storage } from "../storage/storage";
import { readRawLog, recoverRawLog, type RawEventBody, type Recorder } from "../recorder/recorder";
import { DEFAULT_PREFERENCES, settingsSnapshot } from "../domain/settings";
import { ALGORITHM_VERSION, derive, type DerivationInput, type DerivationResult, type DerivedAttempt, type OverrideValues } from "../derivation/derivation";

// Wires Storage, the Recorder and Derivation together for the UI.

/** ADR-0002: one record per computation, never overwritten. Holds everything derived except the Attempts. */
export type Derivation = Omit<DerivationResult, "attempts"> & {
  id: string;
  sessionId: string;
  computedAt: number;
  source: "user";
  updatedAt: number;
};

export type Attempt = DerivedAttempt & { id: string; derivationId: string; sessionId: string; source: "user"; updatedAt: number };

/** A user's Overrides for one Question of one Session. Kept apart from derivations, so it survives recomputation. */
export type Override = OverrideValues & { id: string; sessionId: string; questionId: string; overriddenAt: number; source: "user"; updatedAt: number };

const overrideId = (sessionId: string, questionId: string) => `${sessionId}_${questionId}`;

export async function loadOverrides(storage: Storage, sessionId: string): Promise<Map<string, Override>> {
  const overrides = await storage.query<Override>("overrides", { sessionId });
  return new Map(overrides.map((o) => [o.questionId, o]));
}

/** Sets or, with `undefined`, clears corrected values for one Question; other corrected values are kept. */
export async function setOverride(storage: Storage, sessionId: string, questionId: string, values: OverrideValues): Promise<Override> {
  const id = overrideId(sessionId, questionId);
  const now = Date.now();
  const merged: Override = { ...(await storage.get<Override>("overrides", id)), ...values, id, sessionId, questionId, overriddenAt: now, source: "user", updatedAt: now };
  for (const key of Object.keys(values) as (keyof OverrideValues)[]) if (merged[key] === undefined) delete merged[key];
  await storage.set("overrides", merged);
  return merged;
}

export async function loadQuestions(storage: Storage, set: QuestionSet): Promise<Question[]> {
  const questions = await Promise.all(set.entries.map((e) => storage.get<Question>("questions", e.questionId)));
  return questions.filter((q): q is Question => q !== undefined);
}

export async function latestSession(storage: Storage, setId: string): Promise<Session | undefined> {
  const sessions = await storage.query<Session>("sessions", { setId });
  return sessions.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** A Set never has more than one `in_progress` Session. */
export async function inProgressSession(storage: Storage, setId: string): Promise<Session | undefined> {
  return (await storage.query<Session>("sessions", { setId, status: "in_progress" }))[0];
}

/** Continues the Set's in-progress Session, or starts a new Exam-mode Session. */
export async function startSession(storage: Storage, set: QuestionSet): Promise<Session> {
  const existing = await inProgressSession(storage, set.id);
  if (existing) return existing;

  const questions = await loadQuestions(storage, set);
  const now = new Date();
  // Shuffling arrives with issue #5; for now the authored orders are displayed.
  const session: Session = {
    id: newId("ss", now),
    setId: set.id,
    mode: "exam",
    status: "in_progress",
    startedAt: now.getTime(),
    questionOrder: questions.map((q) => q.id),
    optionOrders: Object.fromEntries(questions.map((q) => [q.id, q.options.map((o) => o.id)])),
    settings: settingsSnapshot(),
    source: "user",
    updatedAt: now.getTime(),
  };
  await storage.set("sessions", session);
  return session;
}

/** Ends an in-progress Session without submitting it. Its Raw log is kept, including any interrupted buffer. */
export async function abandonSession(storage: Storage, session: Session): Promise<void> {
  await recoverRawLog(storage, session.id);
  const now = Date.now();
  await storage.set<Session>("sessions", { ...session, status: "abandoned", endedAt: now, updatedAt: now });
}

/** What Derivation reads for a Session: its Raw log, the Question revisions it was sat against, its orders and rules. */
async function derivationInput(storage: Storage, session: Session, set: QuestionSet): Promise<DerivationInput> {
  return {
    title: set.title,
    rawLog: await readRawLog(storage, session.id),
    questions: await loadQuestions(storage, set),
    questionOrder: session.questionOrder,
    optionOrders: session.optionOrders,
    // Sessions from before settings snapshots were kept all ran with the defaults: there was no settings screen.
    rules: session.settings?.rules ?? DEFAULT_PREFERENCES.rules,
  };
}

/** Answers and marks so far, read back from the sealed Raw log so a reload shows them. Call it after opening the Recorder, which recovers a buffer a killed page left behind. */
export async function currentAttempts(storage: Storage, session: Session, set: QuestionSet): Promise<DerivedAttempt[]> {
  return derive(await derivationInput(storage, session, set)).attempts;
}

/**
 * Derives the Session from its Raw log with the current rules and points the Session at the new derivation.
 * Earlier derivations and their Attempts are kept (ADR-0002); Overrides are stored apart and still apply.
 */
export async function deriveSession(storage: Storage, session: Session, set: QuestionSet): Promise<Session> {
  const { attempts, ...derived } = derive(await derivationInput(storage, session, set));

  const now = Date.now();
  const derivation: Derivation = { ...derived, id: newId("dv", new Date(now)), sessionId: session.id, computedAt: now, source: "user", updatedAt: now };
  await storage.set("derivations", derivation);
  for (const attempt of attempts) {
    const id = `${derivation.id}_${attempt.questionId}`;
    await storage.set<Attempt>("attempts", { ...attempt, id, derivationId: derivation.id, sessionId: session.id, source: "user", updatedAt: now });
  }
  const updated: Session = { ...session, currentDerivationId: derivation.id, updatedAt: now };
  await storage.set("sessions", updated);
  return updated;
}

/**
 * Derives again when the derivation is out of date: from an older algorithm, which lacks what the current one records,
 * or missing Raw log chunks sealed since, such as marks made on the review page. Call it after opening the Recorder.
 */
export async function currentDerivation(storage: Storage, session: Session, set: QuestionSet): Promise<Derivation | undefined> {
  const derivation = session.currentDerivationId ? await storage.get<Derivation>("derivations", session.currentDerivationId) : undefined;
  if (!derivation) return derivation;
  const upToDate = derivation.algorithmVersion >= ALGORITHM_VERSION && derivation.chunks.length === (await readRawLog(storage, session.id)).length;
  if (upToDate) return derivation;
  const updated = await deriveSession(storage, session, set);
  return storage.get<Derivation>("derivations", updated.currentDerivationId!);
}

export async function submitSession(storage: Storage, session: Session, set: QuestionSet, recorder: Recorder): Promise<void> {
  recorder.append({ type: "submit" });
  await recorder.seal();
  const now = Date.now();
  await deriveSession(storage, { ...session, status: "done", endedAt: now }, set);
}

/** Records a mark made after the answers were revealed and derives the Session again, so its Attempts and Digest include it. */
export async function recordReviewMark(storage: Storage, session: Session, set: QuestionSet, recorder: Recorder, event: RawEventBody): Promise<Session> {
  recorder.append(event);
  await recorder.seal();
  return deriveSession(storage, session, set);
}
