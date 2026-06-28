---
description: Pre-ticket health check of main before starting a new branch
allowed-tools: Bash, Read, Grep, Glob
---

Before starting a new ticket branch, do a quick health check of `main` so quality
holds across the whole run. Verify findings against the code before reporting —
don't rubber-stamp, and don't overstate.

1. `git checkout main && git pull`.
2. Review the core editor for cleanliness, simplicity, and maintainability —
   especially `store/useCanvasStore.ts`, `store/useHistoryStore.ts`,
   `components/CanvasStage.tsx`, and any files the last ticket touched. Look for
   complexity, duplication, dead code, and over-engineering.
3. Confirm the architecture rules still hold: canvas mutations go through the
   store, history snapshots fire, no direct fabric mutation in components, no
   network calls, localStorage-only.
4. Quick green check: `cd web && npm run build && npm test -- --run`.
5. Report concrete, ranked findings (or "clean"). Offer to fix trivial items
   (e.g. dead code) before branching; leave larger ones as tracked tickets.

Then proceed to `/ticket <next-id>`.
