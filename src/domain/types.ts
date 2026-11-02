// Document shapes stored through Storage. Field names follow GLOSSARY.md and the spec (issue #1).

import type { SettingsSnapshot } from "./settings";

export type ContentBlock = { type: "text"; text: string };

export type Provenance = {
  source: "user" | "ai";
  model?: string;
  updatedAt: number;
};

export type Option = {
  id: string;
  content: ContentBlock[];
  rationale: ContentBlock[];
  misconception?: ContentBlock[];
  pin?: "first" | "last";
};

export type Question = Provenance & {
  id: string;
  revision: number;
  type: string;
  typeVersion: number;
  stem: ContentBlock[];
  options: Option[];
  optionOrder: "shuffle" | "fixed";
  answer: string[];
  explanation: ContentBlock[];
  /** Graded Hints, lightest first: level 0 is the first. Absent on Questions imported before Hints. */
  hints?: ContentBlock[][];
  batchId: string;
  /** Topics the Question sits under, possibly across Tracks, and the Tracks those Topics belong to. */
  topicIds: string[];
  trackIds: string[];
  tags: string[];
  createdAt: number;
  deprecated: boolean;
};

export type Batch = Provenance & {
  id: string;
  title: string;
  material?: string;
  /** The Topic the Questions were generated from, and which attempt at that Topic this Batch is. */
  sourceTopicId?: string;
  sequence?: number;
  createdAt: number;
};

/** A Track created by import knows only its title, so it starts as a domain; course details come later. */
export type Track = Provenance & {
  id: string;
  kind: "course" | "domain";
  title: string;
  code?: string;
  academicYear?: string;
  yearOfStudy?: number;
  term?: string;
  description?: string;
  createdAt: number;
};

export type Topic = Provenance & {
  id: string;
  trackId: string;
  /** Absent at the top level of the Track. */
  parentId?: string;
  title: string;
  order: number;
  createdAt: number;
};

export type Entry = { kind: "question"; questionId: string };

export type QuestionSet = Provenance & {
  id: string;
  title: string;
  sourceDescription?: string;
  entries: Entry[];
  createdAt: number;
  archived: boolean;
};

export type SessionStatus = "in_progress" | "done" | "reviewing" | "reviewed" | "abandoned";

export type Session = Provenance & {
  id: string;
  setId: string;
  mode: "exam";
  status: SessionStatus;
  startedAt: number;
  endedAt?: number;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  /** The Question revision each Question was sat against (ADR-0004). Absent on Sessions from before revisions, all sat against revision 1. */
  questionRevisions?: Record<string, number>;
  settings: SettingsSnapshot;
  currentDerivationId?: string;
};

/** ADR-0008: `reviewing` starts when the answer is revealed. */
export type Phase = "answering" | "reviewing" | "revisit";

export const PHASES: Phase[] = ["answering", "reviewing", "revisit"];

export type Confidence = "sure" | "probably" | "guessed";

/**
 * Couldn't recall, didn't understand the question, didn't know where to start, review this again, mixed up concepts, careless slip.
 * `bad_question` is retired (ADR-0012): stored Raw logs hold it, and Derivation reads it as the Challenge turned on or off, never as a Flag.
 */
export type Flag = "memory" | "not_understood" | "no_approach" | "focus" | "concept" | "careless" | "bad_question";

export const FLAGS: Flag[] = ["memory", "not_understood", "no_approach", "focus", "concept", "careless", "bad_question"];

/** The Flags about the learner that are offered while answering; mixed up concepts and careless slip are judgements made after the reveal (ADR-0012). */
const ANSWERING_FLAGS: Flag[] = ["memory", "not_understood", "no_approach", "focus"];

/** The Flags offered in a Phase, in display order. Follows the Phase, not the page, so Practice mode needs no change. Never the retired bad_question. */
export function flagsOfferedIn(phase: Phase): Flag[] {
  return phase === "answering" ? ANSWERING_FLAGS : FLAGS.filter((f) => f !== "bad_question");
}

/**
 * The Challenge reasons, in display order: the answer is wrong, the wording is unclear or ambiguous, the Options are faulty
 * (none or more than one correct), out of scope or not matching the material. Stored in Raw log events, so the values never change.
 */
export type ChallengeReason = "answer_wrong" | "wording_unclear" | "options_faulty" | "out_of_scope";

export const CHALLENGE_REASONS: ChallengeReason[] = ["answer_wrong", "wording_unclear", "options_faulty", "out_of_scope"];

/** Eliminated, eliminated but unsure, sure right, unknown term. */
export type ItemFlag = "eliminated" | "eliminated_unsure" | "sure_right" | "unknown_term";

export const ITEM_FLAGS: ItemFlag[] = ["eliminated", "eliminated_unsure", "sure_right", "unknown_term"];
