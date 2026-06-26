---
description: Review a dotted PR against acceptance criteria, architecture rules, and security
allowed-tools: Bash, Read, Grep, Glob
---

You are reviewing a pull request for the "dotted" design editor. You did **not**
write this code — review it critically and independently. Your job is the soft
gate: judgment and project-fit. CI is the hard gate for build/tests.

## 1. Acceptance criteria
- Identify the ticket id from the branch name / PR title (e.g. `feat/EXP-002-...`).
- Read that ticket's acceptance criteria in `CLAUDE.md`.
- For each criterion, state PASS / FAIL / UNSURE with the file:line evidence.

## 2. Architecture rules (flag any violation)
- Direct Fabric canvas mutation inside a React component (must go through
  `useCanvasStore`).
- A canvas change that does not push a history snapshot (debounced 300ms).
- New enums or `import` of a type without `import type` (strict TS).
- Unused locals/params; `any` where a real type exists.
- Export path that doesn't set `canvas.backgroundColor = ""` then restore it.

## 3. Security pass
- Any network/backend call (this app is localStorage-only — there must be none).
- Image upload without a `file.type.startsWith('image/')` guard.
- Secrets, tokens, or credentials committed.
- `dangerouslySetInnerHTML` / unsanitized HTML injection.
- `crypto.randomUUID` / id assignment preserved on restore.

## 4. Output
- Post concise inline comments on the specific lines.
- End with a summary block:
  - **Criteria:** X/Y passing (list any failing)
  - **Architecture:** issues or "clean"
  - **Security:** issues or "clean"
  - **Verdict:** `APPROVE` or `REQUEST_CHANGES` (one line why)

Be specific and terse. No praise padding. If everything passes, say so plainly.
