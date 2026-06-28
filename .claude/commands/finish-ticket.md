---
description: Post-merge bookkeeping after a ticket PR lands on main
argument-hint: <TICKET-ID>
allowed-tools: Bash, Read, Edit
---

Run after ticket **$1**'s PR has merged to `main`. Branch protection blocks
direct pushes to `main`, so bookkeeping rides inside a PR — never pushed straight
to `main`.

1. `git checkout main && git pull` to get the merged state.
2. Confirm the linked issue auto-closed (the PR body had `Closes #<n>`). If not,
   close it: `gh issue close <n> -c "Completed and merged to main."`
3. The checklist mark and progress bump should already be on `main` if they rode
   in the ticket PR (preferred). If they did **not**:
   - Start the next ticket's branch and include, as its first commit, marking
     `[x] $1` in `CLAUDE.md` and setting `.claude-progress` to the next id.
   - Do not open a separate bookkeeping PR just for this; fold it into the next
     ticket's PR so `main` only ever moves via PRs.
4. Report: ticket $1 closed, next ticket id, and confirm `main` CI is green.
