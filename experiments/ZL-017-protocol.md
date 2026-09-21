# ZL-017 preregistration — immediate-safe-candidate Jev

## Question / intervention
Does restricting the ORIGINAL ZL-015 human Choice to code-computed immediately noncapturing actions avoid its observed immediate mistakes, and does Jev still select delayed traps? This is a guardrail-plus-model system, not learned/model improvement.

Start from `ac5f0c72d42356122419442656420f1aafa239d2`. Use exact ZL-015 starts205802 and210697, in original order, with horizon12 SIMULATION ticks. Reuse all19 immutable original recordings as historical control; no replacement calls. These previously inspected starts are not fresh heldout and calls are not contemporaneous/randomized.

Only `questions.human_action.criteria` is restricted, preserving original descriptions/order. The original human instructions, complete shared legal-candidate state/rules/positions, model and both zombie prediction questions remain identical. Do NOT import ZL-016's procedural prompt. For each legal action, use unchanged production simultaneous transition (old-state zombie choices) and retain every action that does not immediately capture. No exact-winning labels/ranks enter requests. Rank diagnostics are evaluator-only.

If safe-set size=0, retain ALL legal choices and label decision `all_unsafe_fallback` in evaluation/replay; do not silently replace the prompt. If safe-set size=1, execute the unique action locally with ZERO API requests: `forced_guardrail`, no Jev agency, answers null and predictions missing/not requested. Do not pad with unsafe dummy choices. Otherwise call Jev once with restricted criteria, `jev_choice`; the predictor answers are diagnostic only and never drive physics or human choice. Validated raw human Choice is executed without correction. Any malformed, missing, out-of-set Choice (including diagnostic questions), wrong model, bad JSON or service failure consumes admission and stops the entire campaign without repair/retry.

## Docs / bounded admission
Live official API, Choice, Models and fan-out docs are saved under evidence/jev-safe/docs before inference. API/Choice docs specify a maximum255 options but do not explicitly document a singleton minimum; singleton support is therefore unconfirmed, not assumed. Local forced singleton handling avoids that API dependency regardless of support.

Separate single-use recording directory and locked ledger, <=24 requests INCLUDING failures, model `jev-1.13.0`, concurrency1, no retries/warmups. Existing TYPESAFE_API_KEY is server-side terminal environment only. Inherited fixed-host HTTPS transport, <=16KiB/3questions request, <=64KiB response, <=30s absolute per-request limit, <=900s campaign; official model/price rechecked before live run. Conservative cost ceiling inherited `$0.024772608` is an estimate, not invoice/provider cap. Inputs are committed before inference; every dynamic request's exact compact bytes and independent truth are fsynced before admission. CI/GITHUB_ACTIONS refuses paid mode. No second batch after partial or completed campaign; unused slots never spent.

## Independent verification / controls
Before EVERY visited decision, including forced steps and exact-planner decisions, the preserved independent Python oracle validates full legal transitions, simultaneous zombie ties, capture and certificate ranks. Compare mask membership/order/size against those checked transitions before admission. Verify actual executed frames against that prechecked truth. Do not call this an independent implementation review.

Exact planner selects first legal successor with certificate rank -1; on losing states selects maximum successor rank, first legal tie. Order N,E,S,W,stay. This is exact certificate control, unlike retained greedy/depth2 continuity controls. Control horizon is12 simulation ticks; rank proof and bounded replay are distinct. No position recurrence early-stop for hosted Jev; a repeated position is not a hosted-policy cycle proof.

## Preregistered metrics
Per run and arm: final outcome/capture tick or unresolved cutoff; immediate-capture choices; first winning-state to losing-successor decision (including whether that loss was immediate or delayed), distance in ticks to subsequent capture where observed; safe-set-size distribution; all-unsafe fallback steps; genuine Jev decisions vs forced guardrail steps; prediction denominators excluding zero-call steps; request latency including client/network, token usage and usage-derived cost, failures and unused admissions. Report exact planner all actions/frames, original/human trajectory divergence and both-captured timing only where valid. No tuning after observed results.

## Test / delivery gates
Test first: all-unsafe fallback, singleton/no call, candidate-only intervention, malformed/out-of-set stop, delayed losing noncapturing successor witness if feasible, CI refusal, immutable inherited evidence. Commit source/input freeze after tests, before inference. Produce offline synchronized static phone comparison, all initial/intermediate/end frames with true endpoint holds, JSON/CSV/report, PR/Pages offline builds. Exercise cached Playwright/Chromium320/390/1200, no installs. No push/merge/publication. Parent owns independent review and release gates.

Time block: start2026-09-21T02:00:23Z, cutoff02:45:23Z, checkpoint03:00:23Z; lead-enforced. Sole implementation writer.
