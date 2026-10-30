# PencilMark schema documentation

What PencilMark reads and writes: the exchange files, and the documents in its database. Domain terms are defined in [`GLOSSARY.md`](../GLOSSARY.md).

## Exchange files

Every file carries `kind` and `schemaVersion`.

| Kind | Schema | What it carries |
|---|---|---|
| `question_pack` | [`question-pack.schema.json`](question-pack.schema.json) | Questions written by an AI, with answers, Explanations, Rationales, Misconceptions and Topic paths. Pack-local labels only; the tool assigns real IDs on import. No answering data. |
| `answer_pack` | [`answer-pack.schema.json`](answer-pack.schema.json) | One Session for grading or re-import: the Session, its Set, the Question revisions it was sat against, the derivation in use with its Attempts, the Overrides, the Digest, and optionally the sealed Raw log. |
| `backup` | not yet ([#13](https://github.com/HMAEvan/pencilmark/issues/13)) | Everything needed to restore the tool exactly. |

The JSON Schemas are the machine standard: the importer validates against them. The human and AI guide to writing a Question pack is the question-writing Skill, [`skills/pencilmark-question-writing/SKILL.md`](../skills/pencilmark-question-writing/SKILL.md); its example pack is checked against the schema by the tests, so the two cannot drift apart. The sample packs in [`samples/`](../samples/) are checked the same way.

The importer also checks what a JSON Schema cannot express: labels unique in the pack, Option ids unique in their Question, every `answer` id naming an Option, exactly one answer for `single_answer`, and the true/false convention (single-answer, two Options, `optionOrder: "fixed"`, the tag `true_false`). It warns, without refusing the pack, when text names an Option by its letter instead of `{{opt:<optionId>}}`, and when an unpinned Option refers to the others ("All of the above").

## Database

Documents are grouped into collections and addressed by `id`. Where they live depends on the copy:

- **Local mode** (GitHub Pages, or any copy outside claude.ai): the browser's IndexedDB, in a database named `pencilmark`.
- **Artifact mode** (published as a claude.ai Artifact): the Artifact's database, under the viewer's private subtree, one document per PencilMark document at `data/users/<viewer id>/pencilmark/<collection>/<id>`. Nobody else can read it, the Artifact's owner included. A document there is at most 256 KiB, and an Artifact's database holds at most 25,000 documents.

Conventions for every document:

- `source` is `"user"` or `"ai"`; `model` names the AI model for AI writes; `updatedAt` is when it was last written. These are kept by convention and are not proof of who wrote a document ([ADR-0007](../docs/adr/0007-provenance-by-convention.md)).
- IDs are a type prefix, a date and random characters, assigned by the tool, meaningless and permanent ([ADR-0003](../docs/adr/0003-meaningless-tool-assigned-ids.md)). Prefixes: `q_` Question, `s_` Set, `b_` Batch, `tr_` Track, `tp_` Topic, `ss_` Session, `dv_` derivation. Documents owned by a Session use composite IDs: Raw log chunk `{sessionId}_{n}`, Attempt `{derivationId}_{questionId}`, Override `{sessionId}_{questionId}`.
- Times are milliseconds; wall-clock times are UTC epoch milliseconds.

| Collection | Holds |
|---|---|
| `meta` | `schema`: the schema document, below. `preferences`: the preferences the user has changed, as `rules` and `display` (for example `display.language`: `"zh"`, `"en"` or `"browser"`); anything absent is the default. |
| `tracks` | Tracks: `kind` (`course` or `domain`), `title`, and course details where known. |
| `topics` | Topics: `trackId`, `parentId` (absent at the top level), `title`, `order`. |
| `batches` | Batches: `title`, `material`, the source Topic and which attempt at it this was. |
| `questions` | Questions: type, stem, Options (with Rationale, Misconception, pin), `optionOrder`, answer, Explanation, Topics and Tracks, tags, `deprecated`. |
| `sets` | Sets: `title`, ordered `entries`, `archived`. |
| `sessions` | Sessions: Set, Mode, status, displayed Question and Option orders, the settings snapshot, `currentDerivationId`. |
| `rawLogBuffers` | The Raw log chunk still being recorded, one per Session, overwritten every few seconds. |
| `rawLogChunks` | Sealed Raw log chunks, hash-chained. **Never written again by anyone** ([ADR-0001](../docs/adr/0001-raw-log-append-only.md)). |
| `derivations` | Each computation from the Raw log: algorithm version, parameters, chunks read, the Digest. Never overwritten ([ADR-0002](../docs/adr/0002-derived-data-kept-per-derivation.md)). |
| `attempts` | The Attempts of one derivation. |
| `overrides` | The user's corrections to derived values, per Session and Question. |

### `meta/schema`

Written by the tool on start, for an AI reading the database:

- `schemaVersion`: the version of the document shapes above.
- `flagTypes`: the Flag type table. Each entry has `id`, `name`, `colour` and `level` (`"question"` for Flags, `"item"` for Item flags). A retired type gets `deprecated: true` and is never removed.
- `timingDefaults`: `idleThresholdMs` (no interaction for longer than this is excluded from answering time) and `flickThresholdMs` (a Visit shorter than this is not counted).
- `conventions`: the rules above, in sentences for an AI reader.
