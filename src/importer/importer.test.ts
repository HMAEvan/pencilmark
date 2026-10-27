import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { commitImport, packErrorsText, parseQuestionPack, previewImport, topicPaths, type ImportPreview, type QuestionPack } from "./importer";
import { isTrueFalse } from "../questionTypes/singleAnswer";
import { createMemoryStorage } from "../storage/memoryStorage";
import { createIndexedDbStorage } from "../storage/indexedDbStorage";
import type { Storage } from "../storage/storage";
import type { Question, QuestionSet, Topic, Track } from "../domain/types";
import questionWritingSkill from "../../skills/pencilmark-question-writing.md?raw";

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

const question = (label: string, stem: string, options: string[], overrides: Record<string, unknown> = {}) => ({
  label,
  type: "single_answer",
  stem: [{ type: "text", text: stem }],
  options: options.map((text, i) => ({ id: `opt_${i}`, content: [{ type: "text", text }] })),
  answer: ["opt_0"],
  ...overrides,
});

const threePack = {
  kind: "question_pack",
  schemaVersion: 1,
  batch: { title: "Genetics", model: "claude-opus-5-5" },
  questions: [
    question("q1", "What carries genetic information?", ["DNA", "Lipid", "Starch"], { topics: ["BIOL101 / Genetics / Lecture 1"] }),
    question("q2", "Which base pairs with adenine in DNA?", ["Thymine", "Uracil", "Cytosine"], { topics: ["BIOL101 / Genetics / Lecture 1"] }),
    question("q3", "Where is mRNA translated?", ["Ribosome", "Nucleus", "Golgi body"], { topics: ["BIOL101 / Genetics / Lecture 2"] }),
  ],
};

let dbCounter = 0;
const adapters: [string, () => Storage][] = [
  ["in-memory", () => createMemoryStorage()],
  ["IndexedDB", () => createIndexedDbStorage(`pencilmark-test-${++dbCounter}`)],
];

async function preview(storage: Storage, pack: unknown): Promise<ImportPreview> {
  const parsed = parseQuestionPack(JSON.stringify(pack));
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return previewImport(parsed.pack, storage);
}

async function importPack(storage: Storage, pack: unknown, now?: Date) {
  const shown = await preview(storage, pack);
  return commitImport(shown, storage, { confirmedTopicPaths: shown.newTopicPaths }, now);
}

const everything = async (storage: Storage) =>
  (await Promise.all(["sets", "questions", "batches", "tracks", "topics"].map((c) => storage.query(c)))).flat();

