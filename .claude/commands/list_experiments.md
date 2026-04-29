---
description: List all experiments grouped by status. Optionally filter to a single status by passing it as an argument (e.g. /list_experiments Proposed).
---

# List Experiments

List all experiment specs from the `experiments/` directory, grouped by status.

## Steps

1. Check if a status filter was provided via `$ARGUMENTS`. Valid filter values are: `Proposed`, `Approved`, `In Progress`, `Paused`, `Completed`, `Cancelled`. If provided, only show experiments matching that status. If not provided, show all statuses.

2. Run this single command to find all experiment spec files and extract their frontmatter fields in one pass:
   ```bash
   find experiments/ -name "*.md" -not -name "metrics.md" -not -name "guardrail_metrics.md" \
     -exec awk '/^status:/{s=substr($0,9)} /^date:/{d=substr($0,7)} /^experiment_id:/{i=substr($0,16); print s"|"d"|"i}' {} +
   ```

   This outputs one line per experiment in the format `STATUS|DATE|EXPERIMENT_ID`. Using `find -exec ... {} +` avoids command substitution (`$(...)`) which triggers a separate permission prompt in Claude Code regardless of the allowlist.

4. Group the experiments by status in this order:
   1. Proposed
   2. Approved
   3. In Progress
   4. Paused
   5. Completed
   6. Cancelled

5. Display the results using this format:

```
## Proposed (N)
- 2026-04-28  |  2026-04-28-reduce-onboarding-fields
- 2026-04-28  |  2026-04-28-add-free-pricing-tier-neon

## Approved (N)
— none

## In Progress (N)
- ...

## Paused (N)
— none

## Completed (N)
— none

## Cancelled (N)
— none
```

   - Always show all six status groups, even if empty (show `— none` for empty groups)
   - If a status filter was provided via `$ARGUMENTS`, only show the matching group (but still show the header and count)
   - Sort entries within each group by date descending (newest first)

6. After the list, print a one-line summary:
   ```
   Total: N experiments  (N proposed, N approved, N in progress, N paused, N completed, N cancelled)
   ```
   Omit zero-count statuses from the summary line.
