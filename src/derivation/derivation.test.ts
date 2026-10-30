import { describe, expect, it } from "vitest";
import { answeringTimesSoFar, derive, digestWithOverrides, finalValues, type DerivationInput } from "./derivation";
import type { Confidence, Flag, ItemFlag, Question } from "../domain/types";
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
        "- Answering time: 2.000 s",
        "- First choice: C after 1.000 s",
        "- Answer changes: none",
        "- Item flags: none",
        "- Confidence: none",
        "- Flags: none",
        "- Answering timeline (time spent on this Question so far):",
        "  - 0.000 s: Visit 1 opened",
        "  - 1.000 s: selected C; answer now C",
        "  - 2.000 s: Visit 1 left",
        "",
      ].join("\n"),
    );
  });

  it("shows a blank answer in the Digest", () => {
    const { digest } = derive(input([navigate, submit]));
    expect(digest).toContain("- Answer given: (blank)\n- Correct answer: A\n- Result: wrong\n- Answering time: 1.000 s\n- First choice: none\n");
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
    expect(digest).toContain("## Question 2\n\nWhere is most DNA kept?\n\n- A. Nucleus\n- B. Cytoplasm\n\n- Answer given: (blank)\n- Correct answer: A\n- Result: wrong\n- Answering time: 0.000 s\n- Reviewing time: 45.000 s\n");
    expect(digest).not.toContain("- Answering time: 30.000 s\n- Reviewing time");
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
      ["- Answering time: 1:20.000 (30.000 s idle excluded)", "- First choice: B after 1:00.000", "- Answer changes: A at 1:10.000 (after 10.000 s), C at 1:15.000 (after 5.000 s)", ""].join("\n"),
    );
    expect(result.digest).toContain(["- Answering time: 25.000 s", "- First choice: none", "- Answer changes: none", ""].join("\n"));
  });

  it("shows every time to the millisecond, as m:ss.SSS from one minute", () => {
    // Q1: A at 7.247 s, C at 8.647 s, B at 65.320 s; Q2 from 66.000 s to 67.500 s.
    const result = deriveConserving(
      sitting([
        {
          activeMs: 67_500,
          events: [[0, open(question)], [7_247, choose(question, "opt_a")], [8_647, choose(question, "opt_c")], [65_320, choose(question, "opt_b")], [66_000, open(second)], [67_500, submit]],
        },
      ]),
      67_500,
    );
    expect(result.digest).toContain(
      ["- Answering time: 1:06.000", "- First choice: A after 7.247 s", "- Answer changes: C at 8.647 s (after 1.400 s), B at 1:05.320 (after 56.673 s)", ""].join("\n"),
    );
    expect(result.digest).toContain(["- Answering time: 1.500 s", "- First choice: none"].join("\n"));
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
    expect(result.algorithmVersion).toBe(7);
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
    expect(finalValues(attempt)).toEqual({ answeringActiveMs: 40_000, correct: false, partialScore: 0, overridden: [] });
  });

  it("uses an overridden time or result in place of the derived one, leaving the derived Attempt unchanged", () => {
    const attempt = attemptOf(derive(sat()), question);
    const before = structuredClone(attempt);
    expect(finalValues(attempt, { answeringActiveMs: 15_000 })).toEqual({ answeringActiveMs: 15_000, correct: false, partialScore: 0, overridden: ["answeringActiveMs"] });
    expect(finalValues(attempt, { correct: true })).toEqual({ answeringActiveMs: 40_000, correct: true, partialScore: 1, overridden: ["correct"] });
    expect(attempt).toEqual(before);
  });

  it("still applies to the Attempt of a later derivation with different rules", () => {
    const recomputed = attemptOf(derive({ ...sat(), rules: { ...rules, idleThresholdMs: 20_000 } }), question);
    expect(recomputed.timing.answeringActiveMs).toBe(30_000);
    expect(finalValues(recomputed, { answeringActiveMs: 15_000, correct: true })).toEqual({ answeringActiveMs: 15_000, correct: true, partialScore: 1, overridden: ["answeringActiveMs", "correct"] });
  });
});

describe("Overrides made while answering", () => {
  // Q1 open for 25 s; the time was corrected to 15 s at a derived 20 s, while still answering.
  const sat = () => sitting([{ activeMs: 25_000, events: [[0, open(question)], [25_000, submit]] }]);
  const corrected = { answeringActiveMs: 15_000, answeringActiveMsAtOverride: 20_000 };

  it("adds the answering time derived after the correction on top of the corrected time", () => {
    const attempt = attemptOf(derive(sat()), question);
    expect(attempt.timing.answeringActiveMs).toBe(25_000);
    expect(finalValues(attempt, corrected)).toMatchObject({ answeringActiveMs: 20_000, overridden: ["answeringActiveMs"] });
  });

  it("adds nothing when the time was corrected after the answers were revealed", () => {
    const attempt = attemptOf(derive(sat()), question);
    expect(finalValues(attempt, { answeringActiveMs: 15_000, answeringActiveMsAtOverride: 25_000 }).answeringActiveMs).toBe(15_000);
  });

  it("reports the corrected time, with the time added since, beside the derived time in the Digest", () => {
    const result = derive(sat());
    expect(digestWithOverrides(sat(), result, new Map([[question.id, corrected]]))).toContain("- Answering time: 20.000 s (overridden by the user; derived: 25.000 s)");
  });
});

