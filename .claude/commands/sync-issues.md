---
description: Sync the CLAUDE.md ticket checklist to GitHub issues (create + reconcile state)
allowed-tools: Bash, Read
---

Make the GitHub issues match the `CLAUDE.md` ticket checklist. Requires `gh`
authenticated against the repo.

1. Create any missing issues: `bash scripts/create-issues.sh` (idempotent —
   skips tickets that already have an issue; labels by epic).
2. Reconcile state to the checklist:
   - For each ticket marked `[x]` in `CLAUDE.md`, close its issue (if open) with
     a comment "Completed and merged to main."
   - For each ticket marked `[ ]`, leave its issue open.
3. Print a summary: counts of open vs closed, and the open (pending) list.

Note for the loop: iterate ticket ids as **literal words** in the `for` loop —
`for id in CVS-001 CVS-002 ...` — because the shell here is zsh, which does not
word-split an unquoted `$VAR`.

Find an issue number by id:
`gh issue list --search "<ID> in:title" --state open --json number,title --jq '.[]|select(.title|startswith("<ID>"))|.number'`
