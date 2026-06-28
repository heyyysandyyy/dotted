---
description: Run the standard dotted security scan on the working tree / staged diff
allowed-tools: Bash, Read, Grep
---

Run the project's repeatable security pass and report findings. Do this before
every commit and after finishing a ticket.

1. **Secrets** — scan the staged diff and any new/untracked files for token
   patterns: `ghp_`, `github_pat_`, `gho_`, `sk-ant-`, `AKIA[0-9A-Z]{16}`,
   `-----BEGIN .*PRIVATE KEY`, and hardcoded `api_key`/`password = "..."`.
2. **Network calls** — grep the diff for `fetch(`, `axios`, `XMLHttpRequest`,
   `https?://` in app code. dotted is localStorage-only; there must be none
   beyond the Google Fonts CSS embed.
3. **Upload safety** — any new file/image handling must keep the
   `file.type.startsWith('image/')` guard.
4. **Injection** — flag `dangerouslySetInnerHTML`, `eval(`, `innerHTML =` with
   untrusted data.
5. **Committed secrets at rest** — confirm `master.key`, `.env*`, and any token
   file stay untracked and gitignored.
6. **Dependencies** — `cd web && npm run audit` and (for api changes)
   `cd api && bundle exec bundler-audit check`.

Report each section as clean or with file:line evidence. Do not commit if a real
secret or unguarded network/injection sink is found.
