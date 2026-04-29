#!/usr/bin/env bash
# lint_registries.sh — Validate the structure of metrics.md and guardrail_metrics.md.
#
# Usage:
#   ./experiments/scripts/lint_registries.sh
#
# Checks:
#   - Each entry follows the "- **slug** — description" format
#   - Slugs are lowercase with underscores only (no uppercase, no hyphens, no spaces)
#   - Each slug has a description (non-empty text after " — ")
#   - No duplicate slugs
#
# Exit codes:
#   0 — all registries valid
#   1 — one or more errors found

ERRORS=0

err() { echo "  ✗ ERROR [$1]: $2"; ERRORS=$((ERRORS+1)); }

lint_registry() {
  local FILE="$1"
  local LABEL="$2"

  if [ ! -f "$FILE" ]; then
    err "$LABEL" "File not found: $FILE"
    return
  fi

  echo "Checking: $FILE"
  echo ""

  local SEEN_SLUGS=""

  while IFS= read -r line; do
    # Only process lines that look like metric entries
    echo "$line" | grep -qE '^\- \*\*.+\*\*' || continue

    # Extract slug (text between the first pair of **)
    SLUG=$(echo "$line" | sed 's/^- \*\*\([^*]*\)\*\*.*/\1/')

    # Check slug format: lowercase letters, digits, underscores only
    if ! echo "$SLUG" | grep -qE '^[a-z][a-z0-9_]*$'; then
      err "$LABEL" "Invalid slug format: '$SLUG' — must be lowercase with underscores only (a-z, 0-9, _)"
    fi

    # Check for duplicate slugs
    if echo "$SEEN_SLUGS" | grep -qF "|${SLUG}|"; then
      err "$LABEL" "Duplicate slug: '$SLUG'"
    fi
    SEEN_SLUGS="${SEEN_SLUGS}|${SLUG}|"

    # Check that there's a description after " — "
    if ! echo "$line" | grep -qF " — "; then
      err "$LABEL" "Slug '$SLUG' is missing a description (expected ' — description' after the slug)"
    else
      DESC=$(echo "$line" | awk -F' — ' '{print $2}' | tr -d '\r')
      if [ -z "$DESC" ]; then
        err "$LABEL" "Slug '$SLUG' has an empty description"
      fi
    fi

  done < "$FILE"

  echo "  Found $(echo "$SEEN_SLUGS" | tr -cd '|' | wc -c | tr -d ' ') entries"
}

lint_registry "experiments/metrics.md"          "metrics.md"
echo ""
lint_registry "experiments/guardrail_metrics.md" "guardrail_metrics.md"
echo ""

if [ $ERRORS -eq 0 ]; then
  echo "✓ All registries valid"
else
  echo "✗ $ERRORS error(s) found in registries"
  exit 1
fi
