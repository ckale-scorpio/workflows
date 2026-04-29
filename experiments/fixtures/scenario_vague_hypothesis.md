# Test Scenario: Vague Hypothesis Rejection

This fixture tests that the skill correctly rejects vague or unquantified hypotheses.
It's a negative test — the skill should refuse to proceed until the hypothesis is improved.

Use it to verify the validation logic in Steps 3 and 4 of /specify_experiment.

## Simulated User Inputs (in order)

| Step | Question | First Answer (invalid) | Expected behavior | Second Answer (valid) |
|------|----------|----------------------|------------------|-----------------------|
| 3 | H₀ | "nothing will change" | Skill rejects: must name a specific metric | "There will be no statistically significant difference in trial_to_paid_rate..." |
| 4 | Hₐ | "users will be happier" | Skill rejects: must include metric, direction, magnitude, timeframe | "trial_to_paid_rate will increase by 15% over 4 weeks by showing a larger CTA button" |
| 4 | Hₐ (missing magnitude) | "conversion rate will go up over 4 weeks" | Skill rejects: magnitude is missing | "trial_to_paid_rate will increase by at least 15% over 4 weeks" |

## Pass Criteria

- [ ] Skill rejects H₀ = "nothing will change" and asks for a metric-specific restatement
- [ ] Skill rejects Hₐ = "users will be happier" and explains the four required elements
- [ ] Skill rejects Hₐ that is missing magnitude and asks "by how much?"
- [ ] After valid inputs are provided, skill continues normally to Step 5
- [ ] Skill does NOT write the file until a valid Hₐ is accepted

## What to Check in the Conversation

The skill should respond with something like:
> "This hypothesis needs to be more specific. Please include: the metric you're measuring
> (e.g., 'trial_to_paid_rate'), the direction (increase or decrease), the magnitude (e.g.,
> 'by at least 15%'), and the timeframe (e.g., 'over 4 weeks')."

It should not accept the vague version and proceed.
