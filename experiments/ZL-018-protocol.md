# ZL-018 preregistration — bounded dynamics prediction pilot

## Question and scope
Does frozen Jev-1.13.0 predict complete one- and three-step toy states under fixed human actions, and how do supplied active rules versus observed examples versus neither change errors? No action selection, controller, safety mask, filtered candidate answers, learning updates, or physical-domain transfer. Prediction never controls truth. This is a **24-request, four-configuration purposive diagnostic pilot**, not a representative dataset, significance test, or pretrained-data holdout. Novelty is relative to this project's historical configurations and this campaign's development/examples.

## Paired design, fixed before inference
Four exact 12x9 starts, each paired across two laws and three information conditions:

| case | H | Z1 | Z2 | fixed actions at ticks1,2,3 | observation panel |
|---|---|---|---|---|---|
| A | (10,7) | (7,5) | (0,8) | W,N,W | identifying |
| B | (11,1) | (8,3) | (2,8) | S,S,W | identifying |
| C | (10,8) | (8,7) | (3,0) | E,N,W | ambiguous |
| D | (11,5) | (9,3) | (6,8) | stay,N,W | ambiguous |

Each request asks **14 independent Choice questions**: x/y of H/Z1/Z2 and caught status, separately at tick1 and tick3. Horizon and agent semantics appear explicitly in every question, not only the question IDs (which TypeSafe does not send to the model). No prediction from tick1 is fed to tick3. Every x integer0..11 and every y integer0..8 is always available; caught supports yes/no. Each also permits `unknown` when given evidence leaves competing-family predictions different. Supports are invariant to oracle truth, law, examples and current position. There is no unreachable-value filtering. Independently predicted components can be mutually inconsistent; they are scored as returned, not repaired.

12x9 is common to every arm. This new geometry avoids the historical exhaustive 10x7 certificate domain; all evaluation starts have coordinates outside that domain, including after swapping zombies. **Unchanged means unchanged transition law, not identical board dimensions to earlier campaigns.** New-law comparison changes only zombie tie order. Report legacy-production parity for unchanged-law transitions and independent-reference parity for both. No old certificate ranks enter this experiment.

### Shared known scaffold
Origin top-left, x east/y south. H follows the three fixed cardinal/stay commands, one per tick, clamped to the boundary if outside. Both zombies may overlap and never block. A capture occurs at Manhattan distance<=1 before or after simultaneous movement; diagonal contact does not capture. Once caught, all positions and caught status freeze for remaining requested ticks. Initial status is checked. There is no elapsed-time/cycle policy or tick-limit label. Full predicted state means six coordinates plus the absorbing capture flag at a stated observation horizon; tick itself is the question premise, not predicted.

### Candidate zombie-law family supplied identically in all conditions
1. `old_NESW`: each zombie chooses one legal cardinal/stay move minimizing Manhattan distance to the OLD H position; first ties N,E,S,W,stay. Historical law.
2. `old_WSEN`: same old-state minimization; first ties W,S,E,N,stay. Changed law.
3. `new_NESW`: same NESW minimization but to this tick's prescribed NEW H position; sequential-target competing hypothesis.
4. `stationary`: zombies remain still; competing simple hypothesis.

Only laws1/2 generate evaluation cases. That restriction, law variant IDs, identifying/ambiguous panel labels, experiment case IDs, true futures and condition labels are evaluator-only and never sent in hidden-rule requests. Family order above is fixed a priori, not truth-sorted. The `supplied` condition receives the active full natural-language zombie rule but no examples; `observations` receives examples but no active rule; `neither` receives neither. All receive the shared scaffold/family/current start/fixed action sequence. Thus observations-only means **no active zombie-law disclosure**, not inference of every physical rule from scratch.

Observations are disjoint one-step example configurations, not pieces of evaluation trajectories. Identifying panel comprises: H(9,7), Z1(6,5), Z2(2,8), action N; and H(9,6), Z1(7,6), Z2(1,8), action N. Ambiguous panel: H(11,8), Z1(8,8), Z2(4,8), action stay. Exact outputs derive from the active law and are frozen before inference. They are checked under all four hypotheses. The identifying panel is intended to distinguish the two active laws and the sequential/stationary alternatives; the ambiguous panel deliberately permits several hypotheses. Publish actually surviving hypotheses and unique prediction sets by horizon/component; if identifiability fails, retain that ambiguity rather than claim the model should recover a unique rule. General rule identifiability outside this declared finite family is never established.

