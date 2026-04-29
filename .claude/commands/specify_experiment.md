---
description: Interactively specify an A/B experiment — collects title, intervention, H₀, Hₐ, baseline values, and commits the spec to git
---

# Specify Experiment

You are helping a PM or operations researcher write a rigorous experiment specification. Walk through the steps below in order, using `AskUserQuestion` to collect each piece of information. Do not skip steps or combine unrelated steps into a single question.

## Step 1 — Title and description

Ask:
- What is a short title for this experiment? (e.g., "Reduce onboarding fields")
- What is the experiment about? Describe the product area, the user problem, and why this experiment is worth running.

## Step 1b — Status

Ask what status this experiment is in right now. Explain the available values briefly:

- **Proposed** — drafted but not yet reviewed or approved (most common at creation time)
- **Approved** — stakeholders have signed off; ready to run but not yet started
- **In Progress** — experiment is actively running (use when documenting a running experiment retroactively)
- **Paused** — was running but stopped mid-flight, typically due to a guardrail violation or technical issue
- **Completed** — finished running; data collection is done
- **Cancelled** — will not run (proposed or approved but killed)

Present Proposed, Approved, and In Progress as the primary options (these are the only statuses that make sense when creating a new spec). Include a fourth option for the rarer cases (Paused, Completed, Cancelled) with a note that these are unusual at creation time.

Record the selected status — it will be written to both the frontmatter and the body of the experiment spec.

## Step 2 — Intervention

Ask what specific, concrete change will be made. This must be actionable and scoped (e.g., "Reduce mandatory fields during signup from 5 to 2 by removing date of birth, phone number, and company size").

If the user's answer is vague (e.g., "simplify onboarding"), ask them to be more specific about exactly what changes.

## Step 3 — Null hypothesis (H₀)

Ask the user to state the null hypothesis. Explain that H₀ should state that the intervention produces **no measurable change** in the primary metric.

**Validate**: H₀ must:
- Reference a specific, measurable metric (e.g., "user onboarding completion rate")
- Assert no change (e.g., "There will be no statistically significant difference in onboarding completion rate between the control group and the treatment group")

If the user provides a vague H₀ (e.g., "nothing will change"), help them rephrase it to be metric-specific. Do not accept it until it names the metric and asserts no difference.

## Step 4 — Alternative hypothesis (Hₐ)

Ask the user to state the alternative hypothesis. Explain that Hₐ must be directional, quantified, and time-bound.

**Validate**: Hₐ must include all four of:
1. **Metric** — what is being measured (e.g., "onboarding completion rate")
2. **Direction** — increase or decrease
3. **Magnitude** — by how much (e.g., "by at least 15%")
4. **Timeframe** — over what period (e.g., "over 4 weeks")

Example of a valid Hₐ: "By reducing mandatory onboarding fields from 5 to 2, the onboarding completion rate will increase by at least 15% over 4 weeks."

If any of the four elements are missing, ask the user to supply them before continuing. Do not accept a vague or unquantified Hₐ.

## Step 5 — Baseline values

Before asking the user anything, read `experiments/metrics.md` using the Read tool to load the canonical metrics list.

Present the metric slugs and descriptions from that file as a **multiSelect** `AskUserQuestion`. The user may select one or more success metrics. Always include a final option — "My metric isn't listed" — for cases where a metric is not yet in the registry.

If the user selects "My metric isn't listed" (alongside or instead of registry metrics):
- Ask them to describe each custom metric in their own words
- Help them name each one using the slug format (lowercase, underscores)
- Note in the experiment spec that custom metrics are not yet in the registry and should be added to `experiments/metrics.md` before the experiment is run
- Do not block progress — record the custom metrics and continue

Once all metrics are selected or described, handle them **one at a time**. For each metric, ask:
- The current value (must be numeric — a number or percentage)
- The data source (e.g., "PostHog", "Mixpanel", "internal analytics")
- The date or period the baseline was measured (e.g., "last 90 days", "Q1 2026")

