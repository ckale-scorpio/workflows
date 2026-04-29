# Test Scenario: Well-Formed Experiment (All Fields Known)

This fixture describes a "happy path" invocation of `/specify_experiment` where all
fields are known, the hypotheses are measurable, and no custom metrics are needed.

Use it as the baseline when manually testing the skill end-to-end.

## Simulated User Inputs (in order)

| Step | Question | Answer |
|------|----------|--------|
| 1 | Title | Reduce onboarding fields |
| 1 | Description | Users are abandoning signup because the form has 5 mandatory fields. Removing 3 of them should reduce friction and increase completion. |
| 1b | Status | Proposed |
| 2 | Intervention | Remove date of birth, phone number, and company size from the mandatory signup fields. These will become optional and skippable. |
| 3 | H₀ | There will be no statistically significant difference in onboarding_completion_rate between users who see the 2-field form and users who see the current 5-field form. |
| 4 | Hₐ | By reducing mandatory onboarding fields from 5 to 2, the onboarding_completion_rate will increase by at least 15% over 4 weeks. |
| 5 | Primary metric | onboarding_completion_rate (from registry) |
| 5 | Baseline value | 42% |
| 5 | Source | PostHog |
| 5 | Date measured | Last 30 days |
| 5b | Guardrails | support_ticket_rate |
| 5b | Threshold | Any statistically significant degradation (default) |
| 6 | Duration | 4 weeks |
| 6 | Population | All new signups |
| 7 | Confirm | Yes — create the file |

## Expected Output File

- **Location**: `experiments/YYYY-MM-DD-reduce-onboarding-fields.md`
- **Status**: Proposed
- **Primary metric**: onboarding_completion_rate, baseline 42%, target ≥ 48.3% (+630 bps)
- **No TBD values**
- **Has Guardrail Metrics section**

## Pass Criteria

- [ ] File created at correct path with correct frontmatter
- [ ] H₀ and Hₐ appear verbatim
- [ ] Baseline table has one row: onboarding_completion_rate | 42% | PostHog | Last 30 days
- [ ] Success Criteria shows Δ +630 bps (42% → 48.3%)
- [ ] Guardrail Metrics table shows support_ticket_rate with default threshold
- [ ] Git commit is made with message: "Add experiment spec: Reduce Onboarding Fields"
- [ ] `validate_spec.sh` passes with no errors or warnings
