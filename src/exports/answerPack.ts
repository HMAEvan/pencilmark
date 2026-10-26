import { version } from "../../package.json";
import type { Question, QuestionSet, Session } from "../domain/types";
import type { Storage } from "../storage/storage";
import { readRawLog, type RawLogChunk } from "../recorder/recorder";
import { digestWithOverrides } from "../derivation/derivation";
import { currentDerivation, loadOverrides, loadQuestions, type Attempt, type Derivation, type Override } from "../session/sessions";

// The Answer pack carries one Session for grading or re-import (schema/answer-pack.schema.json).

export type AnswerPack = {
  kind: "answer_pack";
  schemaVersion: 1;
  exportedAt: number;
  appVersion: string;
  session: Session;
  set: QuestionSet;
  /** The Question revisions the Session was sat against. */
  questions: Question[];
  derivation: Derivation;
  attempts: Attempt[];
  overrides: Override[];
  /** The Digest with any Overrides in place of the derived values; the derivation keeps the derived one. */
  digest: string;
  /** Sealed chunks only: the chunk still being recorded is not part of the Raw log yet. */
  rawLog?: RawLogChunk[];
};

/** Builds the Answer pack from the derivation in use, deriving again first if chunks were sealed after it. */
export async function buildAnswerPack(storage: Storage, sessionId: string, { includeRawLog }: { includeRawLog: boolean }): Promise<AnswerPack | undefined> {
  const stored = await storage.get<Session>("sessions", sessionId);
  const set = stored && (await storage.get<QuestionSet>("sets", stored.setId));
  const derivation = stored && set && (await currentDerivation(storage, stored, set));
  if (!set || !derivation) return undefined;
  // Deriving again moves the Session to the new derivation.
  const session = (await storage.get<Session>("sessions", sessionId))!;
  const questions = await loadQuestions(storage, set);
  const attempts = await storage.query<Attempt>("attempts", { derivationId: derivation.id });
  attempts.sort((a, b) => a.displayedNumber - b.displayedNumber);
  const overrides = await loadOverrides(storage, sessionId);
  const digest = overrides.size ? digestWithOverrides({ title: set.title, questions }, attempts, overrides) : derivation.digest;
  return {
    kind: "answer_pack",
    schemaVersion: 1,
    exportedAt: Date.now(),
    appVersion: version,
    session,
    set,
    questions,
    derivation,
    attempts,
    overrides: [...overrides.values()],
    digest,
    ...(includeRawLog && { rawLog: await readRawLog(storage, sessionId) }),
  };
}
