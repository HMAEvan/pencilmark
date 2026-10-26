import { describe, expect, it } from "vitest";
import { derive, digestWithOverrides, finalValues, type DerivationInput } from "./derivation";
import type { Question } from "../domain/types";
import type { RawEvent, RawEventBody, RawLogChunk } from "../recorder/recorder";
import { DEFAULT_PREFERENCES } from "../domain/settings";

const question: Question = {
  id: "q_20261026_atpxyz",
  revision: 1,
  type: "single_answer",
  typeVersion: 1,
  stem: [{ type: "text", text: "Which organelle makes ATP? Not {{opt:opt_b}}." }],
  options: [
    { id: "opt_a", content: [{ type: "text", text: "Mitochondrion" }], rationale: [] },
    { id: "opt_b", content: [{ type: "text", text: "Ribosome" }], rationale: [] },
    { id: "opt_c", content: [{ type: "text", text: "Golgi apparatus" }], rationale: [] },
  ],
  optionOrder: "shuffle",
  answer: ["opt_a"],
  explanation: [],
  batchId: "b_20261026_bbbbbb",
  topicIds: [],
  trackIds: [],
  tags: [],
  createdAt: 0,
  deprecated: false,
  source: "ai",
  updatedAt: 0,
};

function input(events: RawEventBody[], optionOrder = ["opt_a", "opt_b", "opt_c"]): DerivationInput {
  const stamped: RawEvent[] = events.map((e, i) => ({ ...e, seq: i + 1, at: i * 1000 }));
  return {
    title: "Cell biology warm-up",
    rawLog: [{ id: "ss_20261026_ssssss_0", sessionId: "ss_20261026_ssssss", n: 0, startedAt: 0, events: stamped, activeMs: events.length * 1000, prevHash: null, hash: "" }],
    questions: [question],
    questionOrder: [question.id],
    optionOrders: { [question.id]: optionOrder },
    rules,
  };
}

const rules = DEFAULT_PREFERENCES.rules;

const second: Question = {
  ...question,
  id: "q_20261026_dnaxyz",
  stem: [{ type: "text", text: "Where is most DNA kept?" }],
  options: [
    { id: "opt_a", content: [{ type: "text", text: "Nucleus" }], rationale: [] },
    { id: "opt_b", content: [{ type: "text", text: "Cytoplasm" }], rationale: [] },
  ],
};

/** One chunk of a hand-written Raw log: its wall-clock start, foreground time, and `[at, event]` pairs. */
type ChunkSpec = { startedAt?: number; activeMs: number; events: [number, RawEventBody][] };

const SESSION = "ss_20261026_ssssss";

/** A Session over `question` then `second`, built from chunks with hand-picked times. Sequence numbers run across chunks. */
function sitting(chunks: ChunkSpec[], overrides: Partial<DerivationInput> = {}): DerivationInput {
  let seq = 0;
  const rawLog: RawLogChunk[] = chunks.map((c, n) => ({
    id: `${SESSION}_${n}`,
    sessionId: SESSION,
    n,
    startedAt: c.startedAt ?? n * 3_600_000,
    events: c.events.map(([at, e]) => ({ ...e, seq: ++seq, at })),
    activeMs: c.activeMs,
    prevHash: n === 0 ? null : `hash${n - 1}`,
    hash: `hash${n}`,
  }));
  return {
    title: "Cell biology warm-up",
    rawLog,
    questions: [question, second],
    questionOrder: [question.id, second.id],
    optionOrders: { [question.id]: ["opt_a", "opt_b", "opt_c"], [second.id]: ["opt_a", "opt_b"] },
    rules,
    ...overrides,
  };
}

const open = (q: Question) => ({ type: "navigate", questionId: q.id }) as const;
const choose = (q: Question, optionId: string) => ({ type: "select", questionId: q.id, optionId }) as const;
/**
 * Derives, checking conservation on the way: Session active time, worked out by hand as foreground time before
 * submission less excluded idle time, equals the Questions' answering time plus navigation time.
 */
