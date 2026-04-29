---
date: 2026-04-28
author: Chetan Kale
status: Proposed
type: experiment
experiment_id: 2026-04-28-improve-alexa-video-entity-recognition-accuracy
tags: [experiment]
---

# Experiment: Improve Alexa Video Entity Recognition Accuracy

## Description
Alexa's video entity name recognition system incorrectly resolves ambiguous entity names, degrading the end-to-end query success rate. A post-processing disambiguation layer is proposed to resolve ambiguities after the base recognition step, improving the rate at which queries return the correct video entity result.

## Intervention
Add a post-processing disambiguation layer to the Alexa video entity name recognition pipeline. The layer runs after base entity recognition to resolve ambiguous entity names before the result is returned to the user.

## Null Hypothesis (H₀)
There will be no statistically significant difference in end-to-end query success rate between the system with the post-processing disambiguation layer and the current baseline system without it.

## Alternative Hypothesis (Hₐ)
By adding a post-processing disambiguation layer to the Alexa video entity name recognition pipeline, the end-to-end query success rate will increase by at least 15% over 4 weeks, compared to the current system.

## Baseline
| Metric             | Current Value | Source                  | Date Measured    |
|--------------------|---------------|-------------------------|------------------|
| query_success_rate | 60%           | Internal evaluation set | Recent benchmark |

## Success Criteria
- **Primary metric**: query_success_rate increases by at least 15% (60% → ≥ 69%)
- **Duration**: 4 weeks
- **Target population**: All Alexa video entity queries globally

## Guardrail Metrics
| Metric                      | Threshold                              |
|-----------------------------|----------------------------------------|
| alexa_video_utterance_count | Any statistically significant decrease |

## Notes
⚠️ `query_success_rate` is not yet in `experiments/metrics.md` — add it before the experiment runs.
⚠️ `alexa_video_utterance_count` is not yet in `experiments/guardrail_metrics.md` — add it before the experiment runs.
