import questionWritingSkill from "../../skills/pencilmark-question-writing/SKILL.md?raw";
import gradingSkill from "../../skills/pencilmark-grading/SKILL.md?raw";

// The copy texts for the two Skills. They are read by an AI, so what is added here is fixed English, like the Digest.

/** The question-writing Skill, followed by the learner's Tracks and Topic paths when given. */
export function questionWritingSkillText(topicPaths?: string[]): string {
  if (!topicPaths?.length) return questionWritingSkill;
  const paths = ["These are my current Tracks and Topics. Use these paths exactly where a Question fits them:", "", ...topicPaths.map((path) => `- ${path}`)];
  return [questionWritingSkill.trimEnd(), "", "---", "", "## My current Tracks and Topics", "", ...paths, ""].join("\n");
}

/** The grading Skill alone; the Digest is copied separately. */
export function gradingSkillText(): string {
  return gradingSkill;
}