function deriveConserving(sat: DerivationInput, sessionActiveMs: number) {
  const result = derive(sat);
  const questionsMs = result.attempts.reduce((sum, a) => sum + a.timing.answeringActiveMs, 0);
  expect(result.totals.answeringActiveMs).toBe(sessionActiveMs);
  expect(questionsMs + result.totals.navigationMs).toBe(sessionActiveMs);
  return result;
}

const attemptOf =(result: ReturnType<typeof derive>, q: Question) => result.attempts.find((a) => a.questionId === q.id)!;

const navigate = { type: "navigate", questionId: question.id } as const;
const select = (optionId: string) => ({ type: "select", questionId: question.id, optionId }) as const;
const submit = { type: "submit" } as const;

describe("derive", () => {
  it("grades the selected Option of a single-answer Question as correct", () => {
    const { attempts } = derive(input([navigate, select("opt_a"), submit]));
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ questionId: question.id, questionRevision: 1, answer: ["opt_a"], correct: true, blank: false, displayedNumber: 1, optionOrder: ["opt_a", "opt_b", "opt_c"] });
  });

  it("takes the last selection before submission as the answer", () => {
    const { attempts } = derive(input([navigate, select("opt_a"), select("opt_c"), submit, select("opt_a")]));
    expect(attempts[0]).toMatchObject({ answer: ["opt_c"], correct: false, blank: false });
  });

  it("records a Question whose selection was deselected as blank", () => {
    const deselect = { type: "deselect", questionId: question.id, optionId: "opt_a" } as const;
    const { attempts } = derive(input([navigate, select("opt_a"), deselect, submit]));
    expect(attempts[0]).toMatchObject({ answer: [], correct: false, blank: true });
  });

  it("ignores the page being hidden and shown", () => {
    const { attempts } = derive(input([navigate, select("opt_a"), { type: "hide" }, { type: "show", wall: 5000 }, submit]));
    expect(attempts[0]).toMatchObject({ answer: ["opt_a"], correct: true });
  });

  it("records an unanswered Question as blank and not correct", () => {
    const { attempts } = derive(input([navigate, submit]));
    expect(attempts[0]).toMatchObject({ answer: [], correct: false, blank: true });
  });

  it("writes a Digest with the stem, answer given, correct answer and correctness, using displayed letters", () => {
    const { digest } = derive(input([navigate, select("opt_b"), submit], ["opt_c", "opt_a", "opt_b"]));
    expect(digest).toBe(
      [
        "# Digest: Cell biology warm-up",
        "",
        "## Question 1",
        "",
        "Which organelle makes ATP? Not C.",
        "",
        "- A. Golgi apparatus",
        "- B. Mitochondrion",
        "- C. Ribosome",
        "",
        "- Answer given: C",
        "- Correct answer: B",
        "- Result: wrong",
        "- Answering time: 2s",
        "- First choice: C after 1s",
        "- Answer changes: none",
        "",
      ].join("\n"),
    );
  });

  it("shows a blank answer in the Digest", () => {
    const { digest } = derive(input([navigate, submit]));
    expect(digest).toContain("- Answer given: (blank)\n- Correct answer: A\n- Result: wrong\n- Answering time: 1s\n- First choice: none\n");
  });
});