Development literals and tests use3x3 and5x5 boards. Freeze uses configuration groups `width,height,H,sorted(Z1,Z2)` for all examples/evaluation starts and trajectory states. Verify no evaluation group appears in examples/development or historical hosted input records, and no starting configuration is in the complete historical10x7 domain. Pairing the same start across information/law arms is intentional, not a split leak. Freeze after test-only development, before inference; no post-result prompt tuning.

## Baselines and scoring
- **Same-information symbolic family baseline:** consumes exactly the public request state, not evaluator IDs. If active natural-language rule is supplied it selects that family member; otherwise retain every family law whose generated example transitions equal all observations. Simulate fixed actions under each surviving hypothesis. Return a component value only when all remaining predictions agree; otherwise `unknown`. Report set-valued full-state support and whether truth lies in it. This is a competent finite-family hypothesis-elimination baseline with an explicit inductive assumption, not an unrestricted learner. No oracle variant ID or true answer is passed to it.
- **Exact simulator ceiling:** true evaluator law, privileged in hidden conditions. Separately labeled, always checked against independently structured transition implementation, not counted as a same-input learner.
- Primary: strict exact full-state correctness, all7 components correct at each horizon, denominator includes missing/invalid responses as failures. Component accuracy and absolute coordinate error (valid numeric predictions only with coverage; unknown/missing are not fabricated numeric errors), capture accuracy, unknown counts and service/schema failures.
- Break down by information condition, horizon, and unchanged/changed law. Report identifiable vs ambiguous panels separately and a diagnostic of agreement with ANY evidence-consistent hypothesis; do not treat unique truth scoring on unidentifiable cases as pure rule-learning failure.
- Paired supplied-minus-observations, observations-minus-neither and supplied-minus-neither exact outcomes for same case/law/horizon; changed-minus-unchanged separately by condition/horizon. Counts/differences are descriptive, no significance or confidence/generalization claims. Four starts do not create48 independent samples: repeated horizons/components/arms share configurations.
- Preserve raw Choice probability distributions and confidence separately; confidence is not evidence of correctness or a reasoning rationale. Require complete finite probabilities over the full support, values/confidence in[0,1], and selected Choice in support. Allow sum error at most0.005 per option (two-decimal rounding, observed in historical receipts) and argmax rounding tolerance0.015; never normalize or repair responses.

## Live admission and provenance
Authorization TR Proceed message1551433908577501254 thread1551351642509803581. Isolated base1c68578d18908ad146a6e8f1b22c96d380aa1566; sole implementation writer. Commit protocol, all executable prediction/runner/evaluator source, all frozen request bytes, inputs/examples, independently checked truth and their SHA256 manifest BEFORE inference. Append results without replacing first-run evidence.

Maximum24 admissions INCLUDING failures, single-use campaign, concurrency1, no warmups/retries/replacements. Stable order A,B,C,D; within each law old_NESW then old_WSEN; within law neither, observations, supplied (fixed, not randomized; service-time confound disclosed). Failure consumes admission. Halt batch on transport/HTTP/model/JSON/schema failure, or at900 seconds; never invent unattempted responses. Capture admitted-but-incomplete as failure. Repeat invocation refuses even after crash. CI/GITHUB_ACTIONS refuse before credentials, price/network or ledger activity.

Use stdlib fixed-host direct HTTPS POST to api.typesafe.ai/v1/systemone with env TYPESAFE_API_KEY only. Bound request16KiB, response64KiB, per-call30s absolute deadline, total900s; no redirects. Official live price checked: jev-1.13.0 input$0.042/M, output free. Per-request conservative estimate `(request_bytes+8192)*0.042/1e6`; sum must be <=$0.05 before admission. This is an estimated bound, not provider billing enforcement. Persist fsynced run identity/admission BEFORE network; preserve raw responses and per-call timing/status/usage/digests. Secrets never logged.

## Local deliverables and gates
Report, JSON, row CSV, offline320/390/1200 phone HTML and actual cached Playwright/Chromium test; no dependencies/install/publication. Historical files byte-preserved. Local incremental commits only. Parent independently reviews source after algorithmic parity; no push/merge/PR/Pages operation authorized. Start2026-09-21T03:24:36Z; cutoff04:09:36Z; verification checkpoint04:24:36Z. Exact resources/costs/commands/hashes and unresolved gates in external ZL-018-implementation.md. Never rerun any campaign to fill missing evidence.
