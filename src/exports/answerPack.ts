import { version } from "../../package.json";
import type { Question, QuestionSet, Session } from "../domain/types";
import type { Storage } from "../storage/storage";
import { readRawLog, type RawLogChunk } from "../recorder/recorder";
import { digestWithOverrides } from "../derivation/derivation";
import { loadDerivedSession, type Attempt, type Derivation, type Override } from "../session/sessions";

// The Answer pack carries one Session for grading or re-import (schema/answer-pack.schema.json).

export type AnswerPack = {
  kind: "answer_pack";
  schemaVersion: 1;
  exportedAt: number;
  appVersion: string;
  session: Session;
  set: QuestionSet;
  /** The Questions the Session was sat against, as Derivation read them. */
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
  const derived = await loadDerivedSession(storage, sessionId);
  if (!derived) return undefined;
  const { session, set, derivation, attempts, questions, overrides } = derived;
  const digest = overrides.size ? digestWithOverrides({ title: set.title, questions, rules: derivation.parameters }, { attempts, removedFlags: derivation.removedFlags }, overrides) : derivation.digest;
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
