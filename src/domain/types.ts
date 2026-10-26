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
  settings: SettingsSnapshot;
  currentDerivationId?: string;
};

/** ADR-0008: `reviewing` starts when the answer is revealed. */
export type Phase = "answering" | "reviewing" | "revisit";

export const PHASES: Phase[] = ["answering", "reviewing", "revisit"];

export type Confidence = "sure" | "probably" | "guessed";

/** Concept confusion, careless, focus, memory, bad question. */
export type Flag = "concept" | "careless" | "focus" | "memory" | "bad_question";

export const FLAGS: Flag[] = ["concept", "careless", "focus", "memory", "bad_question"];