describe("answering times so far", () => {
  // Q1 for 10 s, then Q2 open for 4 s and still on screen: the chunk is not sealed and has no hash.
  const recorded = () =>
    [{ n: 0, startedAt: 0, activeMs: 14_000, events: [{ ...open(question), seq: 1, at: 0 }, { ...open(second), seq: 2, at: 10_000 }] }];

  it("includes the Visit still open, as it would be derived once sealed", () => {
    const times = answeringTimesSoFar(recorded(), rules);
    expect(times.get(question.id)).toBe(10_000);
    expect(times.get(second.id)).toBe(4_000);
  });

  it("leaves out idle beyond the threshold in the Visit still open", () => {
    const idle = recorded();
    idle[0]!.activeMs = 10_000 + rules.idleThresholdMs + 5_000;
    expect(answeringTimesSoFar(idle, rules).get(second.id)).toBe(rules.idleThresholdMs);
  });
});

describe("Digest with Overrides", () => {
  const sat = () => sitting([{ activeMs: 40_000, events: [[0, open(question)], [30_000, choose(question, "opt_c")], [40_000, submit]] }]);

  it("is the derived Digest when there are no Overrides", () => {
    const result = derive(sat());
    expect(digestWithOverrides(sat(), result, new Map())).toBe(result.digest);
  });

  it("shows an overridden time and result in place of the derived ones, naming the derived values", () => {
    const result = derive(sat());
    const digest = digestWithOverrides(sat(), result, new Map([[question.id, { answeringActiveMs: 120_000, correct: true }]]));
    expect(digest).toContain(
      ["- Result: correct (overridden by the user; derived: wrong)", "- Answering time: 2:00.000 (overridden by the user; derived: 40.000 s)", "- First choice: C after 30.000 s"].join("\n"),
    );
    expect(digest).toContain(["- Result: wrong", "- Answering time: 0.000 s", "- First choice: none"].join("\n"));
  });

  it("shows an overridden time of 7.25 seconds as 7.250 s", () => {
    const result = derive(sat());
    const digest = digestWithOverrides(sat(), result, new Map([[question.id, { answeringActiveMs: 7_250 }]]));
    expect(digest).toContain("- Answering time: 7.250 s (overridden by the user; derived: 40.000 s)");
  });
});

describe("derive: multiple-answer Questions", () => {
  const multiple: Question = {
    ...question,
    id: "q_20261026_multxy",
    type: "multiple_answer",
    stem: [{ type: "text", text: "Which are found in plant cells?" }],
    options: ["Chloroplast", "Centriole", "Cell wall", "Glycogen granule", "Lysosome"].map((text, i) => ({
      id: `opt_${"abcde"[i]}`,
      content: [{ type: "text", text }],
      rationale: [],
    })),
    answer: ["opt_a", "opt_c"],
  };
  const order = ["opt_a", "opt_b", "opt_c", "opt_d", "opt_e"];
  const sitMultiple = (events: RawEventBody[]): DerivationInput => {
    const stamped: RawEvent[] = events.map((e, i) => ({ ...e, seq: i + 1, at: i * 1000 }));
    return {
      ...input([]),
      rawLog: [{ ...input([]).rawLog[0]!, events: stamped, activeMs: events.length * 1000 }],
      questions: [multiple],
      questionOrder: [multiple.id],
      optionOrders: { [multiple.id]: order },
    };
  };
  const pick = (optionId: string) => ({ type: "select", questionId: multiple.id, optionId }) as const;
  const unpick = (optionId: string) => ({ type: "deselect", questionId: multiple.id, optionId }) as const;
  const go = { type: "navigate", questionId: multiple.id } as const;
  const resultOf = (...picked: string[]) => derive(sitMultiple([go, ...picked.map(pick), submit])).attempts[0]!;

  it("scores an exact match 1, half the correct Options 0.5, and wrong picks down to 0", () => {
    expect(resultOf("opt_a", "opt_c")).toMatchObject({ answer: ["opt_a", "opt_c"], correct: true, partialScore: 1, blank: false });
    expect(resultOf("opt_a")).toMatchObject({ correct: false, partialScore: 0.5 });
    expect(resultOf("opt_a", "opt_b")).toMatchObject({ correct: false, partialScore: 0 });
    expect(resultOf("opt_a", "opt_b", "opt_c", "opt_d", "opt_e")).toMatchObject({ correct: false, partialScore: 0 });
  });

  it("scores an unanswered multiple-answer Question 0 and marks it blank", () => {
    expect(resultOf()).toMatchObject({ answer: [], correct: false, partialScore: 0, blank: true });
  });

  it("adds each selected Option to the answer and removes deselected ones, recording each complete answer in the trajectory", () => {
    const attempt = derive(sitMultiple([go, pick("opt_c"), pick("opt_b"), unpick("opt_b"), pick("opt_a"), submit])).attempts[0]!;
    expect(attempt).toMatchObject({ answer: ["opt_c", "opt_a"], correct: true, partialScore: 1 });
    expect(attempt.trajectory).toEqual({
      firstChoice: ["opt_c"],
      timeToFirstChoiceMs: 1_000,
      changes: [
        { answer: ["opt_c", "opt_b"], atMs: 2_000, dwellMs: 1_000 },
        { answer: ["opt_c"], atMs: 3_000, dwellMs: 1_000 },
        { answer: ["opt_c", "opt_a"], atMs: 4_000, dwellMs: 1_000 },
      ],
    });
  });

  it("gives a single-answer Question a partial score of 0 or 1", () => {
    expect(derive(input([navigate, select("opt_a"), submit])).attempts[0]).toMatchObject({ correct: true, partialScore: 1 });
    expect(derive(input([navigate, select("opt_b"), submit])).attempts[0]).toMatchObject({ correct: false, partialScore: 0 });
  });

  it("shows both the result and the partial score in the Digest, with answers in displayed letter order", () => {
    const { digest } = derive({ ...sitMultiple([go, pick("opt_c"), pick("opt_a"), submit]), optionOrders: { [multiple.id]: ["opt_c", "opt_b", "opt_a", "opt_d", "opt_e"] } });
    expect(digest).toContain(["- Answer given: A, C", "- Correct answer: A, C", "- Result: correct (partial score 1)"].join("\n"));
    const half = derive(sitMultiple([go, pick("opt_a"), submit])).digest;
    expect(half).toContain("- Type: multiple answer (select all that apply)");
    expect(half).toContain("- Result: wrong (partial score 0.5)");
    expect(derive(sitMultiple([go, submit])).digest).toContain("- Result: wrong (partial score 0)");
  });
});

