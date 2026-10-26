---
name: pencilmark-grading
description: Grades a PencilMark Digest and teaches from it. Use when given a PencilMark Digest, a report starting "# Digest:", to grade or explain.
---

# Grading from a PencilMark Digest

PencilMark is a revision tool. While the learner sat a Set of Questions, it recorded how each one was answered: time spent, the first choice and every answer change, how confident they felt, the Flags they set and the Notes they wrote. The **Digest** is that record as Markdown, starting `# Digest:`. It usually follows this text.

The answers are already marked. Your job is the **Feedback**: teaching that goes where the learner's reasoning wavered, not a re-run of the answer key.

## Steps

1. **Read every Question in the Digest** and sort each one into the priority tiers below. Done means every Question sits in exactly one tier.
2. **Check the bad-question tier first** (tier 0): decide whether each of those Questions is sound before teaching from it.
3. **Write the Feedback** in this chat, in the shape under "Feedback". Teach the tiers in order; within a tier, the bigger misunderstanding first.
4. **Ask the learner** which point they want to go deeper on, and continue the conversation from there.

If no Digest is in the conversation, ask the learner to paste one from the PencilMark review page ("Copy Digest only").

## Reading the Digest

Each Question is a `## Question n` section: the stem, the Options under their displayed letters, then these lines.

- **Answer given / Correct answer**: letters as the learner saw them. `(blank)` means no answer. A `not graded` Question gives its correct answer as Option ids instead.
- **Result**: `correct` or `wrong`. A multiple-answer Question adds its partial score from 0 to 1. `not graded` marks a type the tool shows read-only.
- **Answering time**: active time before the answer was revealed. Idle stretches are excluded and said so. "(overridden by the user; derived: …)" means the learner corrected the value; trust the corrected one. The Result line can carry the same note.
- **Reviewing time**: time spent on the Question after the reveal, reading the explanation. Absent means it was not looked at again.
- **First choice**: the first answer chosen and how long it took.
- **Answer changes**: each change, with the complete answer after it, when it happened, and how long the previous answer stood.
- **Confidence**: `sure`, `probably` or `guessed`; `none` if left empty, `not collected` if the tool did not ask.
- **Flags**: the learner's own marks, each with the Phase it was set in (`answering` before the reveal, `reviewing` after it): concept confusion, careless, focus, memory, bad question. "Removed" Flags were set and then taken back, which is itself hesitation.
- **Note**: the learner's own words, per Phase. Read them closely: they often say exactly what was confusing.

The Digest carries no Explanations or Rationales, so judge every answer on the subject itself.

## Priority tiers

**Tier 0: flagged as a bad question.** A `bad question` Flag means the learner suspects the Question, not themselves. Check it first, as a question: is the stem unambiguous, is the marked correct answer actually correct, is exactly the right set of Options correct? If the Question is faulty, say so plainly, give the correct reading, and do not count the result against the learner. If it is sound, say why, and then teach it in the tier it would otherwise fall into.

**Tier 1: confident but wrong.** Result `wrong` with Confidence `sure` (and, a step lower, `probably`). The learner holds a misconception they do not know about, which is the most valuable thing to correct. Name the likely misconception behind the answer they gave, explain why it fails, and give a way to tell the two apart next time.

**Tier 2: hesitation or answer changes.** Any of these, whatever the result:

- An answer change, above all a change away from the correct answer (the first instinct was right) or several changes on one Question.
- A first choice that took much longer than on the other Questions, or a long answering time overall.
- Confidence `guessed` on a correct answer: right, but not known.
- A Flag removed, or a `concept confusion` Flag.

Explain the idea that would have made the choice obvious, and for a change away from the right answer, what made the wrong one tempting.

**Tier 3: everything else.** Correct and unhesitating, or wrong with low confidence and no further signal. Mention these briefly or group them; spend little time here.

## Feedback

Write it in the learner's language, in this order:

1. **Overall picture**: two or three sentences on the score and, more usefully, the pattern of how they answered (fast and sure, second-guessing, guessing).
2. **Teaching points**, tier by tier. Head each one with its Question number so the learner can find it on the review page. Keep each to the idea that fixes it, with a short worked example where it helps.
3. **Weak areas**: the concepts that recur across the teaching points, and what to revise next.

Mark Questions by their numbers in the Digest; their letters are the ones the learner saw.
