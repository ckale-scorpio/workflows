# Test Scenario: TBD Baseline

This fixture tests the case where the user doesn't yet know the baseline value for their
primary metric. The skill should accept TBD, generate the spec, and flag the gap clearly.

Use it to verify the skill doesn't block progress when the baseline is unknown.

## Simulated User Inputs (in order)

| Step | Question | Answer |
|------|----------|--------|
| 1 | Title | Increase clicks on loan apps |
| 1 | Description | Make the apply for loan button wider (w-full) |
| 1b | Status | Proposed |
| 2 | Intervention | Make the apply for loan button wider (w-full) |
| 3 | H₀ | A wider button does not change loan application click rates. |
| 4 | Hₐ | Loan application rate per day will increase by 10% over 6 weeks. |
| 5 | Primary metric | My metric isn't listed → loan_application_rate_per_day |
| 5 | Baseline value | I don't know yet (TBD) |
| 5 | Source | Internal analytics dashboard |
| 5 | Date measured | Last 90 days |
| 5b | Guardrails | checkout_success_rate |
| 5b | Threshold | Any statistically significant degradation (default) |
| 6 | Duration | 6 weeks |
| 6 | Population | All users |
| 7 | Confirm | Yes — create the file |

## Expected Output File

- **Location**: `experiments/YYYY-MM-DD-increase-clicks-on-loan-apps.md`
- **Baseline table**: loan_application_rate_per_day | TBD | Internal analytics dashboard | Last 90 days
- **Notes section**: Warning that loan_application_rate_per_day is not in the metrics registry

## Pass Criteria

- [ ] File created with TBD in the baseline table
- [ ] Notes section flags TBD baseline as blocking the experiment
- [ ] Notes section flags custom metric as not yet in registry
- [ ] `validate_spec.sh` passes with 0 errors and 1 warning (TBD baseline)
- [ ] Git commit is made successfully
