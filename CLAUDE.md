# PencilMark

Domain language: `GLOSSARY.md`. Decisions: `docs/adr/`. Read both before touching an area, and use glossary terms in code, tests, issues and commits.

## Rules

- Every commit references its issue; the commit that finishes a ticket says `Fixes #N` and lands on main.
- Commit before running code review: review compares against HEAD and cannot see uncommitted changes.
- Test only at the three agreed seams (Derivation, Importer, Recorder), test-first. The UI has no automated tests.
- No interface text in components: every string is a translation key.
- Hashing is used only for the Raw log hash chain. Use a hash elsewhere only where not using it would add a great deal of complexity.
- Sealed Raw log chunks are never written again by any code path.
- Persistent names (IndexedDB, localStorage) are prefixed `pencilmark`.
