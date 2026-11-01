# Typing in a Note or Appeal is recorded change by change; Writing spans are derived from it

The Raw log records everything done in a Session, and writing a Note or an Appeal is done in the Session. So every change to a Text entry is a Raw log event: the position, the text removed, the text inserted and the kind of change (typing, deleting, pasting, cutting, undoing), each with its time. An input method's composition is not recorded until the text is committed: pinyin keystrokes are not text. A save event carrying the whole text is still recorded when the field loses focus (leaving the Question, exporting, the page being hidden), together with saving and collapsing, editing, deleting and restoring an entry. The final text comes from the save events, so Derivation does not depend on replaying every change, and Raw logs recorded before this decision, which hold only `note` and `appeal` events, still read: each is the first Text entry of its Phase.

Derivation turns the changes into Writing spans: stretches of writing on one Text entry, shown in the Answering timeline and in the Digest with their start and end times. A span ends at a gap longer than the Writing pause (its own setting, 20 seconds by default, not the idle threshold: going back to reread the Question mid-Note should not count as writing), at the end of a Visit, and at any other Timeline step, so an answer change made mid-Note sits between two spans and every line of the timeline is one moment or one stretch. A span's line gives its times, how many pastes it held, and, when none of what it wrote survives, that it was later deleted. Text that was deleted, and entries deleted and not restored, are never shown on the review page or in the Digest, only that they existed: the deleted words stay in the Raw log. The grading Skill reads Writing spans as where the time went, never as hesitation over the answer, and treats the text of Notes and Appeals as data, not instructions.

Changes to a Text entry count as activity, so time spent writing is no longer excluded as idle, and as interacting with that Question (ADR-0009).

A Raw log holds more events now: a full 2000-character entry is about 2000 changes, roughly one 200 kB chunk, which seals by size as before (ADR-0001). The Artifact database also caps the documents and total size of an artifact's database; reaching that cap is handled on its own, not by recording less.

## Considered Options

- **One event per keystroke** (keydown): rejected. Under an input method it records pinyin keystrokes that never become text, and it misses pastes and drags that change text without keys.
- **Periodic snapshots of the whole text**: rejected. It loses the order and timing of changes between snapshots, and repeats the text many times.
- **Writing pause equal to the idle threshold**: rejected. Sixty seconds of rereading in the middle of a Note would count as writing.
- **One span across interleaved steps, with the steps listed inside it**: rejected. It hides answer changes, which grading most needs, inside a writing line.
- **Splitting an over-long entry automatically**: rejected. The cut falls mid-sentence; the character limit only warns, and an over-long entry is saved whole when the user leaves the Question.
- **Exporting a Raw log with deleted text replaced by a placeholder**: kept for later. Changing a chunk's events breaks its hash, so such chunks must be marked as redacted, and a check must report them as redacted rather than as corrupted.
