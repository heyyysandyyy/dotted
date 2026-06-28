# Agentic ticket workflow (Pro-subscription, zero API cost)

How the 28 dotted tickets get built, reviewed, and merged — entirely on the
Claude Pro subscription, with no Anthropic API spend.

```
/ticket EXP-002     ← local (Pro): branch + implement + build + test
/review-dotted       ← local (Pro): soft gate, run as step 8 of /ticket
   fix anything      ← local (Pro)
push + open PR
ci.yml runs tests    ← GitHub Actions compute, FREE on public repos
you squash-merge     ← human gate
```

## Why this costs nothing extra
- `/ticket` and `/review-dotted` run inside the Claude Code CLI, so they are
  covered by the Pro subscription — no per-token charges.
- `ci.yml` runs on GitHub's servers but uses zero Anthropic tokens and is free
  for public repositories. `dotted` is public.
- There is intentionally no cloud Claude (no `ANTHROPIC_API_KEY`, no GitHub App).

## The gates
- CI (`.github/workflows/ci.yml`) = hard gate. Red blocks merge.
- `/review-dotted` = soft gate. A separate, fresh-context review you run locally
  before pushing (author/reviewer separation without paying for it).
- You = the merge button. The agent never self-merges.

## Per ticket
1. `/ticket EXP-002` — branches, implements, builds, tests, runs `/review-dotted`,
   then opens a PR. It never merges.
2. CI (build + lint + test) runs automatically on the PR — free.
3. When CI is green and the review verdict is clean, you squash-merge and delete
   the branch.
4. The next `/ticket` run advances `.claude-progress` and marks CLAUDE.md.

## Every PR needs a full description
A PR is not done until its body documents the change. Required sections, in order:
**Summary**, **Changes** (a bullet for *every* change in the branch — group by
file/area, and include any cleanups or fixes that rode along; nothing in the diff
goes unmentioned), **Acceptance criteria** (checkboxes), **Test plan** (build/test
results + manual steps), **Review** (the `/review-dotted` verdict), and
`Closes #<issue>` when applicable. If `gh` isn't installed, open the PR via a
pre-filled GitHub compare URL with the title and body encoded.

No co-authoring of any kind, and no AI attribution, anywhere — not in the PR
title/body and not in any commit message. Commits and PRs are single-author:
that means no "Co-Authored-By" trailer for *anyone* (not AI, not bots, not even
the repo owner), no "Generated with Claude Code" line, and no 🤖 footer.

This also applies at squash-merge. GitHub auto-fills the merge commit with
`Co-authored-by` lines, and bot PRs (Dependabot) carry a `Signed-off-by:
dependabot[bot]` / `Co-authored-by: dependabot[bot]` signature in their commits.
Always merge with an explicit, clean commit message so none of that reaches
`main`, e.g.:

    gh pr merge <n> --squash --delete-branch --subject "<clean subject>" --body ""

## Files
- `.claude/commands/ticket.md` — `/ticket <ID>`, implement one ticket then PR
- `.claude/commands/review-dotted.md` — `/review-dotted`, the review skill
- `.claude/commands/security-scan.md` — `/security-scan`, the repeatable security pass
- `.claude/commands/preflight.md` — `/preflight`, health-check main before a new ticket
- `.claude/commands/finish-ticket.md` — `/finish-ticket`, post-merge bookkeeping
- `.claude/commands/sync-issues.md` — `/sync-issues`, reconcile issues to the checklist
- `.github/workflows/ci.yml` — build + lint + test + audit (PR and main), free
- `.github/workflows/codeql.yml` — CodeQL static analysis (JS/TS)
- `.github/dependabot.yml` — scheduled dependency update PRs
- `.github/pull_request_template.md` — enforces the PR description in the GitHub UI
- `scripts/create-issues.sh` — seed GitHub issues from CLAUDE.md (optional)
- `web/audit-ci.jsonc` — npm audit gate config (allowlist tracked in #36)
- `.claude-progress` — next ticket id to build
- `web/vitest.config.ts` — test runner config (kept separate from vite.config)

## If you later want hands-off cloud review
Automatic review on every PR needs Claude running on GitHub's servers, which
requires the Anthropic API (pay-per-token) or a Max-plan subscription token.
That is deliberately not set up here. The local `/review-dotted` step gives the
same review for free; you just run it yourself.
