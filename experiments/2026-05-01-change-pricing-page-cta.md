---
date: 2026-05-01
author: Chetan Kale
status: Approved
type: experiment
experiment_id: 2026-05-01-change-pricing-page-cta
tags: [experiment]
---

# Experiment: Change pricing page CTA

## Description
Visitors are landing on the pricing page but not clicking through to sign up, resulting in
a low CTA click-through rate. The current primary call-to-action button uses an outline/ghost
style that lacks visual prominence. This experiment tests whether switching to a solid filled
button increases the rate at which pricing page visitors complete signup.

## Intervention
Change the primary CTA button on the pricing page from an outline/ghost style to a solid
filled button. All other page elements (copy, layout, pricing tiers) remain unchanged.

## Null Hypothesis (H₀)
There will be no statistically significant difference in product_signup_rate between the
control group (outline button) and the treatment group (filled button).

## Alternative Hypothesis (Hₐ)
Changing the primary CTA button from outline to solid filled will increase product_signup_rate
by at least 10% (relative) over 2 weeks.

## Baseline
| Metric | Current Value | Source | Date Measured |
|--------|--------------|--------|---------------|
| product_signup_rate | 2% | Mixpanel | Last 90 days |
| paid_conversion_rate | 12% | Mixpanel | Last 90 days |
| trial_to_paid_rate | 15% | Mixpanel | Last 90 days |

## Success Criteria
- **Primary metric**: product_signup_rate increases by ≥10% relative (2% → 2.2%, Δ +20 bps)
- **Secondary metrics**: paid_conversion_rate (baseline 12%), trial_to_paid_rate (baseline 15%)
- **Duration**: 2 weeks
- **Target population**: All visitors to the pricing page

## Guardrail Metrics
| Metric | Threshold |
|--------|-----------|
| monthly_churn_rate | Any statistically significant degradation |

## Notes
None