describe.each(adapters)("Importer with the %s Storage adapter", (_name, makeStorage) => {
  it("writes nothing until the preview is confirmed, and the preview counts new Questions", async () => {
    const storage = makeStorage();
    const shown = await preview(storage, threePack);

    expect(shown.questions.map((q) => [q.label, q.status])).toEqual([
      ["q1", "new"],
      ["q2", "new"],
      ["q3", "new"],
    ]);
    expect(await everything(storage)).toEqual([]);

    const { setId } = await commitImport(shown, storage, { confirmedTopicPaths: shown.newTopicPaths });
    const set = await storage.get<QuestionSet>("sets", setId);
    expect(set?.entries).toHaveLength(3);
  });

  it("skips every Question the second time a pack is imported, even with different spacing, width and Option order", async () => {
    const storage = makeStorage();
    const first = await importPack(storage, threePack);

    const respaced = {
      ...threePack,
      questions: [
        question("again1", "  What carries\n genetic   information？ ", ["Starch", "Lipid", "ＤＮＡ"], { answer: ["opt_2"] }),
        question("again2", "Which base pairs with adenine in DNA?\n", ["Cytosine", "Thymine", "Uracil"], { answer: ["opt_1"] }),
        question("again3", "Where is mRNA translated?", ["Golgi  body", "Nucleus", "Ribosome"], { answer: ["opt_2"] }),
      ],
    };
    const shown = await preview(storage, respaced);
    expect(shown.questions.map((q) => q.status)).toEqual(["skipped", "skipped", "skipped"]);

    const second = await commitImport(shown, storage, { confirmedTopicPaths: shown.newTopicPaths });
    expect(await storage.query("questions")).toHaveLength(3);
    const entries = async (setId: string) => (await storage.get<QuestionSet>("sets", setId))!.entries.map((e) => e.questionId);
    expect(await entries(second.setId)).toEqual(await entries(first.setId));
  });

  it("does not skip a Question whose text matches but whose answer differs; it is a conflict", async () => {
    const storage = makeStorage();
    await importPack(storage, threePack);
    const changed = { ...threePack, questions: [{ ...threePack.questions[0]!, answer: ["opt_1"] }] };
    const shown = await preview(storage, changed);
    expect(shown.questions.map((q) => q.status)).toEqual(["conflict"]);
  });

  it("lists unknown Topic paths for confirmation and writes nothing if they are not confirmed", async () => {
    const storage = makeStorage();
    const shown = await preview(storage, threePack);
    expect(shown.newTopicPaths).toEqual(["BIOL101 / Genetics / Lecture 1", "BIOL101 / Genetics / Lecture 2"]);

    await expect(commitImport(shown, storage, { confirmedTopicPaths: [] })).rejects.toThrow();
    expect(await everything(storage)).toEqual([]);
  });

  it("refuses to create a Topic path that appeared after the preview was confirmed", async () => {
    const storage = makeStorage();
    const stale = await preview(storage, threePack);
    const confirmed = stale.newTopicPaths;
    const changed = { ...stale, pack: { ...stale.pack, batch: { ...stale.pack.batch, topic: "BIOL101 / Unseen" } } };

    await expect(commitImport(changed, storage, { confirmedTopicPaths: confirmed })).rejects.toThrow(/BIOL101 \/ Unseen/);
    expect(await everything(storage)).toEqual([]);
  });

  it("skips a duplicate of a deprecated Question without putting it back into a Set", async () => {
    const storage = makeStorage();
    const first = await importPack(storage, onePack);
    const set = await storage.get<QuestionSet>("sets", first.setId);
    const old = await storage.get<Question>("questions", set!.entries[0]!.questionId);
    await storage.set("questions", { ...old!, deprecated: true });

    const shown = await preview(storage, onePack);
    expect(shown.questions.map((q) => q.status)).toEqual(["skipped"]);
    const second = await commitImport(shown, storage, { confirmedTopicPaths: [] });
    expect((await storage.get<QuestionSet>("sets", second.setId))!.entries).toEqual([]);
  });

  it("creates the Track and Topics once the new Topic paths are confirmed, and files Questions under them", async () => {
    const storage = makeStorage();
    const { setId } = await importPack(storage, threePack);

    const tracks = await storage.query<Track>("tracks");
    expect(tracks.map((t) => t.title)).toEqual(["BIOL101"]);
    const topics = await storage.query<Topic>("topics");
    const genetics = topics.find((t) => t.title === "Genetics")!;
    expect(genetics).toMatchObject({ trackId: tracks[0]!.id, parentId: undefined });
    expect(genetics.id).toMatch(/^tp_\d{8}_[a-z2-9]{6}$/);
    const lecture2 = topics.find((t) => t.title === "Lecture 2")!;
    expect(lecture2.parentId).toBe(genetics.id);
    expect(topics).toHaveLength(3);

    const set = await storage.get<QuestionSet>("sets", setId);
    const q3 = await storage.get<Question>("questions", set!.entries[2]!.questionId);
    expect(q3?.topicIds).toEqual([lecture2.id]);
    expect(q3?.trackIds).toEqual([tracks[0]!.id]);
  });

  it("reuses existing Topics, matching paths despite spacing, and asks only about the new part", async () => {
    const storage = makeStorage();
    await importPack(storage, threePack);
    const next = {
      ...threePack,
      questions: [
        question("q1", "What is a codon?", ["Three bases", "One base"], { topics: ["BIOL101/Genetics /  Lecture 1"] }),
        question("q2", "What is a gene?", ["A DNA segment", "A protein"], { topics: ["BIOL101 / Genetics / Lecture 3"] }),
      ],
    };
    const shown = await preview(storage, next);
    expect(shown.newTopicPaths).toEqual(["BIOL101 / Genetics / Lecture 3"]);
    await commitImport(shown, storage, { confirmedTopicPaths: shown.newTopicPaths });
    expect(await storage.query("tracks")).toHaveLength(1);
    expect(await storage.query("topics")).toHaveLength(4);
  });

  it("warns about an unpinned \"all of the above\" Option and a bare letter reference", async () => {
    const storage = makeStorage();
    const shown = await preview(storage, {
      ...threePack,
      questions: [
        question("q1", "Which are nucleic acids?", ["DNA", "RNA", "All of the above"]),
        question("q2", "Which is not a base? Compare with (B).", ["Adenine", "Ribose", "Guanine"]),
        question("q3", "Which are lipids?", ["Fat", "Wax", "以上都是"], { options: [{ id: "a", content: [{ type: "text", text: "Fat" }] }, { id: "b", content: [{ type: "text", text: "以上都是" }], pin: "last" }], answer: ["a"] }),
      ],
    });
    expect(shown.warnings).toEqual([
      { question: "q1", field: "options[2].content", message: expect.any(String) },
      { question: "q2", field: "stem", message: expect.any(String) },
    ]);
  });

  it("does not warn about ordinary text that merely contains 以上 or a letter before 项目", async () => {
    const storage = makeStorage();
    const shown = await preview(storage, {
      ...threePack,
      questions: [question("q1", "维生素B项目的负责人是谁？", ["50以上", "20以下"])],
    });
    expect(shown.warnings).toEqual([]);
  });

  it("commits a one-question pack as a Question and a Set", async () => {
    const storage = makeStorage();
    const { setId } = await importPack(storage, onePack);

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
    const { setId } = await importPack(storage, onePack, new Date("2026-10-26T09:00:00Z"));

    const set = await storage.get<QuestionSet>("sets", setId);
    const questionId = set!.entries[0]!.questionId;
    expect(setId).toMatch(/^s_20261026_[a-z2-9]{6}$/);
    expect(questionId).toMatch(/^q_20261026_[a-z2-9]{6}$/);
    expect(questionId.slice(-6)).not.toMatch(/[01oli]/);
    expect(setId.slice(-6)).not.toMatch(/[01oli]/);
  });
});

