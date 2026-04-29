#!/usr/bin/env bash
# validate_all.sh — Run all experiment validations in one pass.
#
# Usage:
#   ./experiments/scripts/validate_all.sh
#
# Runs:
#   1. lint_registries.sh  — validates metrics.md and guardrail_metrics.md
#   2. validate_spec.sh    — validates every experiment spec in experiments/
#
# Exit codes:
#   0 — everything valid (warnings OK)
#   1 — one or more errors found

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOTAL_ERRORS=0

separator() { echo ""; echo "────────────────────────────────────────"; echo ""; }

# ── 1. Registry lint ─────────────────────────────────────────────────────────

echo "▶ Linting registries"
separator

bash "$SCRIPT_DIR/lint_registries.sh"
TOTAL_ERRORS=$((TOTAL_ERRORS + $?))

separator

# ── 2. Spec validation ───────────────────────────────────────────────────────

echo "▶ Validating experiment specs"
separator

SPECS=$(find experiments/ -name "*.md" \
  -not -name "metrics.md" \
  -not -name "guardrail_metrics.md" \
  -not -path "*/scripts/*" \
  -not -path "*/fixtures/*" \
  | sort)

if [ -z "$SPECS" ]; then
  echo "  No experiment spec files found."
else
  for spec in $SPECS; do
    bash "$SCRIPT_DIR/validate_spec.sh" "$spec"
    TOTAL_ERRORS=$((TOTAL_ERRORS + $?))
    echo ""
  done
fi

# ── Summary ──────────────────────────────────────────────────────────────────

separator

if [ $TOTAL_ERRORS -eq 0 ]; then
  echo "✓ All checks passed"
else
  echo "✗ $TOTAL_ERRORS check(s) failed"
  exit 1
fi
