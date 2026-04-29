# Metrics Registry

This file defines the canonical list of metrics available for use in experiment specifications.
Each entry has a slug, a display name, and a description of what it measures.

To add a new metric, append an entry to this list and commit the file.
Slugs must be lowercase with underscores. Descriptions should be one sentence.

---

- **product_signup_rate** — % of visitors who complete the signup flow and create an account
- **onboarding_completion_rate** — % of new signups who finish the full onboarding sequence
- **trial_to_paid_rate** — % of trial users who convert to a paid plan before the trial ends
- **paid_conversion_rate** — % of all signups (including free/trial) who convert to a paid plan within 30 days
- **weekly_active_users** — count of users who performed at least one core product action in the past 7 days
- **day_1_retention** — % of new users who return to the product on the day after signup
- **day_7_retention** — % of new users who return to the product 7 days after signup
- **day_30_retention** — % of new users who are still active 30 days after signup
- **monthly_churn_rate** — % of paid subscribers who cancel or do not renew in a given month
- **average_revenue_per_user** — total revenue divided by total active users in a given period
- **feature_adoption_rate** — % of active users who use a specific feature within their first 14 days
- **time_to_first_value** — median time (in minutes) from signup to a user's first meaningful product action
- **support_ticket_rate** — number of support tickets submitted per 100 active users per week
