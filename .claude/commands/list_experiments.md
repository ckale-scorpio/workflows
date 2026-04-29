---
description: List all experiments grouped by status. Optionally filter to a single status by passing it as an argument (e.g. /list_experiments Proposed).
---

# List Experiments

List all experiment specs from the `experiments/` directory, grouped by status.

## Steps

1. Check if a status filter was provided via `$ARGUMENTS`. Valid filter values are: `Proposed`, `Approved`, `In Progress`, `Paused`, `Completed`, `Cancelled`. If provided, only show experiments matching that status. If not provided, show all statuses.

2. Run the following command to find all experiment spec files (excluding the registries):
   ```bash
   find experiments/ -name "*.md" \
     -not -name "metrics.md" \
     -not -name "guardrail_metrics.md" \
     | sort
   ```

3. For each file found, extract these fields from the YAML frontmatter using Bash:
   - `status` — e.g. `Proposed`
   - `date` — e.g. `2026-04-28`
   - `experiment_id` — e.g. `2026-04-28-reduce-onboarding-fields`

   Use this pattern to extract a frontmatter field from a file:
   ```bash
   grep "^field_name:" file.md | head -1 | sed 's/^field_name: //'
   ```

   **Important**: `status` is a reserved variable in zsh and cannot be assigned. Use `exp_status`, `exp_date`, `exp_id` as variable names when looping over files.

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