describe("parseQuestionPack", () => {
  it("imports a pack wrapped in a Markdown code fence as if unwrapped", () => {
    const pasted = "Here is your pack:\n\n```json\n" + JSON.stringify(onePack, null, 2) + "\n```\n";
    const parsed = parseQuestionPack(pasted);
    expect(parsed.ok && parsed.pack.batch.title).toBe("Cell biology warm-up");
  });

  it("reports text that is not JSON instead of throwing", () => {
    const parsed = parseQuestionPack("Here are your questions!");
    expect(parsed.ok).toBe(false);
  });

  it("names the Question and field when an answer is missing", () => {
    const { answer: _answer, ...withoutAnswer } = onePack.questions[0]!;
    const parsed = parseQuestionPack(JSON.stringify({ ...onePack, questions: [withoutAnswer] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "answer", message: expect.any(String) }] });
  });

  it("names the third Question and its field when its answer is missing, ready to copy back to the AI", () => {
    const { answer: _answer, ...withoutAnswer } = threePack.questions[2]!;
    const parsed = parseQuestionPack(JSON.stringify({ ...threePack, questions: [...threePack.questions.slice(0, 2), withoutAnswer] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q3", field: "answer", message: expect.any(String) }] });
    if (parsed.ok) return;
    const copied = packErrorsText(parsed.errors);
    expect(copied).toContain("q3");
    expect(copied).toContain("answer");
  });

  it("locates schema violations inside an Option", () => {
    const bad = { ...threePack.questions[0]!, options: [{ ...threePack.questions[0]!.options[0]!, pin: "middle" }, threePack.questions[0]!.options[1]] };
    const parsed = parseQuestionPack(JSON.stringify({ ...threePack, questions: [bad] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "options[0].pin", message: expect.any(String) }] });
  });

  it("rejects fields the schema does not know, naming them", () => {
    const parsed = parseQuestionPack(JSON.stringify({ ...threePack, questions: [{ ...threePack.questions[0]!, id: "q_20260101_abcdef" }] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "id", message: expect.any(String) }] });
  });

  it("rejects an answer that names no Option of the Question", () => {
    const question = { ...onePack.questions[0]!, answer: ["opt_z"] };
    const parsed = parseQuestionPack(JSON.stringify({ ...onePack, questions: [question] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "answer", message: expect.any(String) }] });
  });
});

const multiplePack = {
  ...threePack,
  questions: [question("q1", "Which are found in plant cells?", ["Chloroplast", "Centriole", "Cell wall"], { type: "multiple_answer", answer: ["opt_0", "opt_2"] })],
};

const trueFalse = (overrides: Record<string, unknown> = {}) =>
  question("tf1", "Ribosomes are membrane-bound.", ["True", "False"], { answer: ["opt_1"], tags: ["true_false"], ...overrides });