describe("derive: Questions of an unrecognised type", () => {
  const ordering: Question = {
    ...question,
    id: "q_20261026_ordxyz",
    type: "ordering",
    stem: [{ type: "text", text: "Put the stages of mitosis in order." }],
    options: [],
    answer: ["prophase", "metaphase", "anaphase", "telophase"],
  };
  const sitOrdering = (events: RawEventBody[]): DerivationInput => {
    const stamped: RawEvent[] = events.map((e, i) => ({ ...e, seq: i + 1, at: i * 1000 }));
    return {
      ...input([]),
      rawLog: [{ ...input([]).rawLog[0]!, events: stamped, activeMs: events.length * 1000 }],
      questions: [ordering],
      questionOrder: [ordering.id],
      optionOrders: { [ordering.id]: [] },
    };
  };
  const go = { type: "navigate", questionId: ordering.id } as const;
  const stray = { type: "select", questionId: ordering.id, optionId: "prophase" } as const;

  it("is not graded and has no answer, even if the Raw log selects something for it", () => {
    const { attempts } = derive(sitOrdering([go, stray, submit]));
    expect(attempts[0]).toMatchObject({ answer: [], correct: null, partialScore: null, blank: true });
    expect(attempts[0]!.timing.answeringActiveMs).toBe(2_000);
    expect(attempts[0]!.trajectory).toEqual({ firstChoice: null, timeToFirstChoiceMs: null, changes: [] });
  });

  it("shows the stem, correct answer and time in the Digest, marked as not graded", () => {
    const { digest } = derive(sitOrdering([go, submit]));
    expect(digest).toContain(
      [
        "## Question 1",
        "",
        "Put the stages of mitosis in order.",
        "",
        '- Type: "ordering", not supported: shown read-only, not graded',
        "- Correct answer: prophase, metaphase, anaphase, telophase",
        "- Result: not graded",
        "- Answering time: 1.000 s",
        "- Confidence: none",
        "- Flags: none",
        "",
      ].join("\n"),
    );
  });
});

describe("derive: Confidence", () => {
  const confide = (q: Question, confidence: Confidence | null) => ({ type: "confidence", questionId: q.id, confidence }) as const;

  it("keeps the last Confidence set, and leaves an unset or cleared Confidence empty", () => {
    // Q1: guessed, then changed to probably. Q2: set to sure, then cleared.
    const result = derive(
      sitting([
        {
          activeMs: 20_000,
          events: [[0, open(question)], [2_000, confide(question, "guessed")], [4_000, confide(question, "probably")], [10_000, open(second)], [12_000, confide(second, "sure")], [14_000, confide(second, null)], [20_000, submit]],
        },
      ]),
    );
    expect(attemptOf(result, question).confidence).toBe("probably");
    expect(attemptOf(result, second).confidence).toBeNull();
  });

  it("is empty for every Attempt when Confidence collection is off in the snapshot", () => {
    const result = derive(
      sitting([{ activeMs: 10_000, events: [[0, open(question)], [2_000, confide(question, "sure")], [10_000, submit]] }], { rules: { ...rules, collectConfidence: false } }),
    );
    expect(result.attempts.map((a) => a.confidence)).toEqual([null, null]);
  });
});

