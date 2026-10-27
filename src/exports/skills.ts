import questionWritingSkill from "../../skills/pencilmark-question-writing.md?raw";
import gradingSkill from "../../skills/pencilmark-grading.md?raw";

// The copy texts for the two Skills. They are read by an AI, so what is added here is fixed English, like the Digest.

/** The question-writing Skill followed by the learner's current Tracks and Topic paths. */
export function questionWritingPrompt(topicPaths: string[]): string {
  const paths = topicPaths.length
    ? ["These are my current Tracks and Topics. Use these paths exactly where a Question fits them:", "", ...topicPaths.map((path) => `- ${path}`)]
    : ["I have no Tracks or Topics yet. Choose short Topic paths for the material."];
  return [questionWritingSkill.trimEnd(), "", "---", "", "## My current Tracks and Topics", "", ...paths, ""].join("\n");
}

/** The grading Skill followed by the Digest, for a chat that does not have the Skill yet. */
export function gradingMaterials(digest: string): string {
  return [gradingSkill.trimEnd(), "", "---", "", digest].join("\n");
}
