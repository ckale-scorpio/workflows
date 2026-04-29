---
date: 2026-04-28
author: Chetan Kale
status: Proposed
type: experiment
experiment_id: 2026-04-28-change-pricing-page-layout
tags: [experiment]
---

# Experiment: Change Pricing Page Layout

## Description
Users are abandoning checkout before purchasing. The current pricing page presents all plans with equal visual weight, which may be causing decision paralysis. Reordering plans to surface the recommended option first should reduce cognitive load and guide users toward a purchase decision.

## Intervention
Reorder the plans on the pricing page so that the recommended plan appears first (most prominent position). All other plan content remains unchanged.

## Null Hypothesis (H₀)
There will be no statistically significant difference in trial-to-paid rate between users who see the reordered pricing page and users who see the current pricing page layout.

## Alternative Hypothesis (Hₐ)
By reordering pricing plans to show the recommended plan first, the trial-to-paid rate will increase by at least 10% over 6 weeks, compared to users who see the current layout.

## Baseline
| Metric             | Current Value | Source  | Date Measured                |
|--------------------|---------------|---------|------------------------------|
| trial_to_paid_rate | 5%            | PostHog | Last 30 days (to 2026-04-28) |

## Success Criteria
- **Primary metric**: trial_to_paid_rate increases by at least 10% (5% → ≥ 5.5%)
- **Duration**: 6 weeks
- **Target population**: All users who visit the pricing page

## Notes
None