describe("derive: Flags", () => {
  const flag = (q: Question, flag: Flag) => ({ type: "flag", questionId: q.id, flag }) as const;
  const unflag = (q: Question, flag: Flag) => ({ type: "unflag", questionId: q.id, flag }) as const;

  it("holds only the final Flags, each with its Phase and the wall-clock time it was added", () => {
    // Chunk 0 starts at wall time 1,000 s. Q1: careless at 3 s, memory at 4 s, careless removed at 5 s.
    const result = derive(
      sitting([
        {
          startedAt: 1_000_000,
          activeMs: 10_000,
          events: [[0, open(question)], [3_000, flag(question, "careless")], [4_000, flag(question, "memory")], [5_000, unflag(question, "careless")], [10_000, submit]],
        },
      ]),
    );
    expect(attemptOf(result, question).flags).toEqual([{ flag: "memory", phase: "answering", at: 1_004_000 }]);
    expect(attemptOf(result, second).flags).toEqual([]);
  });

  it("gives a Flag added after the answers were revealed the Phase reviewing", () => {
    // Submitted in chunk 0; on the review page an hour later, Q2 is flagged as a bad question.
    const result = derive(
      sitting([
        { startedAt: 0, activeMs: 10_000, events: [[0, open(question)], [2_000, flag(question, "concept")], [10_000, submit]] },
        { startedAt: 3_600_000, activeMs: 5_000, events: [[5_000, flag(second, "bad_question")]] },
      ]),
    );
    expect(attemptOf(result, question).flags).toEqual([{ flag: "concept", phase: "answering", at: 2_000 }]);
    expect(attemptOf(result, second).flags).toEqual([{ flag: "bad_question", phase: "reviewing", at: 3_605_000 }]);
  });
});

describe("derive: Note", () => {
  const note = (q: Question, text: string) => ({ type: "note", questionId: q.id, text }) as const;

  it("keeps the last Note saved in each Phase, and leaves a Note saved empty as empty", () => {
    // While answering: Q1's Note written then rewritten, Q2's written. On the review page: Q1 gets a reviewing Note; Q2's is written then emptied.
    const result = derive(
      sitting([
        { activeMs: 10_000, events: [[0, open(question)], [2_000, note(question, "Mixed up")], [3_000, note(question, "Mixed up ATP and GTP")], [4_000, note(second, "x")], [10_000, submit]] },
        { activeMs: 3_000, events: [[1_000, note(question, "GTP is for G proteins")], [2_000, note(second, "y")], [3_000, note(second, "")]] },
      ]),
    );
    expect(attemptOf(result, question).notes).toEqual({ answering: "Mixed up ATP and GTP", reviewing: "GTP is for G proteins" });
    expect(attemptOf(result, second).notes).toEqual({ answering: "x" });
  });
});

describe("derive: Digest marks", () => {
  const marked = (collectConfidence: boolean) =>
    sitting(
      [
        {
          activeMs: 20_000,
          events: [
            [0, open(question)],
            [2_000, { type: "confidence", questionId: question.id, confidence: "probably" }],
            [3_000, { type: "flag", questionId: question.id, flag: "concept" }],
            [4_000, { type: "note", questionId: question.id, text: "Mixed up ATP and GTP" }],
            [10_000, open(second)],
            [20_000, submit],
          ],
        },
        { activeMs: 5_000, events: [[4_000, { type: "note", questionId: question.id, text: "It was the cristae" }], [5_000, { type: "flag", questionId: question.id, flag: "bad_question" }]] },
      ],
      { rules: { ...rules, collectConfidence } },
    );

  it("shows Confidence and Flags with their Phase for every Question, and each Phase's Note where there is one", () => {
    const { digest } = derive(marked(true));
    expect(digest).toContain(
      ["- Answer changes: none", "- Item flags: none", "- Confidence: probably", "- Flags: concept confusion (answering), bad question (reviewing)", "- Note (answering): Mixed up ATP and GTP", "- Note (reviewing): It was the cristae", ""].join("\n"),
    );
    expect(digest).toContain(["- Answer changes: none", "- Item flags: none", "- Confidence: none", "- Flags: none", ""].join("\n"));
  });

  it("says Confidence was not collected when collection was off", () => {
    const { digest } = derive(marked(false));
    expect(digest).toContain("- Confidence: not collected\n- Flags: concept confusion (answering), bad question (reviewing)\n");
  });
});

