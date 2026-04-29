---
date: 2026-04-28
author: Chetan Kale
status: Proposed
type: experiment
experiment_id: 2026-04-28-increase-clicks-on-loan-apps
tags: [experiment]
---

# Experiment: Increase Clicks on Loan Apps

## Description
Make the apply for loan button wider (w-full)

## Intervention
Make the apply for loan button wider (w-full)

## Null Hypothesis (H₀)
A wider button does not change loan application click rates.

## Alternative Hypothesis (Hₐ)
By making the loan application button full width, the loan application rate per day will increase by 10% over 6 weeks.

## Baseline
| Metric | Current Value | Source | Date Measured |
|--------|--------------|--------|---------------|
| loan_application_rate_per_day | TBD | Internal analytics dashboard | Last 90 days |

## Success Criteria
- **Primary metric**: loan_application_rate_per_day increase by 10% (TBD → TBD, Δ TBD bps)
- **Duration**: 6 weeks
- **Target population**: All users

## Guardrail Metrics
| Metric | Threshold |
|--------|-----------|
| checkout_success_rate | Any statistically significant degradation |

## Notes
⚠️ **Custom metric alert**: loan_application_rate_per_day is not yet in the metrics registry (`experiments/metrics.md`). This should be added before the experiment runs.