describe("derive: timing", () => {
  it("gives each Question the time from opening it until leaving it", () => {
    // Q1 is open 0–20 s, Q2 20–42 s, then submitted.
    const result = deriveConserving(
      sitting([{ activeMs: 42_000, events: [[0, open(question)], [12_000, choose(question, "opt_a")], [20_000, open(second)], [35_000, choose(second, "opt_b")], [42_000, submit]] }]),
      42_000,
    );
    expect(attemptOf(result, question).timing).toMatchObject({ answeringActiveMs: 20_000, visits: 1 });
    expect(attemptOf(result, second).timing).toMatchObject({ answeringActiveMs: 22_000, visits: 1 });
  });

  it("never counts time while the page is hidden, and keeps the Question open across it", () => {
    // Chunk 0: Q1 0–15 s, then hidden for an hour. Chunk 1: Q1 again 0–8 s, Q2 8–20 s.
    const result = deriveConserving(
      sitting([
        { activeMs: 15_000, events: [[0, open(question)], [10_000, choose(question, "opt_a")], [15_000, { type: "hide" }]] },
        { activeMs: 20_000, events: [[0, { type: "show", wall: 3_600_000 }], [8_000, open(second)], [20_000, submit]] },
      ]),
      35_000,
    );
    expect(attemptOf(result, question).timing).toMatchObject({ answeringActiveMs: 23_000, visits: 1 });
    expect(attemptOf(result, second).timing).toMatchObject({ answeringActiveMs: 12_000, visits: 1 });
    expect(result.totals).toMatchObject({ answeringActiveMs: 35_000, navigationMs: 0 });
  });

  it("does not count a 0.3-second pass over a Question as a Visit, and gives its time to navigation", () => {
    // Q1 0–10 s, Q2 flicked past 10–10.3 s, Q1 again 10.3–25 s.
    const result = deriveConserving(
      sitting([{ activeMs: 25_000, events: [[0, open(question)], [10_000, open(second)], [10_300, open(question)], [25_000, submit]] }]),
      25_000,
    );
    expect(attemptOf(result, question).timing).toMatchObject({ answeringActiveMs: 24_700, visits: 2 });
    expect(attemptOf(result, second).timing).toMatchObject({ answeringActiveMs: 0, visits: 0 });
    expect(result.totals).toMatchObject({ answeringActiveMs: 25_000, navigationMs: 300 });
  });

  it("excludes the part of a 90-second gap with no interaction beyond the 60-second threshold, and records it on the Question", () => {
    // Q1 opened at 0, nothing until a choice at 90 s, submitted at 100 s.
    const result = deriveConserving(
      sitting([{ activeMs: 100_000, events: [[0, open(question)], [90_000, choose(question, "opt_a")], [100_000, submit]] }]),
      70_000,
    );
    expect(attemptOf(result, question).timing).toEqual({
      answeringRawMs: 100_000,
      answeringActiveMs: 70_000,
      visits: 1,
      excludedIdle: [{ chunk: 0, at: 0, excludedMs: 30_000 }],
      reviewingRawMs: 0,
      reviewingActiveMs: 0,
    });
    expect(result.totals).toEqual({
      answeringRawMs: 100_000,
      answeringActiveMs: 70_000,
      navigationMs: 0,
      excludedIdleMs: 30_000,
      reviewingRawMs: 0,
      reviewingActiveMs: 0,
      reviewingNavigationMs: 0,
      reviewingExcludedIdleMs: 0,
    });
  });

  it("marks a wall clock that goes backwards between chunks as clockAnomaly, and changes no answering time", () => {
    // Chunk 0 runs from wall time 1,000 s for 20 s. Chunk 1 claims to start at 900 s, or, with a sane clock, at 1,100 s.
    const chunks = (secondStart: number): ChunkSpec[] => [
      { startedAt: 1_000_000, activeMs: 20_000, events: [[0, open(question)], [20_000, { type: "hide" }]] },
      { startedAt: secondStart, activeMs: 15_000, events: [[0, { type: "show", wall: secondStart }], [5_000, open(second)], [15_000, submit]] },
    ];
    const skewed = deriveConserving(sitting(chunks(900_000)), 35_000);
    const sane = deriveConserving(sitting(chunks(1_100_000)), 35_000);

    expect(skewed.chunkGaps).toEqual([{ after: 0, wallMs: null, clockAnomaly: true }]);
    expect(sane.chunkGaps).toEqual([{ after: 0, wallMs: 80_000, clockAnomaly: false }]);
    expect(attemptOf(skewed, question).timing.answeringActiveMs).toBe(25_000);
    expect(attemptOf(skewed, second).timing.answeringActiveMs).toBe(10_000);
    expect(skewed.attempts).toEqual(sane.attempts);
    expect(skewed.totals).toEqual(sane.totals);
  });
});

