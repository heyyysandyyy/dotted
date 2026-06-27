#!/usr/bin/env bash
# Create one GitHub issue per ticket from the CLAUDE.md checklist.
# Idempotent-ish: skips a ticket if an open issue with the same id prefix exists.
# Requires: gh authenticated against heyyysandyyy/dotted.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHECKLIST="$ROOT/CLAUDE.md"

# Map a ticket id prefix to an epic label.
epic_for() {
  case "$1" in
    CVS*) echo "epic:canvas" ;;
    TXT*) echo "epic:text" ;;
    IMG*) echo "epic:image" ;;
    EXP*) echo "epic:export" ;;
    SAV*) echo "epic:save" ;;
    CLR*) echo "epic:color" ;;
    TPL*) echo "epic:template" ;;
    *)    echo "epic:other" ;;
  esac
}

# Pull lines like "- [ ] EXP-002 Export as JPEG" out of the checklist.
grep -E '^- \[[ x]\] [A-Z]{3}-[0-9]{3} ' "$CHECKLIST" | while read -r line; do
  id="$(echo "$line" | sed -E 's/^- \[[ x]\] ([A-Z]{3}-[0-9]{3}) .*/\1/')"
  title="$(echo "$line" | sed -E 's/^- \[[ x]\] [A-Z]{3}-[0-9]{3} (.*)/\1/')"
  label="$(epic_for "$id")"

  if gh issue list --search "$id in:title" --state all --json title --jq '.[].title' | grep -q "$id"; then
    echo "skip  $id (issue exists)"
    continue
  fi

  gh label create "$label" --color ededed 2>/dev/null || true
  gh issue create \
    --title "$id $title" \
    --label "$label" \
    --body "Implement **$id $title**.

Acceptance criteria live in CLAUDE.md. Implement with \`/ticket $id\`.
A PR that closes this issue must satisfy every criterion and pass CI + review." \
    && echo "created $id"
done
