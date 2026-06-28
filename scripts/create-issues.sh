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
  # The issue is the source of truth for the ticket's detail, so create it with a
  # self-contained template (description + acceptance criteria) — never a pointer
  # back to CLAUDE.md (which stays a lean checklist). Fill in the specifics after
  # creation (see the /sync-issues skill).
  gh issue create \
    --title "$id $title" \
    --label "$label" \
    --body "## $id $title

_Describe what this ticket delivers (1–2 lines)._

### Acceptance criteria
- [ ] _…_

<!-- Replace the description and acceptance criteria above with the real spec.
     Do NOT point back to CLAUDE.md; this issue holds the detail. Implement with
     \`/ticket $id\`; the closing PR must satisfy every criterion + pass CI/review. -->" \
    && echo "created $id"
done
