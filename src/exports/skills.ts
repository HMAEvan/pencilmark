import questionWritingSkill from "../../skills/pencilmark-question-writing/SKILL.md?raw";
import gradingSkill from "../../skills/pencilmark-grading/SKILL.md?raw";

// The copy texts for the two Skills. They are read by an AI, so what is added here is fixed English, like the Digest.

/** The question-writing Skill alone; the learner's Tracks and Topics are copied separately. */
export function questionWritingSkillText(): string {
  return questionWritingSkill;
}

/** The learner's current Tracks and Topic paths, to paste after the Skill or later in the chat. */
export function topicsListText(topicPaths: string[]): string {
  return ["These are my current Tracks and Topics. Use these paths exactly where a Question fits them:", "", ...topicPaths.map((path) => `- ${path}`), ""].join("\n");
}

/** The grading Skill alone; the Digest is copied separately. */
export function gradingSkillText(): string {
  return gradingSkill;
}

/** The grading Skill's `metadata.version`, which a Showcase's Feedback label must match. */
export function gradingSkillVersion(): string {
  return /^ {2}version: "([^"]+)"$/m.exec(gradingSkill)?.[1] ?? "";
}