describe("derive: removed Flags", () => {
  // Q1: concept added while answering and removed, careless added; Q2: memory added and removed on the review page.
  const sat = () =>
    sitting([
      {
        activeMs: 10_000,
        events: [
          [0, open(question)],
          [1_000, { type: "flag", questionId: question.id, flag: "concept" }],
          [2_000, { type: "unflag", questionId: question.id, flag: "concept" }],
          [3_000, { type: "flag", questionId: question.id, flag: "careless" }],
          [10_000, submit],
        ],
      },
      { activeMs: 5_000, events: [[1_000, { type: "flag", questionId: second.id, flag: "memory" }], [2_000, { type: "unflag", questionId: second.id, flag: "memory" }]] },
    ]);

  it("lists removed Flags in the Digest with the Phase they were added in, keeping the Attempt to the final Flags", () => {
    const result = derive(sat());
    expect(attemptOf(result, question).flags.map((f) => f.flag)).toEqual(["careless"]);
    expect(attemptOf(result, second).flags).toEqual([]);
    expect(result.digest).toContain("- Flags: careless (answering); removed: concept confusion (answering)\n");
    expect(result.digest).toContain("- Flags: none; removed: memory (reviewing)\n");
  });

  it("keeps removed Flags in the Digest written with Overrides", () => {
    const result = derive(sat());
    const digest = digestWithOverrides(sat(), result, new Map([[question.id, { correct: true }]]));
    expect(digest).toContain("- Flags: careless (answering); removed: concept confusion (answering)\n");
  });
});

describe("derive: Item flags", () => {
  const itemFlag = (q: Question, optionId: string, flag: ItemFlag) => ({ type: "itemFlag", questionId: q.id, optionId, itemFlag: flag }) as const;
  const itemUnflag = (q: Question, optionId: string, flag: ItemFlag) => ({ type: "itemUnflag", questionId: q.id, optionId, itemFlag: flag }) as const;
  // Q1 shown as A opt_c, B opt_a, C opt_b. While answering: opt_b eliminated, opt_c eliminated then taken back, opt_a sure right.
  // On the review page: opt_c gets unknown term.
  const sat = () =>
    sitting(
      [
        {
          startedAt: 1_000_000,
          activeMs: 10_000,
          events: [
            [0, open(question)],
            [1_000, itemFlag(question, "opt_b", "eliminated")],
            [2_000, itemFlag(question, "opt_c", "eliminated")],
            [3_000, itemUnflag(question, "opt_c", "eliminated")],
            [4_000, itemFlag(question, "opt_a", "sure_right")],
            [10_000, submit],
          ],
        },
        { startedAt: 2_000_000, activeMs: 2_000, events: [[2_000, itemFlag(question, "opt_c", "unknown_term")]] },
      ],
      { optionOrders: { [question.id]: ["opt_c", "opt_a", "opt_b"], [second.id]: ["opt_a", "opt_b"] } },
    );

  it("keeps the final Item flags keyed by Option id, each with its Phase and the wall-clock time it was added", () => {
    const result = derive(sat());
    expect(attemptOf(result, question).itemFlags).toEqual({
      opt_b: [{ itemFlag: "eliminated", phase: "answering", at: 1_001_000 }],
      opt_a: [{ itemFlag: "sure_right", phase: "answering", at: 1_004_000 }],
      opt_c: [{ itemFlag: "unknown_term", phase: "reviewing", at: 2_002_000 }],
    });
    expect(attemptOf(result, second).itemFlags).toEqual({});
  });

  it("lists Item flags in the Digest by displayed letter, with their Phase", () => {
    const { digest } = derive(sat());
    expect(digest).toContain("- Item flags: A unknown term (reviewing), B sure right (answering), C eliminated (answering)\n");
    expect(digest).toContain("- Item flags: none\n");
  });
});

