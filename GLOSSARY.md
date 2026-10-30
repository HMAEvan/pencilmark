# PencilMark

A revision tool that records how each question was answered (hesitation, answer changes, eliminations, hints, confidence, marks), so that AI grading can focus its explanation on where the reasoning actually wavered, not just on what was wrong.

## Content

**Question** (题目):
A single question in the question bank. Belongs to no Set; it is referenced by Sets.
_Avoid_: Item, problem

**Question revision** (题目版本):
A version of a Question. Changing what is shown while answering, or how it is graded, creates a new revision; earlier revisions are kept.
_Avoid_: Edit, copy

**Option** (选项):
One choice in a choice-type Question, with an identity independent of the letter it is displayed under.
_Avoid_: Answer, choice letter

**Item** (子项):
A part of a Question that can be answered or marked on its own: an Option for choice questions; later a blank, a matching pair, or an element to order.
_Avoid_: Sub-question, part

**Case** (共享材料):
Material shared by several Questions (a clinical vignette, a passage, a figure, an EMQ option list), together with which Questions use it.
_Avoid_: Question group, 题组, stimulus

**Hint** (提示):
A graded clue written when the Question is authored; level 0 is the lightest.
_Avoid_: Help, clue

**Rationale** (选项解析):
Why one particular Option is right or wrong.
_Avoid_: Explanation (that is the whole-Question explanation)

**Explanation** (总解析):
The explanation of the Question as a whole, shown after the answer is revealed.
_Avoid_: Rationale, solution

**Misconception** (误解):
The typical misunderstanding a wrong Option is designed to catch.
_Avoid_: Distractor reason, trap

## Organisation

**Track** (学习线):
One school course in one academic year, or one self-study domain.
_Avoid_: Course (a course in another year is a different Track), subject, folder

**Topic** (主题):
A node in a Track's tree of categories, nested to any depth: a broad area, a lecture, a single concept. A Question may sit under several Topics.
_Avoid_: Folder, chapter, tag

**Batch** (出题批次):
The Questions produced by one round of question generation, kept for provenance: from what material, which attempt at it, by which model.
_Avoid_: Import, pack

**Set** (练习单):
An ordered list of Entries to sit through. Drawn from any Batches and Topics.
_Avoid_: Quiz, question set, 题组

**Entry** (条目):
One member of a Set: a single Question or a whole Case. Shuffling a Set moves whole Entries.
_Avoid_: Item

**Starred** (已收藏):
A Set or a Question the user has marked to keep at hand. Starring a Question is not a Flag: a Flag belongs to one Attempt, a star to the Question across all its Sessions.
_Avoid_: Favourite, bookmark, pinned

**Star history** (收藏记录):
Every starring and unstarring of a Question, with when and where it happened (a Phase of a Session, or outside any Session). Never edited; whether a Question is Starred is its latest entry. Starring inside a Session is in that Session's Raw log as well.
_Avoid_: Favourite log, star log

## Answering

**Session** (一轮):
One complete sitting of a Set, from start to submission and beyond. Has a status and a Mode.
_Avoid_: Attempt, run, round

**Session number** (轮次编号):
A Session's place among its Set's Sessions, counted by when they started. Abandoned Sessions keep their number, so numbers never change.
_Avoid_: Attempt number, round number

**Abandon** (放弃):
To end an in-progress Session without submitting it. Its Raw log is kept; the Set's next sitting is a new Session.
_Avoid_: Discard, exit without saving, delete

**Exam mode** (考试模式):
Answers can be changed freely until the whole Session is submitted; answers are revealed together afterwards.
_Avoid_: Test mode

**Practice mode** (练习模式):
Each Question's answer is revealed as soon as that Question is answered.
_Avoid_: Study mode

**Attempt** (作答):
The answering of one Question within one Session, including everything recorded about how it was answered.
_Avoid_: Answer, response, submission

**Phase** (阶段):
The stage an action belongs to: **answering** (before the answer is revealed), **reviewing** (after the answer is revealed, in the same Session), **revisit** (any later reopening).
_Avoid_: Stage, step

**Visit** (访问):
One stretch from opening a Question to leaving it. Stretches too short to count as looking at the Question are not Visits.
_Avoid_: View, focus

**Confidence** (信心度):
How sure the user was of an Attempt: sure, probably, or guessed. Optional.
_Avoid_: Certainty, uncertain flag, guessed flag

**Flag** (标记):
A Question-level mark recording a reason or a follow-up: concept confusion, careless, focus, memory, bad question.
_Avoid_: Tag, label, bookmark

**Item flag** (子项标记):
A mark on a single Item: eliminated, eliminated but unsure, sure right, unknown term.
_Avoid_: Option flag, strike-through

**Note** (备注):
Free text the user attaches to an Attempt.
_Avoid_: Comment

**Appeal** (申诉):
The user's "I think the answer is wrong" on a Question, with a required reason. Adds the bad-question Flag and keeps the reason, with its Phase and time. In code: `appeal` event, `Appeal`, `AppealForm`.
_Avoid_: Complaint, dispute, report

**Raw log** (原始记录):
The untouched, time-ordered record of everything the user did during a Session. Never edited; everything else about the Session is derived from it.
_Avoid_: Event history, trace

**Override** (手动修正):
A user's correction to a derived value (a time, a grading result). Recorded beside the derived value; never changes the Raw log.
_Avoid_: Edit, fix

