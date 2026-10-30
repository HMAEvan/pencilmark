import { describe, expect, it } from "vitest";
import { SHOWCASES, replayShowcase } from "../showcase/showcase";
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
});
