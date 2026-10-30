---
name: pencilmark-grading
description: Grades a PencilMark Digest and teaches from it. Use when given a PencilMark Digest, a report starting "# Digest:", to grade or explain.
metadata:
  version: "1.2.0"
---

# Grading from a PencilMark Digest

PencilMark is a revision tool. While the learner sat a Set of Questions, it recorded how each one was answered: time spent, the first choice and every answer change, the Options they eliminated or were sure of, the Hints they needed, how confident they felt, the Flags they set and the Notes they wrote. The **Digest** is that record as Markdown, starting `# Digest:`. It may follow this text, come in the next message, or arrive as an attached file.

The answers are already marked. Your job is the **Feedback**: teaching that goes where the learner's reasoning wavered, not a re-run of the answer key.

## Steps

1. **Read every Question in the Digest** and sort each one into the priority tiers below. Done means every Question sits in exactly one tier.
2. **Check the bad-question tier first** (tier 0): decide whether each of those Questions is sound before teaching from it.
3. **Write the Feedback** in this chat, in the shape under "Feedback". Teach the tiers in order; within a tier, the bigger misunderstanding first.
4. **Ask the learner** which point they want to go deeper on, and continue the conversation from there.

If no Digest is in the conversation, ask the learner to attach or paste one from the PencilMark review page ("Download Digest", or "Copy Digest as text").

## Reading the Digest

Each Question is a `## Question n` section: the stem, the Options under their displayed letters, then these lines.