describe("derive: reviewing time", () => {
  const onScreen = (q?: Question) => ({ type: "onScreen", ...(q && { questionId: q.id }) }) as const;
  /** Checks that reviewing time, worked out by hand, equals the Questions' reviewing time plus time no Question was on screen. */
  function deriveReviewing(sat: DerivationInput, reviewingActiveMs: number) {
    const result = derive(sat);
    const questionsMs = result.attempts.reduce((sum, a) => sum + a.timing.reviewingActiveMs, 0);
    expect(result.totals.reviewingActiveMs).toBe(reviewingActiveMs);
    expect(questionsMs + result.totals.reviewingNavigationMs).toBe(reviewingActiveMs);
    return result;
  }

  it("gives time after submission to the Question occupying the main part of the screen, leaving answering time as it was", () => {
    // Answering: Q1 0–30 s, submitted. Review page, after the page was hidden: nothing on screen 0–1 s, Q1 1–21 s, Q2 21–36 s.
    const result = deriveReviewing(
      sitting([
        { activeMs: 30_000, events: [[0, open(question)], [10_000, choose(question, "opt_a")], [30_000, submit], [30_000, { type: "hide" }]] },
        { activeMs: 36_000, events: [[0, { type: "show", wall: 3_600_000 }], [1_000, onScreen(question)], [21_000, onScreen(second)], [36_000, { type: "hide" }]] },
      ]),
      36_000,
    );
    expect(attemptOf(result, question).timing).toMatchObject({ answeringActiveMs: 30_000, reviewingRawMs: 20_000, reviewingActiveMs: 20_000 });
    expect(attemptOf(result, second).timing).toMatchObject({ answeringActiveMs: 0, reviewingRawMs: 15_000, reviewingActiveMs: 15_000 });
    expect(result.totals).toMatchObject({ answeringActiveMs: 30_000, navigationMs: 0, reviewingNavigationMs: 1_000 });
  });

  it("does not count a Question scrolled past in 0.2 seconds, and excludes reviewing idle beyond the threshold", () => {
    // Submitted at 5 s. Q1 on screen 5–105 s with no interaction, Q2 scrolled past 105–105.2 s, Q1 again to 110 s.
    const result = deriveReviewing(
      sitting([
        {
          activeMs: 110_000,
          events: [[0, open(question)], [5_000, submit], [5_000, onScreen(question)], [105_000, onScreen(second)], [105_200, onScreen(question)], [110_000, onScreen()]],
        },
      ]),
      65_000,
    );
    expect(attemptOf(result, question).timing).toMatchObject({ answeringActiveMs: 5_000, reviewingRawMs: 104_800, reviewingActiveMs: 64_800, excludedIdle: [] });
    expect(attemptOf(result, second).timing).toMatchObject({ reviewingRawMs: 0, reviewingActiveMs: 0 });
    expect(result.totals).toMatchObject({ reviewingRawMs: 105_000, reviewingNavigationMs: 200, reviewingExcludedIdleMs: 40_000 });
  });

  it("does not let selections after submission change the answer or start a Visit", () => {
    const result = derive(
      sitting([{ activeMs: 20_000, events: [[0, open(question)], [5_000, choose(question, "opt_a")], [10_000, submit], [12_000, open(second)], [15_000, choose(second, "opt_a")]] }]),
    );
    expect(attemptOf(result, second)).toMatchObject({ answer: [], blank: true, timing: { answeringActiveMs: 0, visits: 0, reviewingActiveMs: 0 } });
    expect(result.totals).toMatchObject({ reviewingActiveMs: 10_000, reviewingNavigationMs: 10_000 });
  });

  it("lists reviewing time in the Digest for Questions that were reviewed", () => {
    // Q1 answered 0–30 s; after submission Q2 is on screen for 45 s and Q1 never is.
    const { digest } = derive(
      sitting([{ activeMs: 75_000, events: [[0, open(question)], [30_000, submit], [30_000, onScreen(second)], [75_000, onScreen()]] }]),
    );
    expect(digest).toContain("## Question 2\n\nWhere is most DNA kept?\n\n- A. Nucleus\n- B. Cytoplasm\n\n- Answer given: (blank)\n- Correct answer: A\n- Result: wrong\n- Answering time: 0s\n- Reviewing time: 45s\n");
    expect(digest).not.toContain("- Answering time: 30s\n- Reviewing time");
  });
});

