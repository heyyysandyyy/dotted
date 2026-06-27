---
description: Implement one dotted ticket end-to-end and open a PR
argument-hint: <TICKET-ID>  (e.g. EXP-002)
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

You are implementing exactly one ticket — **$1** — for the "dotted" Canva-style
design editor. Work through it fully before stopping. Do not combine, skip, or
reorder tickets.

## Project rules (must hold for every change)
- All canvas mutations route through Zustand `useCanvasStore`. Never mutate the
  Fabric canvas directly inside a React component.
- Every canvas change pushes a history snapshot (debounced 300ms) via the
  history store.
- Transparent PNG export sets `canvas.backgroundColor = ""` (empty string), then
  restores it.
- Google Fonts via the free CSS embed API, no key, lazy-loaded on demand.
- All design data lives in localStorage. No backend/network calls.
- TypeScript strict: `import type` for types, no enums (use const objects /
  unions), no unused locals/params.
- Commit messages: `feat: $1 <title>`. **No `Co-Authored-By` trailer.**

## Steps
1. Read the acceptance criteria for **$1** from `CLAUDE.md`.
2. Sync and branch:
   `git checkout main && git pull`
   `git checkout -b feat/$1-<short-kebab-description>`
3. Implement **only $1**.
4. `cd web && npm run build` — fix every type/build error.
5. `cd web && npm test -- --run --passWithNoTests` — fix failures.
6. Re-read the acceptance criteria and self-check each one. Do a quick security
   pass (no network calls, file-type guards on uploads, no secrets committed).
7. Stage and commit: `git commit -m "feat: $1 <title>"` (no co-author trailer).
8. Run the review locally before pushing: invoke `/review-dotted` on this
   commit's diff. This is the soft gate (it runs on the Pro subscription, no
   API cost). Address anything it flags, then re-commit.
9. Push the branch: `git push -u origin feat/$1-<short-kebab-description>`.
10. Open a PR (via `gh pr create`, or — if `gh` is unavailable — a pre-filled
    GitHub compare URL with the title and body encoded). Every PR MUST have a
    full written description with these sections, in order:
    - **Summary** — one or two lines on what the ticket delivers.
    - **Changes** — a bulleted list of *every* change in the branch, grouped by
      file or area, covering all commits including any cleanups or unrelated
      fixes that rode along. Nothing in the diff should be unmentioned.
    - **Acceptance criteria** — each criterion as a `- [x]` checkbox.
    - **Test plan** — build/test results plus the manual steps to verify.
    - **Review** — paste the `/review-dotted` verdict.
    - `Closes #<issue-number>` if a matching issue exists.
11. Print the PR URL. Do not merge — a human merges after CI passes.

## After a merge (next run)
When invoked again, before starting the next ticket:
- `git checkout main && git pull`
- Mark the just-merged ticket `[x]` in `CLAUDE.md`.
- Update `.claude-progress` with the next ticket id.
- Commit and push those bookkeeping changes to main (or include in the next PR).