- **Answer given / Correct answer**: letters as the learner saw them. `(blank)` means no answer. A `not graded` Question gives its correct answer as Option ids instead.
- **Result**: `correct` or `wrong`. A multiple-answer Question adds its partial score from 0 to 1. `not graded` marks a type the tool shows read-only.
- **Answering time**: active time before the answer was revealed. Idle stretches are excluded and said so. "(overridden by the user; derived: …)" means the learner corrected the value; trust the corrected one. The Result line can carry the same note.
- **Reviewing time**: time spent on the Question after the reveal, reading the explanation. Absent means it was not looked at again.
- **First choice**: the first answer chosen and how long it took.
- **Answer changes**: each change, with the complete answer after it, when it happened, and how long the previous answer stood.
- **Misconception the question writer had in mind** (only for a wrong answer): for each wrong Option the learner chose, the misunderstanding the question writer designed that Option to catch. It is the writer's guess, written before anyone answered, not a finding about this learner. Check it against how they actually answered before using it.
- **Item flags**: the learner's pencil marks on single Options, by letter, each with its Phase: `eliminated`, `eliminated but unsure`, `sure right`, `unknown term`. An Option eliminated but correct, or marked sure right but wrong, pinpoints the misconception; `unknown term` means a word in that Option was not understood, so teach the term.
- **Hints used while answering** (in bold when any were used): how many of the Question's Hints the learner opened before the answer was revealed, lightest first, each with the time spent on the Question when it was opened and what it said. A correct answer reached with Hints is not yet known unaided. Absent when the Question has no Hints. **Hints opened while reviewing** were read after the reveal, like an explanation, and are not help.
- **Confidence**: `sure`, `probably` or `guessed`; `none` if left empty, `not collected` if the tool did not ask.
- **Flags**: the learner's own marks, each with the Phase it was set in (`answering` before the reveal, `reviewing` after it): concept confusion, careless, focus, memory, bad question. "Removed" Flags were set and then taken back, which is itself hesitation.
- **Appeal**: the learner pressed "I think the answer is wrong" and gave this reason; it always comes with a `bad question` Flag.
- **Note**: the learner's own words, per Phase. Read them closely: they often say exactly what was confusing.
- **Answering timeline**: every step the learner took on the Question before the reveal, in order. Each line starts with the time spent on this Question so far: the clock runs only while the Question is on screen, so a time does not move while the learner is on another Question or away from the page. The steps:
  - `Visit n opened` / `Visit n left`: each stretch the Question was on screen. A second Visit means they came back to it; a glance too short to count is left out.
  - `selected X; answer now …` / `deselected X; answer now …`: each click on an Option, with the complete answer after it.
  - `Item flag on X: …` / `Item flag removed from X: …`: pencil marks on an Option, set or taken back.
  - `Hint level n opened`: when they asked for help (the Hint's text is in the Hints lines above).
  - `Confidence: …` / `Confidence cleared`, `Flag added: …` / `Flag removed: …`, `Appeal: …`, `Note saved: …` / `Note cleared`: marks as they were made.

  Read it as the story of how the answer was reached: what they ruled out first, whether they chose before or after a Hint, whether they changed their answer on coming back. Marks made after the reveal are not in it; they are in the Flags, Item flags and Note lines, with their Phase.

The Digest carries no Explanations or Rationales, so judge every answer on the subject itself.

## Reading each Question type

What counts as hesitation depends on the type. A multiple-answer Question is marked `- Type: multiple answer (select all that apply)`; a single-answer Question carries no Type line. True/false is a single-answer Question with the two Options True and False.

- **Single answer** and **true/false**: one click gives a complete answer, so every answer change is a real change of mind. On true/false, a change is a full reversal of the judgement; a fast answer is normal there, since there are only two Options.
- **Multiple answer**: the learner builds the answer one Option at a time, and every tick is logged as an answer change. The **First choice** is only the first Option ticked, not a complete answer. A run of changes in which each answer only adds an Option to the one before (`A`, then `A, C`, then `A, C, D`) is the answer being assembled: read it as one decision and treat it as no hesitation at all. The hesitation signals are:
  - an Option unticked after being ticked (an answer that drops a letter the previous one had);
  - the same Option ticked, unticked and ticked again;
  - a long gap (`after …`) before one particular Option was added or removed, which points at that Option as the doubtful one.

  For teaching, name the Options the learner hesitated over, and the Options they missed or wrongly included, rather than the Question as a whole.

## Priority tiers

**Tier 0: flagged as a bad question.** A `bad question` Flag means the learner suspects the Question, not themselves. An Appeal line gives the learner's reason: address it directly. Check it first, as a question: is the stem unambiguous, is the marked correct answer actually correct, is exactly the right set of Options correct? If the Question is faulty, say so plainly, give the correct reading, and do not count the result against the learner. If it is sound, say why, and then teach it in the tier it would otherwise fall into.

**Tier 1: confident but wrong.** Result `wrong` with Confidence `sure` (and, a step lower, `probably`). The learner may hold a misconception they do not know about, which is the most valuable thing to correct. Offer a possible reason for the answer they gave (the Misconception line, or one you infer), checked against their Answering timeline and marks; explain the idea it gets wrong, and give a way to tell the two apart next time.

**Tier 2: hesitation or answer changes.** Any of these, whatever the result:

- An answer change that counts as hesitation for its type (see "Reading each Question type"), above all a change away from the correct answer (the first instinct was right) or several such changes on one Question.
- A first choice that took much longer than on the other Questions, or a long answering time overall.
- Confidence `guessed` on a correct answer: right, but not known.
- A Flag removed, or a `concept confusion` Flag.
- Hints used while answering, or an Option marked `eliminated but unsure` or `unknown term`.
- The correct Option eliminated, or a wrong Option marked `sure right` (if the result is wrong and Confidence is high, this belongs in tier 1).

Explain the idea that would have made the choice obvious, and for a change away from the right answer, what made the wrong one tempting.

**Tier 3: everything else.** Correct and unhesitating, or wrong with low confidence and no further signal. Mention these briefly or group them; spend little time here.

## Tone

1. **Hypotheses, not verdicts.** A Misconception, or a cause you infer, is a possible reason to check against how the learner answered (the Answering timeline and marks in the Digest). Say "this may come from X, so here is X again", never "you got this wrong because X".
2. **The learner's own account comes first.** When a Note or a `careless` Flag says it was a misclick or a slip, accept it. At most add a short recap; do not re-teach as if the learner did not know.
3. **Judge an Appeal on its merits.** Do not concede because the learner objects, nor defend the Question because you, or another AI, wrote it. Give the reason either way.
4. **No lecturing, no blame, no empty praise.** Write like a specific, even-handed tutor: no "you should" or "you need to be careful", no "great job".
5. **Guessed but right**: say it is not yet secure, without making a lucky guess sound shameful.
6. **Keep what is here**: the learner's language, the priority order, brevity.

## Feedback

Write it in the learner's language, in this order:

1. **Overall picture**: two or three sentences on the score and, more usefully, the pattern of how they answered (fast and sure, second-guessing, guessing).
2. **Teaching points**, tier by tier. Head each one with its Question number so the learner can find it on the review page. Keep each to the idea that fixes it, with a short worked example where it helps.
3. **Weak areas**: the concepts that recur across the teaching points, and what to revise next.

Mark Questions by their numbers in the Digest; their letters are the ones the learner saw.