describe("derive: trajectory", () => {
  it("records the first choice and each later answer change with the full answer after it", () => {
    // Q1 opened at 0: A at 8 s, C at 20 s, B at 26 s, submitted at 30 s.
    const result = deriveConserving(
      sitting([
        {
          activeMs: 30_000,
          events: [[0, open(question)], [8_000, choose(question, "opt_a")], [20_000, choose(question, "opt_c")], [26_000, choose(question, "opt_b")], [30_000, submit]],
        },
      ]),
      30_000,
    );
    expect(attemptOf(result, question).trajectory).toEqual({
      firstChoice: ["opt_a"],
      timeToFirstChoiceMs: 8_000,
      changes: [
        { answer: ["opt_c"], atMs: 20_000, dwellMs: 12_000 },
        { answer: ["opt_b"], atMs: 26_000, dwellMs: 6_000 },
      ],
    });
  });

  it("measures choice times in time spent on the Question, not on the Session", () => {
    // Q1 0–5 s, Q2 5–40 s, back to Q1 at 40 s and A chosen at 43 s; deselected at 50 s after a pause.
    const deselect = { type: "deselect", questionId: question.id, optionId: "opt_a" } as const;
    const result = deriveConserving(
      sitting([
        { activeMs: 10_000, events: [[0, open(question)], [5_000, open(second)], [10_000, { type: "hide" }]] },
        { activeMs: 30_000, events: [[0, { type: "show", wall: 3_600_000 }], [30_000, open(question)]] },
        { activeMs: 12_000, events: [[0, { type: "show", wall: 7_200_000 }], [3_000, choose(question, "opt_a")], [10_000, deselect], [12_000, submit]] },
      ]),
      52_000,
    );
    expect(attemptOf(result, question).trajectory).toEqual({
      firstChoice: ["opt_a"],
      timeToFirstChoiceMs: 8_000,
      changes: [{ answer: [], atMs: 15_000, dwellMs: 7_000 }],
    });
    expect(attemptOf(result, second).trajectory).toEqual({ firstChoice: null, timeToFirstChoiceMs: null, changes: [] });
  });
});

describe("derive: Digest timing and trajectory", () => {
  it("lists each Question's answering time, excluded idle time, first choice and answer changes in displayed letters", () => {
    // Q1 (displayed C, A, B): opened at 0, nothing for 90 s, then A at 90 s, C at 100 s, B at 105 s; Q2 from 110 s to 135 s.
    const result = deriveConserving(
      sitting(
        [
          {
            activeMs: 135_000,
            events: [[0, open(question)], [90_000, choose(question, "opt_a")], [100_000, choose(question, "opt_c")], [105_000, choose(question, "opt_b")], [110_000, open(second)], [135_000, submit]],
          },
        ],
        { optionOrders: { [question.id]: ["opt_c", "opt_a", "opt_b"], [second.id]: ["opt_a", "opt_b"] } },
      ),
      105_000,
    );
    expect(result.digest).toContain(
      ["- Answering time: 1m 20s (30s idle excluded)", "- First choice: B after 1m 0s", "- Answer changes: A at 1m 10s (after 10s), C at 1m 15s (after 5s)", ""].join("\n"),
    );
    expect(result.digest).toContain(["- Answering time: 25s", "- First choice: none", "- Answer changes: none", ""].join("\n"));
  });
});

