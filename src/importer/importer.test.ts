import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { commitQuestionPack, parseQuestionPack } from "./importer";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createIndexedDbStorage } from "../storage/indexedDbStorage";
import type { Storage } from "../storage/storage";
import type { Question, QuestionSet } from "../domain/types";

const onePack = {
  kind: "question_pack",
  schemaVersion: 1,
  batch: { title: "Cell biology warm-up", model: "claude-opus-5-5", material: "Lecture 1 notes" },
  questions: [
    {
      label: "q1",
      type: "single_answer",
      stem: [{ type: "text", text: "Which organelle makes ATP? Not {{opt:opt_b}}." }],
      options: [
        { id: "opt_a", content: [{ type: "text", text: "Mitochondrion" }], rationale: [{ type: "text", text: "Site of oxidative phosphorylation." }] },
        { id: "opt_b", content: [{ type: "text", text: "Ribosome" }], rationale: [{ type: "text", text: "Makes proteins." }] },
      ],
      answer: ["opt_a"],
      explanation: [{ type: "text", text: "ATP is made in mitochondria." }],
    },
  ],
};

let dbCounter = 0;
const adapters: [string, () => Storage][] = [
  ["in-memory", () => createMemoryStorage()],
  ["IndexedDB", () => createIndexedDbStorage(`pencilmark-test-${++dbCounter}`)],
];

describe.each(adapters)("Importer with the %s Storage adapter", (_name, makeStorage) => {
  it("commits a one-question pack as a Question and a Set", async () => {
    const storage = makeStorage();
    const parsed = parseQuestionPack(JSON.stringify(onePack));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));

    const { setId } = await commitQuestionPack(parsed.pack, storage);

    const sets = await storage.query<QuestionSet>("sets");
    expect(sets).toHaveLength(1);
    expect(sets[0]!.id).toBe(setId);
    expect(sets[0]!.title).toBe("Cell biology warm-up");
    expect(sets[0]!.entries).toHaveLength(1);

    const entry = sets[0]!.entries[0]!;
    const question = await storage.get<Question>("questions", entry.questionId);
    expect(question?.type).toBe("single_answer");
    expect(question?.revision).toBe(1);
    expect(question?.answer).toEqual(["opt_a"]);
    expect(question?.options.map((o) => o.id)).toEqual(["opt_a", "opt_b"]);
  });

  it("assigns real IDs instead of the pack's local labels", async () => {
    const storage = makeStorage();
    const parsed = parseQuestionPack(JSON.stringify(onePack));
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));

    const { setId } = await commitQuestionPack(parsed.pack, storage, new Date("2026-10-26T09:00:00Z"));

    const set = await storage.get<QuestionSet>("sets", setId);
    const questionId = set!.entries[0]!.questionId;
    expect(setId).toMatch(/^s_20261026_[a-z2-9]{6}$/);
    expect(questionId).toMatch(/^q_20261026_[a-z2-9]{6}$/);
    expect(questionId.slice(-6)).not.toMatch(/[01oli]/);
    expect(setId.slice(-6)).not.toMatch(/[01oli]/);
  });
});

describe("parseQuestionPack", () => {
  it("reports text that is not JSON instead of throwing", () => {
    const parsed = parseQuestionPack("Here are your questions!");
    expect(parsed.ok).toBe(false);
  });

  it("names the Question and field when an answer is missing", () => {
    const { answer: _answer, ...withoutAnswer } = onePack.questions[0]!;
    const parsed = parseQuestionPack(JSON.stringify({ ...onePack, questions: [withoutAnswer] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "answer", message: expect.any(String) }] });
  });

  it("rejects an answer that names no Option of the Question", () => {
    const question = { ...onePack.questions[0]!, answer: ["opt_z"] };
    const parsed = parseQuestionPack(JSON.stringify({ ...onePack, questions: [question] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "answer", message: expect.any(String) }] });
  });
});
