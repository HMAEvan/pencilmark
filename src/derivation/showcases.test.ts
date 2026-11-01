import { describe, expect, it } from "vitest";
import { SHOWCASES, replayShowcase, type ShowcaseScript } from "../showcase/showcase";
import { loadDerivedSession } from "../session/sessions";
import { gradingSkillVersion } from "../exports/skills";

// The staleness test: a Showcase's stored Digest, and the Feedback written from it, must be what the current code produces.
// A failure means the Digest is regenerated (`npx vitest run -u`), and then the Feedback.

describe("Derivation: Showcases", () => {
  it("has at least one Showcase", () => {
    expect(SHOWCASES.length).toBeGreaterThan(0);
  });

  it.each(SHOWCASES.map((s) => [s.name, s] as const))("replaying %s gives exactly its stored Digest", async (name, showcase) => {
    const { storage, sessionId } = await replayShowcase(showcase);
    const derived = await loadDerivedSession(storage, sessionId);
    await expect(derived?.derivation.digest).toMatchFileSnapshot(`../../showcases/${name}/digest.md`);
  });

  it("labels each Feedback with the current grading Skill version", () => {
    for (const { name, feedback } of SHOWCASES) {
      if (feedback) expect({ name, version: feedback.label.gradingSkillVersion }).toEqual({ name, version: gradingSkillVersion() });
    }
  });

  // A small script on the general-science Question pack: Q4 opened at 1 s, submitted at 60 s.
  const replayed = async (events: ShowcaseScript["events"]) => {
    const base = SHOWCASES.find((s) => s.name === "general-science")!;
    const script: ShowcaseScript = { ...base.script, questionOrder: ["q4"], optionOrders: {}, events: [{ ms: 0, type: "show" }, { ms: 1000, type: "navigate", questionId: "q4" }, ...events, { ms: 60_000, type: "submit" }] };
    const { storage, sessionId } = await replayShowcase({ ...base, script });
    return (await loadDerivedSession(storage, sessionId))!.attempts[0]!.timeline;
  };

  it("replays a writing action as Writing spans, with the answer change between its stretches", async () => {
    const timeline = await replayed([
      { type: "write", questionId: "q4", field: "note", entry: 0, stretches: [{ from: 2000, to: 8000, add: "A lap ends where it started." }, { from: 12_000, to: 16_000, add: " So displacement is zero." }] },
      { ms: 10_000, type: "select", questionId: "q4", optionId: "opt_zero" },
    ]);
    expect(timeline.map((s) => s.kind)).toEqual(["open", "writing", "select", "writing", "note", "leave"]);
    const note = timeline.find((s) => s.kind === "note");
    expect(note).toMatchObject({ text: "A lap ends where it started. So displacement is zero." });
  });

  it("replays a single-ms note as an instant save, with no Writing span", async () => {
    const timeline = await replayed([{ ms: 5000, type: "note", questionId: "q4", text: "A lap ends where it started." }]);
    expect(timeline.map((s) => s.kind)).toEqual(["open", "note", "leave"]);
  });
});