If the user says they don't know the current value for a metric, record it as "TBD" but flag clearly that the experiment should not be run until that baseline is established.

The first metric selected is treated as the **primary success metric** (the one Hₐ is powered for). Any additional metrics are **secondary success metrics** — also tracked for success, but not the basis for the experiment's power calculation.

## Step 5b — Guardrail metrics

Before asking the user anything, read `experiments/guardrail_metrics.md` using the Read tool.

Explain to the user that guardrail metrics are monitored during the experiment to catch unintended harm. If a guardrail degrades beyond its threshold, the experiment should be paused and reviewed — even if the primary metric is performing well.

Present the metrics from `guardrail_metrics.md` as a **multiSelect** `AskUserQuestion`. The user may select as many as apply. Always include a final option — "None — I don't need guardrails for this experiment" — for teams that want to skip this step.

If the user selects one or more guardrails, ask a follow-up:
- "Do you want to set explicit degradation thresholds for any of these, or use 'any statistically significant degradation' as the default for all?"
- If they want explicit thresholds: for each selected guardrail, ask what the maximum acceptable degradation is (e.g., "p95 load time must not exceed 2,500ms", "error rate must not increase by more than 0.5 percentage points")
- If they accept the default: record the threshold as "Any statistically significant degradation" for each selected guardrail

## Step 6 — Duration and target population

Ask:
- How long will the experiment run? (weeks)
- Who is in scope? (e.g., "all new signups", "users in the US on the web app", "users on the free tier")

## Step 7 — Review and confirm

Display a complete formatted preview of the experiment spec using the exact template below. Ask the user to confirm it is correct or specify any changes. If they request changes, go back to the relevant step and update.

Do not write the file until the user has explicitly confirmed.

## Step 8 — Write the file

Once confirmed:

1. Get today's date in YYYY-MM-DD format using `date +%Y-%m-%d`.
2. Get the git user name using `git config user.name`.
3. Create a kebab-case slug from the experiment title (lowercase, spaces to hyphens, remove special characters).
4. Check if an `experiments/` directory exists at the repo root. If not, create it.
5. Write the file to `experiments/YYYY-MM-DD-[slug].md` using the template below.
6. Run `git add experiments/` then commit with message: `Add experiment spec: [Title]`

## Output file template

```markdown
---
date: YYYY-MM-DD
author: GIT_USER_NAME
status: STATUS
type: experiment
experiment_id: YYYY-MM-DD-SLUG
tags: [experiment]
---

# Experiment: TITLE

## Description
DESCRIPTION

## Intervention
INTERVENTION

## Null Hypothesis (H₀)
H0

## Alternative Hypothesis (Hₐ)
HA

## Baseline
| Metric | Current Value | Source | Date Measured |
|--------|--------------|--------|---------------|
| METRIC | VALUE | SOURCE | DATE |

## Success Criteria
- **Primary metric**: METRIC_1 DIRECTION by THRESHOLD relative (BASELINE → TARGET, Δ +/- N bps)
- **Secondary metrics**: METRIC_2 (BASELINE → TARGET, Δ +/- N bps), METRIC_3 (BASELINE → TARGET, Δ +/- N bps)
- **Duration**: N weeks
- **Target population**: POPULATION

## Guardrail Metrics
| Metric | Threshold |
|--------|-----------|
| GUARDRAIL_METRIC | THRESHOLD |

## Notes
NOTES_OR_NONE
```

## Guidelines

- Be conversational and friendly — PMs and ops researchers are not always technical.
- If the user is unsure about a step, offer a brief example to help them.
- Never move to the next step until the current one passes validation.
- The final committed file must be self-contained — someone reading it cold should understand the experiment fully.
- **Basis points calculation**: When writing Success Criteria, compute Δ bps as `(target_value − baseline_value) × 100`. For example: baseline 5%, target 5.5% → Δ = (5.5 − 5) × 100 = +50 bps. Always show the sign (+ or −). This applies to both primary and secondary metrics.