describe("derive: Hints", () => {
  const hinted: Question = {
    ...question,
    hints: [[{ type: "text", text: "Think about energy." }], [{ type: "text", text: "Which organelle has cristae?" }], [{ type: "text", text: "Not {{opt:opt_b}}." }]],
  };
  const openHint = (q: Question, level: number) => ({ type: "openHint", questionId: q.id, level }) as const;
  const sat = (chunks: ChunkSpec[]) => sitting(chunks, { questions: [hinted, second] });

  it("records each Hint opened in level order with its Phase, wall-clock time and the answering time spent on the Question so far", () => {
    const result = derive(
      sat([
        { startedAt: 1_000_000, activeMs: 20_000, events: [[0, open(question)], [5_000, openHint(question, 0)], [12_000, openHint(question, 1)], [20_000, submit]] },
        { startedAt: 2_000_000, activeMs: 3_000, events: [[3_000, openHint(question, 2)]] },
      ]),
    );
    expect(attemptOf(result, question).hintsUsed).toEqual([
      { level: 0, phase: "answering", at: 1_005_000, answeringMs: 5_000 },
      { level: 1, phase: "answering", at: 1_012_000, answeringMs: 12_000 },
      { level: 2, phase: "reviewing", at: 2_003_000, answeringMs: null },
    ]);
    expect(attemptOf(result, second).hintsUsed).toEqual([]);
  });

  it("ignores a Hint opened out of level order, opened again, or beyond the Hints the Question has", () => {
    const result = derive(
      sat([
        {
          activeMs: 10_000,
          events: [[0, open(question)], [1_000, openHint(question, 1)], [2_000, openHint(question, 0)], [3_000, openHint(question, 0)], [4_000, openHint(question, 2)], [10_000, submit]],
        },
        { activeMs: 3_000, events: [[1_000, openHint(question, 1)], [2_000, openHint(question, 2)], [3_000, openHint(question, 3)], [3_000, openHint(second, 0)]] },
      ]),
    );
    expect(attemptOf(result, question).hintsUsed.map((h) => [h.level, h.phase])).toEqual([
      [0, "answering"],
      [1, "reviewing"],
      [2, "reviewing"],
    ]);
    expect(attemptOf(result, second).hintsUsed).toEqual([]);
  });

  it("highlights Hints used while answering in the Digest, with their text, and lists Hints opened after the reveal as reviewing", () => {
    const { digest } = derive(
      sat([
        { activeMs: 20_000, events: [[0, open(question)], [5_000, openHint(question, 0)], [12_000, openHint(question, 1)], [20_000, submit]] },
        { activeMs: 3_000, events: [[3_000, openHint(question, 2)]] },
      ]),
    );
    expect(digest).toContain(
      [
        "- **Hints used while answering: 2 of 3**",
        "  - Level 1, after 5.000 s: Think about energy.",
        "  - Level 2, after 12.000 s: Which organelle has cristae?",
        "- Hints opened while reviewing: level 3",
        "",
      ].join("\n"),
    );
  });

  it("says no Hint was used when a Question has Hints, and says nothing about Hints when it has none", () => {
    const { digest } = derive(sat([{ activeMs: 10_000, events: [[0, open(question)], [10_000, submit]] }]));
    expect(digest).toContain("- Hints used while answering: none of 3\n");
    expect(digest.match(/Hints/g)).toHaveLength(1);
  });
});

describe("derive: appeals", () => {
  const appeal = (q: Question, reason: string) => ({ type: "appeal", questionId: q.id, reason }) as const;

  it("adds the bad-question Flag and keeps the reason, with its Phase and time", () => {
    const result = derive(
      sitting([
        { startedAt: 1_000_000, activeMs: 10_000, events: [[0, open(question)], [3_000, appeal(question, "Ribosomes make no ATP, but neither does Golgi")], [10_000, submit]] },
        { startedAt: 2_000_000, activeMs: 2_000, events: [[2_000, appeal(second, "Both answers are right")]] },
      ]),
    );
    expect(attemptOf(result, question).flags).toEqual([{ flag: "bad_question", phase: "answering", at: 1_003_000 }]);
    expect(attemptOf(result, question).appeals).toEqual([{ reason: "Ribosomes make no ATP, but neither does Golgi", phase: "answering", at: 1_003_000 }]);
    expect(attemptOf(result, second).flags).toEqual([{ flag: "bad_question", phase: "reviewing", at: 2_002_000 }]);
    expect(attemptOf(result, second).appeals).toEqual([{ reason: "Both answers are right", phase: "reviewing", at: 2_002_000 }]);
  });

  it("ignores an appeal without a reason", () => {
    const result = derive(sitting([{ activeMs: 10_000, events: [[0, open(question)], [3_000, appeal(question, "  \n ")], [10_000, submit]] }]));
    expect(attemptOf(result, question).flags).toEqual([]);
    expect(attemptOf(result, question).appeals).toEqual([]);
  });

  it("gives the reason in the Digest beside the bad-question Flag", () => {
    const { digest } = derive(sitting([{ activeMs: 10_000, events: [[0, open(question)], [3_000, appeal(question, "The stem is ambiguous")], [10_000, submit]] }]));
    expect(digest).toContain("- Flags: bad question (answering)\n- Appeal (answering): the learner thinks the answer is wrong: The stem is ambiguous\n");
  });
});