describe("derive: provenance", () => {
  it("states the algorithm version, the full parameters used and the Raw log chunks read with their hashes", () => {
    const strict = { ...rules, idleThresholdMs: 30_000, flickThresholdMs: 1_000 };
    const result = derive(
      sitting(
        [
          { activeMs: 10_000, events: [[0, open(question)], [10_000, { type: "hide" }]] },
          { activeMs: 5_000, events: [[0, { type: "show", wall: 3_600_000 }], [5_000, submit]] },
        ],
        { rules: strict },
      ),
    );
    expect(result.algorithmVersion).toBe(3);
    expect(result.parameters).toEqual({ idleThresholdMs: 30_000, flickThresholdMs: 1_000, shuffleQuestions: true, shuffleOptions: true, collectConfidence: true });
    expect(result.chunks).toEqual([
      { id: `${SESSION}_0`, hash: "hash0" },
      { id: `${SESSION}_1`, hash: "hash1" },
    ]);
  });
});

describe("Overrides", () => {
  // Q1 answered wrongly (C) over 40 s, of which the user says 25 s was a distraction.
  const sat = () => sitting([{ activeMs: 40_000, events: [[0, open(question)], [30_000, choose(question, "opt_c")], [40_000, submit]] }]);

  it("uses the derived values when there is no Override", () => {
    const attempt = attemptOf(derive(sat()), question);
    expect(finalValues(attempt)).toEqual({ answeringActiveMs: 40_000, correct: false, overridden: [] });
  });

  it("uses an overridden time or result in place of the derived one, leaving the derived Attempt unchanged", () => {
    const attempt = attemptOf(derive(sat()), question);
    const before = structuredClone(attempt);
    expect(finalValues(attempt, { answeringActiveMs: 15_000 })).toEqual({ answeringActiveMs: 15_000, correct: false, overridden: ["answeringActiveMs"] });
    expect(finalValues(attempt, { correct: true })).toEqual({ answeringActiveMs: 40_000, correct: true, overridden: ["correct"] });
    expect(attempt).toEqual(before);
  });

  it("still applies to the Attempt of a later derivation with different rules", () => {
    const recomputed = attemptOf(derive({ ...sat(), rules: { ...rules, idleThresholdMs: 20_000 } }), question);
    expect(recomputed.timing.answeringActiveMs).toBe(30_000);
    expect(finalValues(recomputed, { answeringActiveMs: 15_000, correct: true })).toEqual({ answeringActiveMs: 15_000, correct: true, overridden: ["answeringActiveMs", "correct"] });
  });
});

describe("Digest with Overrides", () => {
  const sat = () => sitting([{ activeMs: 40_000, events: [[0, open(question)], [30_000, choose(question, "opt_c")], [40_000, submit]] }]);

  it("is the derived Digest when there are no Overrides", () => {
    const result = derive(sat());
    expect(digestWithOverrides(sat(), result.attempts, new Map())).toBe(result.digest);
  });

  it("shows an overridden time and result in place of the derived ones, naming the derived values", () => {
    const result = derive(sat());
    const digest = digestWithOverrides(sat(), result.attempts, new Map([[question.id, { answeringActiveMs: 120_000, correct: true }]]));
    expect(digest).toContain(
      ["- Result: correct (overridden by the user; derived: wrong)", "- Answering time: 2m 0s (overridden by the user; derived: 40s)", "- First choice: C after 30s"].join("\n"),
    );
    expect(digest).toContain(["- Result: wrong", "- Answering time: 0s", "- First choice: none"].join("\n"));
  });
});
