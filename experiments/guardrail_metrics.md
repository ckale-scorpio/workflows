# Guardrail Metrics Registry

This file defines metrics used to detect harm during an experiment.
Guardrail metrics are not the primary success metric — they are monitored
to ensure the intervention does not degrade important product or business
health signals. If a guardrail metric moves adversely beyond its threshold,
the experiment should be paused and reviewed.

To add a new guardrail metric, append an entry to this list and commit.
Slugs must be lowercase with underscores. Descriptions should be one sentence.

---

- **page_load_time_p95** — 95th percentile page load time in milliseconds (an increase signals performance regression)
- **checkout_success_rate** — % of users who initiate checkout and successfully complete payment (a drop signals funnel breakage)
- **unsubscribe_rate** — % of users who unsubscribe from product communications per week (an increase signals user dissatisfaction)
- **user_error_rate** — % of user sessions that encounter at least one application error (an increase signals a technical regression)
- **monthly_recurring_revenue** — total MRR in dollars across all active paid subscribers (a drop signals direct revenue harm)
- **support_ticket_rate** — number of support tickets submitted per 100 active users per week (an increase signals confusion or breakage)
- **paid_conversion_rate** — % of all signups who convert to a paid plan within 30 days (used as a guardrail when the experiment targets a different metric)
- **monthly_churn_rate** — % of paid subscribers who cancel or do not renew in a given month (a guardrail for any experiment touching the paid user experience)