describe("derive: Answering timeline", () => {
  const hinted: Question = { ...question, hints: [[{ type: "text", text: "Think about energy." }], [{ type: "text", text: "Which organelle has cristae?" }]] };
  const itemFlag = (q: Question, optionId: string, flag: ItemFlag) => ({ type: "itemFlag", questionId: q.id, optionId, itemFlag: flag }) as const;
  const itemUnflag = (q: Question, optionId: string, flag: ItemFlag) => ({ type: "itemUnflag", questionId: q.id, optionId, itemFlag: flag }) as const;
  const openHint = (q: Question, level: number) => ({ type: "openHint", questionId: q.id, level }) as const;
  const confidence = (q: Question, c: Confidence | null) => ({ type: "confidence", questionId: q.id, confidence: c }) as const;
  const flag = (q: Question, f: Flag) => ({ type: "flag", questionId: q.id, flag: f }) as const;
  const unflag = (q: Question, f: Flag) => ({ type: "unflag", questionId: q.id, flag: f }) as const;
  const deselect = (q: Question, optionId: string) => ({ type: "deselect", questionId: q.id, optionId }) as const;
  const note = (q: Question, text: string) => ({ type: "note", questionId: q.id, text }) as const;
  const appeal = (q: Question, reason: string) => ({ type: "appeal", questionId: q.id, reason }) as const;

  // Q1 0–10 s: B eliminated, Hint 0, C chosen. Q2 10–20 s. Q1 flicked past 20–20.3 s. Q2 20.3–25 s.
  // Q1 again 25–40 s: answer changed to A, Confidence probably, careless Flag. Submitted at 40 s, then a reviewing Flag.
  const sat = () =>
    sitting(
      [
        {
          activeMs: 40_000,
          events: [
            [0, open(question)],
            [2_000, itemFlag(question, "opt_b", "eliminated")],
            [4_000, openHint(question, 0)],
            [6_000, choose(question, "opt_c")],
            [10_000, open(second)],
            [20_000, open(question)],
            [20_300, open(second)],
            [25_000, open(question)],
            [30_000, choose(question, "opt_a")],
            [32_000, confidence(question, "probably")],
            [35_000, flag(question, "careless")],
            [40_000, submit],
          ],
        },
        { activeMs: 2_000, events: [[1_000, flag(question, "memory")]] },
      ],
      { questions: [hinted, second] },
    );

  it("lists every action on a Question while answering, in order, each at the answering time spent on it so far, leaving out a stretch too short to be a Visit", () => {
    expect(attemptOf(derive(sat()), question).timeline).toEqual([
      { atMs: 0, kind: "open" },
      { atMs: 2_000, kind: "itemFlag", optionId: "opt_b", itemFlag: "eliminated" },
      { atMs: 4_000, kind: "openHint", level: 0 },
      { atMs: 6_000, kind: "select", optionId: "opt_c", answer: ["opt_c"] },
      { atMs: 10_000, kind: "leave" },
      { atMs: 10_000, kind: "open" },
      { atMs: 15_000, kind: "select", optionId: "opt_a", answer: ["opt_a"] },
      { atMs: 17_000, kind: "confidence", confidence: "probably" },
      { atMs: 20_000, kind: "flag", flag: "careless" },
      { atMs: 25_000, kind: "leave" },
    ]);
    expect(attemptOf(derive(sat()), second).timeline).toEqual([
      { atMs: 0, kind: "open" },
      { atMs: 10_000, kind: "leave" },
      { atMs: 10_000, kind: "open" },
      { atMs: 14_700, kind: "leave" },
    ]);
  });

  it("does not count time while the page is hidden", () => {
    // Chunk 0: Q1 0–15 s, then hidden for an hour. Chunk 1: C chosen 5 s after showing, submitted 8 s after.
    const result = derive(
      sitting([
        { activeMs: 15_000, events: [[0, open(question)], [15_000, { type: "hide" }]] },
        { activeMs: 8_000, events: [[0, { type: "show", wall: 3_600_000 }], [5_000, choose(question, "opt_c")], [8_000, submit]] },
      ]),
    );
    expect(attemptOf(result, question).timeline).toEqual([
      { atMs: 0, kind: "open" },
      { atMs: 20_000, kind: "select", optionId: "opt_c", answer: ["opt_c"] },
      { atMs: 23_000, kind: "leave" },
    ]);
  });

  it("includes deselections, Item flags and Flags taken back, Confidence cleared, Appeals and Notes saved, but not actions that changed nothing", () => {
    const result = derive(
      sitting(
        [
          {
            activeMs: 10_000,
            events: [
              [0, open(question)],
              [1_000, choose(question, "opt_a")],
              [2_000, deselect(question, "opt_a")],
              [2_500, deselect(question, "opt_b")],
              [3_000, itemFlag(question, "opt_c", "eliminated")],
              [3_500, itemUnflag(question, "opt_c", "eliminated")],
              [3_700, itemUnflag(question, "opt_b", "sure_right")],
              [4_000, confidence(question, "guessed")],
              [4_500, confidence(question, null)],
              [5_000, unflag(question, "focus")],
              [5_500, appeal(question, "Two answers fit")],
              [6_000, unflag(question, "bad_question")],
              [6_500, appeal(question, "  ")],
              [7_000, note(question, "Not sure about B")],
              [7_500, note(question, "")],
              [8_000, openHint(question, 1)],
              [10_000, submit],
            ],
          },
        ],
        { questions: [hinted, second] },
      ),
    );
    const { timeline } = attemptOf(result, question);
    expect(timeline.map((s) => s.kind)).toEqual(["open", "select", "deselect", "itemFlag", "itemUnflag", "confidence", "confidence", "appeal", "unflag", "note", "note", "leave"]);
    expect(timeline).toContainEqual({ atMs: 2_000, kind: "deselect", optionId: "opt_a", answer: [] });
    expect(timeline).toContainEqual({ atMs: 4_500, kind: "confidence", confidence: null });
    expect(timeline).toContainEqual({ atMs: 5_500, kind: "appeal", reason: "Two answers fit" });
    expect(timeline).toContainEqual({ atMs: 7_500, kind: "note", text: "" });
  });

  it("leaves Confidence out when it was not collected", () => {
    const result = derive(
      sitting([{ activeMs: 10_000, events: [[0, open(question)], [4_000, confidence(question, "sure")], [10_000, submit]] }], { rules: { ...rules, collectConfidence: false } }),
    );
    expect(attemptOf(result, question).timeline.map((s) => s.kind)).toEqual(["open", "leave"]);
  });

  it("writes every step into the Digest in displayed letters, with the time spent on the Question", () => {
    const { digest } = derive({ ...sat(), optionOrders: { [question.id]: ["opt_c", "opt_a", "opt_b"], [second.id]: ["opt_a", "opt_b"] } });
    expect(digest).toContain(
      [
        "- Answering timeline (time spent on this Question so far):",
        "  - 0.000 s: Visit 1 opened",
        "  - 2.000 s: Item flag on C: eliminated",
        "  - 4.000 s: Hint level 1 opened",
        "  - 6.000 s: selected A; answer now A",
        "  - 10.000 s: Visit 1 left",
        "  - 10.000 s: Visit 2 opened",
        "  - 15.000 s: selected B; answer now B",
        "  - 17.000 s: Confidence: probably",
        "  - 20.000 s: Flag added: careless",
        "  - 25.000 s: Visit 2 left",
        "",
      ].join("\n"),
    );
  });

  it("writes taken-back marks, Appeals and Notes into the Digest", () => {
    const { digest } = derive(
      sitting([
        {
          activeMs: 10_000,
          events: [
            [0, open(question)],
            [1_000, choose(question, "opt_b")],
            [2_000, deselect(question, "opt_b")],
            [3_000, itemFlag(question, "opt_c", "unknown_term")],
            [3_500, itemUnflag(question, "opt_c", "unknown_term")],
            [4_000, confidence(question, null)],
            [5_000, appeal(question, "Two answers fit")],
            [6_000, unflag(question, "bad_question")],
            [7_000, note(question, "Not sure")],
            [7_500, note(question, "")],
            [10_000, submit],
          ],
        },
      ]),
    );
    expect(digest).toContain(
      [
        "  - 1.000 s: selected B; answer now B",
        "  - 2.000 s: deselected B; answer now (blank)",
        "  - 3.000 s: Item flag on C: unknown term",
        "  - 3.500 s: Item flag removed from C: unknown term",
        "  - 4.000 s: Confidence cleared",
        "  - 5.000 s: Appeal: Two answers fit",
        "  - 6.000 s: Flag removed: bad question",
        "  - 7.000 s: Note saved: Not sure",
        "  - 7.500 s: Note cleared",
      ].join("\n"),
    );
  });

  it("says so in the Digest when a Question was never opened while answering", () => {
    const { digest } = derive(sitting([{ activeMs: 10_000, events: [[0, open(question)], [10_000, submit]] }]));
    expect(digest).toContain("- Answering timeline: never opened while answering\n");
  });
});

