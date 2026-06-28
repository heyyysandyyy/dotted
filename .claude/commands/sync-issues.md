---
description: Sync the CLAUDE.md ticket checklist to GitHub issues (create + reconcile state)
allowed-tools: Bash, Read
---

Make the GitHub issues match the `CLAUDE.md` ticket checklist. Requires `gh`
authenticated against the repo.

**Issues are the source of truth for ticket detail.** `CLAUDE.md` stays a lean
checklist (ticket id + one-line title + done-state) — it must not get bloated
with descriptions. Each issue carries the full spec: a short description and the
ticket's acceptance criteria. Never leave an issue body as a pointer back to
`CLAUDE.md`.

1. Create any missing issues: `bash scripts/create-issues.sh` (idempotent —
   skips tickets that already have an issue; labels by epic). The script seeds a
   self-contained template body (description + acceptance-criteria checklist).
2. Fill in each newly-created issue's body: replace the template placeholders
   with a real 1–2 line description and the concrete acceptance criteria for that
   ticket (`gh issue edit <n> --body-file <file>`). Author criteria from the
   ticket's intent/spec — do not defer them to `CLAUDE.md`.
3. Reconcile state to the checklist:
   - For each ticket marked `[x]` in `CLAUDE.md`, close its issue (if open) with
     a comment "Completed and merged to main." Prefer linking the implementing PR
     ("Implemented in #<pr>") in the issue body so the record is self-contained.
   - For each ticket marked `[ ]`, leave its issue open.
4. Print a summary: counts of open vs closed, and the open (pending) list.

Note for the loop: iterate ticket ids as **literal words** in the `for` loop —
`for id in CVS-001 CVS-002 ...` — because the shell here is zsh, which does not
word-split an unquoted `$VAR`.

Find an issue number by id:
`gh issue list --search "<ID> in:title" --state open --json number,title --jq '.[]|select(.title|startswith("<ID>"))|.number'`
