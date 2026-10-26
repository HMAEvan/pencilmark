// Document shapes stored through Storage. Field names follow GLOSSARY.md and the spec (issue #1).

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
  tags: string[];
  createdAt: number;
  deprecated: boolean;
};

export type Batch = Provenance & {
  id: string;
  title: string;
  material?: string;
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
  currentDerivationId?: string;
};