describe("derive: Misconception in the Digest", () => {
  const withMisconceptions: Question = {
    ...question,
    type: "multiple_answer",
    answer: ["opt_a"],
    options: [
      { id: "opt_a", content: [{ type: "text", text: "Mitochondrion" }], rationale: [] },
      { id: "opt_b", content: [{ type: "text", text: "Ribosome" }], rationale: [], misconception: [{ type: "text", text: "Confuses making proteins with making ATP." }] },
      { id: "opt_c", content: [{ type: "text", text: "Golgi apparatus" }], rationale: [], misconception: [{ type: "text", text: "Thinks packaging needs its own energy source." }] },
    ],
  };
  const sat = (...picked: string[]) =>
    sitting([{ activeMs: 10_000, events: [[0, open(question)], ...picked.map((id, i): [number, RawEventBody] => [1_000 * (i + 1), choose(question, id)]), [10_000, submit]] }], {
      questions: [withMisconceptions, second],
      optionOrders: { [question.id]: ["opt_c", "opt_a", "opt_b"], [second.id]: ["opt_a", "opt_b"] },
    });

  it("names the Misconception of each wrong Option in a wrong answer, in displayed order, labelled as the question writer's guess", () => {
    const { digest } = derive(sat("opt_b", "opt_a", "opt_c"));
    expect(digest).toContain(
      [
        "- Misconception the question writer had in mind (their guess, not a finding):",
        "  - A: Thinks packaging needs its own energy source.",
        "  - C: Confuses making proteins with making ATP.",
      ].join("\n"),
    );
  });

  it("is left out for a correct answer, a blank one, and a result overridden to correct", () => {
    expect(derive(sat("opt_a")).digest).not.toContain("Misconception");
    expect(derive(sat()).digest).not.toContain("Misconception");
    const result = derive(sat("opt_b"));
    expect(digestWithOverrides(sat("opt_b"), result, new Map([[question.id, { correct: true }]]))).not.toContain("Misconception");
  });
});
