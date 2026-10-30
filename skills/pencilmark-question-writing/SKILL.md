---
name: pencilmark-question-writing
description: Writes revision questions as a PencilMark Question pack (JSON) for import. Use when asked to write, generate or turn study material into PencilMark questions.
metadata:
  version: "1.2.0"
---

# Writing a PencilMark Question pack

PencilMark is a revision tool. The learner pastes your reply into its import box, and it becomes a Set of Questions to sit. Afterwards the tool reports how each Question was answered (hesitation, answer changes, Confidence) so that an AI can teach from it. Your job is to write the Questions as one **Question pack**: a single JSON document in the format below.

## Steps

1. **Read the material** the learner gave you (notes, slides, a topic name) and note what they want: how many Questions, which types, which Topic.
2. **Choose Topic paths.** If a list of the learner's current Tracks and Topics is given (it may follow this text, come in the next message, or arrive as an attached file), file each Question under the existing path that fits, spelled exactly as listed. Create a new path only where nothing fits; the tool asks the learner before creating it.
3. **Write the Questions**, each one testing one idea, with every wrong Option a plausible mistake rather than filler. Where the material involves formulas or calculations, include Questions that use them.
4. **Check the pack** against the checklist at the end. Done means every point on it holds for every Question.
5. **Reply with the pack** in one ```json code block. A sentence before or after it is fine; the importer finds the block.

## The pack

```
{
  "kind": "question_pack",          always this value
  "schemaVersion": 1,               always this value
  "batch": { ... },                 where these Questions came from
  "questions": [ ... ]              at least one Question
}
```

**`batch`**

- `title` (required): a short name for the Set, such as "Cell biology: organelles".
- `model`: the name of the AI model writing the pack (yours).
- `material`: one line describing the source material, such as "Lecture 4 slides, membranes".
- `topic`: the Topic path the whole pack was generated from, if there is one.

**Each Question**

- `label` (required): a pack-local name, `"q1"`, `"q2"`… unique within the pack. The tool assigns real IDs on import, so write no other IDs.
- `type` (required): `"single_answer"` (exactly one correct Option) or `"multiple_answer"` (one or more correct Options; the learner selects all that apply).
- `stem` (required): the question, as content blocks.
- `options` (required): at least two Options.
- `answer` (required): the `id`s of the correct Options. Exactly one for `single_answer`.
- `explanation`: the explanation of the Question as a whole, shown after the answer is revealed.
- `hints`: graded Hints, a list of content-block lists, lightest first. The learner opens them one at a time while answering, so each should give a little more than the one before, and none should give the answer away outright. The tool records which Hints were opened, so give every Question two or three (one is enough for true/false), unless the learner asks for none.
- `optionOrder`: `"shuffle"` (default) or `"fixed"`. The tool shuffles Options unless told otherwise.
- `topics`: Topic paths the Question sits under; several are allowed.
- `tags`: free strings. `"true_false"` has a special meaning (below).

**Each Option**

- `id` (required): unique within its Question, such as `"opt_a"` or `"opt_mito"`. A meaningful id makes placeholders easier to read.
- `content` (required): the Option's text, as content blocks.
- `rationale`: why this particular Option is right or wrong. Write one for every Option.
- `misconception`: for a wrong Option, the typical misunderstanding it is designed to catch. Write one for every wrong Option except "All/None of the above". The Feedback offers it as a possible reason for a wrong answer, to check against how the learner answered.
- `pin`: `"first"` or `"last"` keeps the Option in that place when the others are shuffled.

No other fields are allowed; the importer rejects unknown ones.

**Content blocks.** Every human-readable field (`stem`, `content`, `rationale`, `misconception`, `explanation`, each Hint) is a list of blocks: `[{ "type": "text", "text": "..." }]`. The text is Markdown; write maths as LaTeX between `$` signs. Only `~~double tildes~~` is strikethrough; a single `~` is literal text. Prefer an en dash `–` for number ranges (`5–10`) over a tilde. Write a currency dollar as `\$` so it is not read as maths (inside the JSON string that is `\\$`). Use several blocks only for separate paragraphs.

**Topic paths.** A path is the Track and then Topics from broad to narrow, joined by `" / "`: `"BIOL101 / Genetics / Lecture 5"`. The first segment is the Track (one course in one year, or one self-study domain). Topics nest to any depth.

## Question types

- **Single answer**: `"type": "single_answer"`, one id in `answer`.
- **Multiple answer**: `"type": "multiple_answer"`, every correct id in `answer`. Say "Select all that apply" in the stem. Scoring gives partial credit and subtracts for wrong selections, so make every Option clearly right or clearly wrong.
- **True/false**: a single-answer Question with exactly two Options, `"True"` then `"False"`, `"optionOrder": "fixed"`, and `"tags": ["true_false"]`. The stem is a statement, not a question.

## Referring to Options

Option letters change when Options are shuffled, so text never names an Option by its letter. Wherever a stem, Hint, Rationale or Explanation refers to an Option, write `{{opt:<optionId>}}`; the tool replaces it with the letter that Option is shown under. For example: `"{{opt:opt_b}} confuses speed with distance."`

An Option whose meaning depends on the others ("All of the above", "None of the above") gets `"pin": "last"` so shuffling cannot move it.

## Example

A complete pack with one Question of each type. Its Topic paths are illustrative; use the learner's own.

```json
{
  "kind": "question_pack",
  "schemaVersion": 1,
  "batch": {
    "title": "Forces and energy: warm-up",
    "model": "example-model",
    "material": "Example only: introductory physics",
    "topic": "Physics 101 / Forces"
  },
  "questions": [
    {
      "label": "q1",
      "type": "single_answer",
      "stem": [{ "type": "text", "text": "A 2 kg trolley accelerates at $3\\ \\text{m/s}^2$. What is the net force on it?" }],
      "options": [
        {
          "id": "opt_6",
          "content": [{ "type": "text", "text": "6 N" }],
          "rationale": [{ "type": "text", "text": "Correct: $F = ma = 2 \\times 3 = 6$ N." }]
        },
        {
          "id": "opt_1_5",
          "content": [{ "type": "text", "text": "1.5 N" }],
          "rationale": [{ "type": "text", "text": "This divides mass by acceleration." }],
          "misconception": [{ "type": "text", "text": "Rearranging $F = ma$ the wrong way round." }]
        },
        {
          "id": "opt_5",
          "content": [{ "type": "text", "text": "5 N" }],
          "rationale": [{ "type": "text", "text": "This adds mass and acceleration." }],
          "misconception": [{ "type": "text", "text": "Combining the two quantities without a formula." }]
        },
        {
          "id": "opt_none",
          "content": [{ "type": "text", "text": "None of the above" }],
          "rationale": [{ "type": "text", "text": "{{opt:opt_6}} is the net force." }],
          "pin": "last"
        }
      ],
      "answer": ["opt_6"],
      "explanation": [{ "type": "text", "text": "Newton's second law: net force equals mass times acceleration, so $2 \\times 3 = 6$ N." }],
      "hints": [
        [{ "type": "text", "text": "Which of Newton's laws links force and acceleration?" }],
        [{ "type": "text", "text": "Net force is mass times acceleration." }]
      ],
      "topics": ["Physics 101 / Forces / Newton's laws"]
    },
    {
      "label": "q2",
      "type": "multiple_answer",
      "stem": [{ "type": "text", "text": "Which of these are units of energy? Select all that apply." }],
      "options": [
        { "id": "opt_joule", "content": [{ "type": "text", "text": "Joule" }], "rationale": [{ "type": "text", "text": "Correct: the SI unit of energy." }] },
        { "id": "opt_kwh", "content": [{ "type": "text", "text": "Kilowatt-hour" }], "rationale": [{ "type": "text", "text": "Correct: 1 kWh is 3.6 million joules." }] },
        {
          "id": "opt_watt",
          "content": [{ "type": "text", "text": "Watt" }],
          "rationale": [{ "type": "text", "text": "A watt is a unit of power: energy per second." }],
          "misconception": [{ "type": "text", "text": "Confusing power with energy, helped by the \"watt\" inside \"kilowatt-hour\"." }]
        },
        {
          "id": "opt_newton",
          "content": [{ "type": "text", "text": "Newton" }],
          "rationale": [{ "type": "text", "text": "A newton is a unit of force." }],
          "misconception": [{ "type": "text", "text": "Treating force and energy as the same thing." }]
        }
      ],
      "answer": ["opt_joule", "opt_kwh"],
      "explanation": [{ "type": "text", "text": "Energy is measured in joules or kilowatt-hours; {{opt:opt_watt}} measures power and {{opt:opt_newton}} measures force." }],
      "hints": [
        [{ "type": "text", "text": "Check each unit: is it an amount of energy, a rate, or something else entirely?" }],
        [{ "type": "text", "text": "Energy is power multiplied by time." }]
      ],
      "topics": ["Physics 101 / Energy"]
    },
    {
      "label": "q3",
      "type": "single_answer",
      "stem": [{ "type": "text", "text": "An object moving at constant velocity has zero net force acting on it." }],
      "options": [
        { "id": "opt_true", "content": [{ "type": "text", "text": "True" }], "rationale": [{ "type": "text", "text": "Correct: constant velocity means zero acceleration, so zero net force." }] },
        {
          "id": "opt_false",
          "content": [{ "type": "text", "text": "False" }],
          "rationale": [{ "type": "text", "text": "Forces may act, but they balance." }],
          "misconception": [{ "type": "text", "text": "Believing that motion needs a force to keep it going." }]
        }
      ],
      "optionOrder": "fixed",
      "answer": ["opt_true"],
      "explanation": [{ "type": "text", "text": "Newton's first law: with no net force, velocity stays constant." }],
      "hints": [[{ "type": "text", "text": "What does constant velocity say about acceleration?" }]],
      "topics": ["Physics 101 / Forces / Newton's laws"],
      "tags": ["true_false"]
    }
  ]
}
```

In JSON strings a LaTeX backslash is written twice (`\\times`).

## Checklist

- `kind` is `"question_pack"` and `schemaVersion` is `1`.
- Every `label` is unique in the pack; every Option `id` is unique in its Question.
- Every id in `answer` names an Option of that Question; `single_answer` has exactly one.
- Every true/false Question is `single_answer` with two Options, `"optionOrder": "fixed"` and the tag `"true_false"`.
- No text names an Option by its letter; each reference is `{{opt:<optionId>}}`.
- "All/None of the above" Options carry `"pin": "last"`.
- Every Question has Hints (two or three; one for true/false), unless the learner asked for none; they go from lightest to strongest and none states the answer.
- Every Option has a Rationale; every wrong Option has a Misconception, except "All/None of the above".
- Every Topic path uses `" / "` between segments, and reuses the learner's existing paths where they fit.
- The pack is valid JSON: double quotes, no trailing commas, no comments.
