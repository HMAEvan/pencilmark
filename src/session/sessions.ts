import type { Question, QuestionSet, Session } from "../domain/types";
import { newId } from "../domain/ids";
import type { Storage } from "../storage/storage";
import { readRawLog, type Recorder } from "../recorder/recorder";
import { ALGORITHM_VERSION, derive, type DerivedAttempt } from "../derivation/derivation";

// Wires Storage, the Recorder and Derivation together for the UI.

export type Derivation = {
  id: string;
  sessionId: string;
  algorithmVersion: number;
  parameters: Record<string, never>;
  chunkIds: string[];
  computedAt: number;
  digest: string;
  source: "user";
  updatedAt: number;
};

export type Attempt = DerivedAttempt & { id: string; derivationId: string; sessionId: string; source: "user"; updatedAt: number };

export async function loadQuestions(storage: Storage, set: QuestionSet): Promise<Question[]> {
  const questions = await Promise.all(set.entries.map((e) => storage.get<Question>("questions", e.questionId)));
  return questions.filter((q): q is Question => q !== undefined);
}

export async function latestSession(storage: Storage, setId: string): Promise<Session | undefined> {
  const sessions = await storage.query<Session>("sessions", { setId });
  return sessions.sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** Continues the Set's in-progress Session, or starts a new Exam-mode Session. */
export async function startSession(storage: Storage, set: QuestionSet): Promise<Session> {
  const existing = (await storage.query<Session>("sessions", { setId: set.id, status: "in_progress" }))[0];
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
    source: "user",
    updatedAt: now.getTime(),
  };
  await storage.set("sessions", session);
  return session;
}

/** Answers selected so far, read back from the sealed Raw log so a reload shows them. */
export async function currentAnswers(storage: Storage, session: Session, set: QuestionSet): Promise<Record<string, string[]>> {
  const { attempts } = derive({
    title: set.title,
    rawLog: await readRawLog(storage, session.id),
    questions: await loadQuestions(storage, set),
    questionOrder: session.questionOrder,
    optionOrders: session.optionOrders,
  });
  return Object.fromEntries(attempts.map((a) => [a.questionId, a.answer]));
}

export async function submitSession(storage: Storage, session: Session, set: QuestionSet, recorder: Recorder): Promise<void> {
  recorder.append({ type: "submit" });
  await recorder.seal();

  const rawLog = await readRawLog(storage, session.id);
  const { attempts, digest } = derive({
    title: set.title,
    rawLog,
    questions: await loadQuestions(storage, set),
    questionOrder: session.questionOrder,
    optionOrders: session.optionOrders,
  });

  const now = new Date();
  const derivation: Derivation = {
    id: newId("dv", now),
    sessionId: session.id,
    algorithmVersion: ALGORITHM_VERSION,
    parameters: {},
    chunkIds: rawLog.map((c) => c.id),
    computedAt: now.getTime(),
    digest,
    source: "user",
    updatedAt: now.getTime(),
  };
  await storage.set("derivations", derivation);
  for (const attempt of attempts) {
    const id = `${derivation.id}_${attempt.questionId}`;
    await storage.set<Attempt>("attempts", { ...attempt, id, derivationId: derivation.id, sessionId: session.id, source: "user", updatedAt: now.getTime() });
  }
  await storage.set<Session>("sessions", {
    ...session,
    status: "done",
    endedAt: now.getTime(),
    currentDerivationId: derivation.id,
    updatedAt: now.getTime(),
  });
}
