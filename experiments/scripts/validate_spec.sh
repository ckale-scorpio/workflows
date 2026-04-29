#!/usr/bin/env bash
# validate_spec.sh — Check that an experiment spec file has the required structure.
#
# Usage:
#   ./experiments/scripts/validate_spec.sh experiments/2026-04-28-my-experiment.md
#
# Exit codes:
#   0 — valid (warnings are OK)
#   1 — one or more errors found

FILE="$1"

if [ -z "$FILE" ]; then
  echo "Usage: $0 <experiment-spec.md>"
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "ERROR: File not found: $FILE"
  exit 1
fi

ERRORS=0
WARNINGS=0

err()  { echo "  ✗ ERROR: $1"; ERRORS=$((ERRORS+1)); }
warn() { echo "  ⚠ WARN:  $1"; WARNINGS=$((WARNINGS+1)); }

echo "Checking: $FILE"
echo ""

# ── Frontmatter fields ──────────────────────────────────────────────────────

for field in date author status type experiment_id tags; do
  grep -q "^${field}:" "$FILE" || err "Missing frontmatter field: '${field}'"
done

# status must be a valid value
STATUS=$(awk '/^status:/{print substr($0, 9)}' "$FILE" | head -1 | tr -d '\r')
case "$STATUS" in
  "Proposed"|"Approved"|"In Progress"|"Paused"|"Completed"|"Cancelled") ;;
  *) err "Invalid status: '$STATUS' — must be one of: Proposed, Approved, In Progress, Paused, Completed, Cancelled" ;;
esac

# type must be "experiment"
TYPE=$(awk '/^type:/{print substr($0, 7)}' "$FILE" | head -1 | tr -d '\r')
[ "$TYPE" = "experiment" ] || err "Invalid type: '$TYPE' — must be 'experiment'"

# experiment_id must follow YYYY-MM-DD-slug pattern
EXP_ID=$(awk '/^experiment_id:/{print substr($0, 16)}' "$FILE" | head -1 | tr -d '\r')
echo "$EXP_ID" | grep -qE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-.+' \
  || err "Invalid experiment_id format: '$EXP_ID' — must be YYYY-MM-DD-slug"

# ── Duplicate status line (common copy-paste bug) ────────────────────────────

STATUS_COUNT=$(grep -c "^status:" "$FILE" || true)
[ "$STATUS_COUNT" -gt 1 ] \
  && err "Found 'status:' field $STATUS_COUNT times — it should appear only once (in frontmatter). Remove the duplicate from the body."

# ── Required sections ────────────────────────────────────────────────────────

for section in \
  "## Description" \
  "## Intervention" \
  "## Null Hypothesis" \
  "## Alternative Hypothesis" \
  "## Baseline" \
  "## Success Criteria" \
  "## Notes"
do
  grep -qF "$section" "$FILE" || err "Missing required section: '$section'"
done

# ── Guardrail Metrics (warning — optional but recommended) ───────────────────

grep -qF "## Guardrail Metrics" "$FILE" \
  || warn "Missing '## Guardrail Metrics' section — add the section with 'None' if guardrails are intentionally skipped"

# ── TBD baseline (warning — spec is incomplete) ──────────────────────────────

grep -q "| TBD" "$FILE" \
  && warn "Baseline table contains TBD values — establish all baselines before running the experiment"

# ── Result ───────────────────────────────────────────────────────────────────

echo ""
if   [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
  echo "  ✓ Valid"
elif [ $ERRORS -eq 0 ]; then
  echo "  ✓ Valid with $WARNINGS warning(s)"
else
  echo "  ✗ Invalid — $ERRORS error(s), $WARNINGS warning(s)"
  exit 1
fi