describe("Importer: question types", () => {
  it("commits a multiple-answer Question with all of its correct Options", async () => {
    const storage = createMemoryStorage();
    const { setId } = await importPack(storage, multiplePack);
    const set = await storage.get<QuestionSet>("sets", setId);
    const stored = await storage.get<Question>("questions", set!.entries[0]!.questionId);
    expect(stored).toMatchObject({ type: "multiple_answer", answer: ["opt_0", "opt_2"], optionOrder: "shuffle" });
  });

  it("rejects a single-answer Question with more than one correct Option", () => {
    const parsed = parseQuestionPack(JSON.stringify({ ...threePack, questions: [question("q1", "What carries genetic information?", ["DNA", "RNA", "Starch"], { answer: ["opt_0", "opt_1"] })] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "answer", message: expect.any(String) }] });
  });

  it("rejects a Question type the Question pack format does not have", () => {
    const parsed = parseQuestionPack(JSON.stringify({ ...threePack, questions: [{ ...threePack.questions[0]!, type: "true_false" }] }));
    expect(parsed).toEqual({ ok: false, errors: [{ question: "q1", field: "type", message: expect.any(String) }] });
  });

  it("commits a true/false Question with its two Options in fixed, authored order", async () => {
    const storage = createMemoryStorage();
    const { setId } = await importPack(storage, { ...threePack, questions: [trueFalse()] });
    const set = await storage.get<QuestionSet>("sets", setId);
    const stored = await storage.get<Question>("questions", set!.entries[0]!.questionId);
    expect(stored).toMatchObject({ type: "single_answer", tags: ["true_false"], optionOrder: "fixed", answer: ["opt_1"] });
    expect(stored!.options.map((o) => o.id)).toEqual(["opt_0", "opt_1"]);
  });

  it("rejects a true/false Question that is not a fixed-order single-answer Question with two Options", () => {
    const parse = (q: unknown) => parseQuestionPack(JSON.stringify({ ...threePack, questions: [q] }));
    const fail = (field: string) => ({ ok: false, errors: [{ question: "tf1", field, message: expect.any(String) }] });
    expect(parse(trueFalse({ options: ["True", "False", "Unknown"].map((text, i) => ({ id: `opt_${i}`, content: [{ type: "text", text }] })) }))).toEqual(fail("options"));
    expect(parse(trueFalse({ optionOrder: "shuffle" }))).toEqual(fail("optionOrder"));
    expect(parse(trueFalse({ type: "multiple_answer" }))).toEqual(fail("type"));
  });
});

/** The Question types a pack covers, true/false counted on its own. */
const typesCovered = (pack: QuestionPack) => [...new Set(pack.questions.map((q) => (isTrueFalse(q) ? "true_false" : q.type)))].sort();

// The sample packs double as import fixtures; the build serves the first one behind "Import sample Set".
const samplePacks = Object.entries(import.meta.glob<string>("../../samples/*.json", { query: "?raw", import: "default", eager: true }));

describe("Importer: sample packs", () => {
  it("has at least one sample pack", () => {
    expect(samplePacks.length).toBeGreaterThan(0);
  });

  it.each(samplePacks)("imports %s cleanly, without warnings, covering single-answer, multiple-answer and true/false", async (_path, text) => {
    const parsed = parseQuestionPack(text);
    if (!parsed.ok) throw new Error(packErrorsText(parsed.errors));
    const storage = createMemoryStorage();
    const shown = await previewImport(parsed.pack, storage);
    expect(shown.warnings).toEqual([]);
    expect(shown.questions.every((q) => q.status === "new")).toBe(true);
    expect(parsed.pack.questions.length).toBeGreaterThanOrEqual(5);
    expect(parsed.pack.questions.length).toBeLessThanOrEqual(10);

    expect(typesCovered(parsed.pack)).toEqual(["multiple_answer", "single_answer", "true_false"]);
    await commitImport(shown, storage, { confirmedTopicPaths: shown.newTopicPaths });
    expect(await storage.query("questions")).toHaveLength(parsed.pack.questions.length);
  });
});

describe("Importer: the question-writing Skill's example pack", () => {
  // The Skill is the single source of the authoring format; its one ```json block is the complete example.
  const examples = [...questionWritingSkill.matchAll(/^```json\n([\s\S]*?)\n```$/gm)].map((m) => m[1]!);

  it("is the Skill's only JSON block", () => {
    expect(examples).toHaveLength(1);
  });

  it("imports cleanly, without warnings, covering single-answer, multiple-answer and true/false", async () => {
    const parsed = parseQuestionPack(examples[0] ?? "");
    if (!parsed.ok) throw new Error(packErrorsText(parsed.errors));
    const shown = await previewImport(parsed.pack, createMemoryStorage());
    expect(shown.warnings).toEqual([]);
    expect(typesCovered(parsed.pack)).toEqual(["multiple_answer", "single_answer", "true_false"]);
  });
});

describe("Importer: current Topic paths", () => {
  it("lists every Track and Topic as a path, in Topic order, and a pack using them needs no new Topics", async () => {
    const storage = createMemoryStorage();
    expect(await topicPaths(storage)).toEqual([]);
    await importPack(storage, { ...threePack, batch: { title: "Genetics", topic: "CHEM100" } });

    const paths = await topicPaths(storage);
    expect(paths).toEqual(["BIOL101", "BIOL101 / Genetics", "BIOL101 / Genetics / Lecture 1", "BIOL101 / Genetics / Lecture 2", "CHEM100"]);
    const reuse = { ...threePack, questions: paths.map((path, i) => question(`p${i}`, `Question filed under ${path}`, ["Yes", "No"], { topics: [path] })) };
    expect((await preview(storage, reuse)).newTopicPaths).toEqual([]);
  });
});
