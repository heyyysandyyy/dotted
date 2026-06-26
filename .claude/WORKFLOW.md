# Agentic ticket workflow

How the 28 dotted tickets get built, reviewed, and merged.

```
ticket prompt ──▶ /ticket cmd ──▶ branch + PR
                                     │
                  ┌──────────────────┤
                  ▼                  ▼
        claude-review.yml      ci.yml  (build + lint + test)
         (review skill)              │
                  │                  │
            @claude fixes ───────────┘
                  │
              squash-merge ──▶ ci.yml on push:main
```

## One-time setup
1. Install the **Claude GitHub App** on `heyyysandyyy/dotted`.
2. Add repo secret **`ANTHROPIC_API_KEY`** (Settings → Secrets → Actions).
   Never commit it — the workflows read it from `${{ secrets.ANTHROPIC_API_KEY }}`.
3. Branch protection on `main`: require the CI **web** check to pass.
4. (Optional) `bash scripts/create-issues.sh` to open one issue per ticket.

## The two gates
- **CI** (`.github/workflows/ci.yml`) = hard gate. Red blocks merge.
- **Claude review** (`.github/workflows/claude-review.yml`) = soft gate. Advisory.
- **You** = the merge button. Self-merge by the agent is intentionally not wired.

## Per ticket
1. `/ticket EXP-002` — branches, implements, builds, tests, opens a PR. Never merges.
2. CI + Claude review run automatically on the PR.
3. If review requests changes: comment `@claude address the review` →
   `claude-mention.yml` pushes fixes → CI + review re-run.
4. When green, **you** squash-merge and delete the branch.
5. CI re-runs on `main`; `/ticket`'s next run advances `.claude-progress`.

## Files
| Path | Purpose |
|---|---|
| `.claude/commands/ticket.md` | `/ticket <ID>` — implement one ticket → PR |
| `.claude/commands/review-dotted.md` | `/review-dotted` — project review skill |
| `.github/workflows/ci.yml` | build + lint + test (PR and main) |
| `.github/workflows/claude-review.yml` | auto-review each PR |
| `.github/workflows/claude-mention.yml` | `@claude` pushes fixes to a PR |
| `scripts/create-issues.sh` | seed GitHub issues from CLAUDE.md |
| `.claude-progress` | next ticket id to build |
| `web/vitest.config.ts` | test runner config (separate from vite.config) |
