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

## Agent skills

### Issue tracker

Issues live in GitHub Issues for HMAEvan/pencilmark, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels, each named after its role (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