**Derived time** (记录用时):
A Question's answering time as Derivation computes it from the Raw log, shown in grey beside an Overridden time. Not the raw time (`answeringRawMs`), which still counts idle time.
_Avoid_: Raw time, original time, 原始用时

**Overridden time** (修正用时):
A Question's answering time as the user corrected it with an Override, shown in the normal colour. A time overridden while answering fixes the time up to that moment; answering time derived afterwards is added on top (`answeringActiveMsAtOverride`).
_Avoid_: Actual time, real time, 实际用时

## Grading

**Digest** (批改摘要):
The compact report of a Session generated when it ends, for an AI to grade from.
_Avoid_: Summary, transcript

**Feedback** (讲解):
An AI's grading of a Session, given in the chat: the overall picture, prioritised teaching points tied to Questions, and weak areas.
_Avoid_: Review, grading, comments

## Exchange files

**Question pack** (题目包):
A file carrying Questions, with answers, Hints, Explanations, Rationales and Misconceptions, and their Topic paths. Carries no answering data.
_Avoid_: Question bank, quiz file

**Similar Question** (相似题目):
A Question in a Question pack that is not an exact duplicate but is at or above the similarity threshold to an existing Question of the same Question type and Option count, or that matches an existing Question in everything but its Hints, whatever its similarity. Shown side by side with it before import; the user skips it (the existing Question joins the new Set instead), makes it the existing Question's next Question revision, or creates it as new. In code: status `"similar"`, `SimilarChoice`.
_Avoid_: Near-duplicate

**Answer pack** (答卷包):
A file carrying one Session for grading or re-import.
_Avoid_: Results file

**Backup** (完整备份):
A file carrying everything needed to restore the tool exactly as it was.
_Avoid_: Export, dump

## Where data lives

**Local mode** (本地模式):
A copy of PencilMark opened outside claude.ai (GitHub Pages, a saved file), keeping its data in that browser's IndexedDB. In code: `StorageMode` `"local"`.
_Avoid_: Offline mode, browser mode

**Artifact mode** (Artifact 模式):
A copy of PencilMark published as a claude.ai Artifact, keeping its data in the Artifact's database under the viewer's private path. When the database is unavailable inside claude.ai, the copy says so and falls back to that browser's IndexedDB (`"artifactUnavailable"`).
_Avoid_: Cloud mode, online mode

## Provisional

Working names introduced while building issue #5, not yet agreed with /domain-modeling.

**Question type** (题型):
The kind of Question, deciding how it is answered and graded: single-answer or multiple-answer. True/false is a single-answer Question with two fixed Options and the tag `true_false`. Any other type is shown read-only as short-answer, cannot be answered, and is not graded.
_Status_: provisional, not yet agreed

**Partial score** (部分得分):
A graded Attempt's score from 0 to 1. Multiple-answer: max(0, (c − w) / k). Single-answer: 0 or 1. Stored beside `correct`; the display preference picks which is shown.
_Status_: provisional, not yet agreed

**Pin** (固定位置):
An Option's mark to stay first or last, in authored order, when Options are shuffled.
_Status_: provisional, not yet agreed

Working name introduced while building issue #7, not yet agreed with /domain-modeling.

**Mark** (标记类记录):
Anything the user records about an Attempt beyond the answer itself: Confidence, Flags, Item flags and the Note. Used in code for the group (`QuestionMarks`, `walkMarks`, `recordReviewMark`).
_Status_: provisional, not yet agreed

Working names introduced while building issue #9, not yet agreed with /domain-modeling.

**Skill** (技能说明):
A self-contained instruction file pasted into any AI chat (and usable as a Claude skill): the question-writing Skill, the single source of the Question pack format, and the grading Skill, which teaches from a Digest. The copy texts are a Skill followed by the user's Topic paths or a Digest.
_Status_: provisional, not yet agreed

**Schema document** (结构说明文档):
The `meta/schema` document in the database: the schema version, the Flag type table, timing defaults and conventions for AI readers.
_Status_: provisional, not yet agreed

**Flag type** (标记类型):
One kind of Flag as the Schema document lists it: id, English name, colour, and level (`question` for Flags, `item` for Item flags). A retired Flag type is marked deprecated, never removed. In code: `FlagType`, `FLAG_TYPE`, `ITEM_FLAG_TYPE`, `FLAG_TYPES`.
_Status_: provisional, not yet agreed

Working name introduced while scoping the demo experience, not yet agreed with /domain-modeling.

**Showcase** (演示样例):
A ready-made example bundled with the tool: a Question pack, a scripted Session sat on it, the Digest that Session produces, and an AI's Feedback on that Digest. Opening it replays the script in memory and shows the review page; nothing is written to the user's data.
_Status_: provisional, not yet agreed

**Showcase script** (演示脚本):
The part of a Showcase that stands in for a learner: the actions of one Session, each with its time from the start, written against the Question pack's labels. Replaying it through the Recorder produces the Showcase's Raw log.
_Status_: provisional, not yet agreed

**Answering timeline** (作答时间线):
Everything done on one Question during the answering Phase, in time order: its Visits, each selection and deselection, Item flags, Hints opened, Confidence and Flags. Extends what code calls the trajectory (the first choice and each answer change).
_Status_: provisional, not yet agreed
