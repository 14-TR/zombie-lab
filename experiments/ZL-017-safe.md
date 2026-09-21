# ZL-017 — immediate-safe-candidate Jev

## Result

**The code guardrail prevented the original tick-7 capture; both new runs reached the 12-tick cutoff uncaptured.** The decisive run-02 tick-7 move was forced locally, with **no Jev agency**. This is evidence for the combined guardrail system on these two starts, **not learning or improved model reasoning**.

| Frozen start | Original Jev (historical) | Immediate-safe treatment | Exact certificate planner | Greedy / depth2 |
|---|---|---|---|---|
| run-01, state205802: H(2,0), Z1(2,4), Z2(0,0) | unresolved12 | unresolved12;11 requests +1 forced step | unresolved12 | unresolved12 / unresolved12 |
| run-02, state210697: H(7,6), Z1(2,4), Z2(9,6) | captured7 | unresolved12;10 requests +2 forced steps | unresolved12 | captured7 / unresolved12 |

The historical arm's19 recordings are reused unchanged, not same-time randomized calls. These starts have already been inspected; they are not fresh heldout. The old ZL-016 policy prompt is NOT used. New source/input freeze was committed as `b77e8b8144527d435ac63e2b5af344422100709a` before inference; actual campaign retained in `124afe7`.

## What changed, precisely

Only original ZL-015 `questions.human_action.criteria` is filtered. Full shared state/rules/positions/legal candidates, original human instructions, and both zombie prediction questions stay unchanged. Code computes every legal action's actual simultaneous next state; all immediately noncapturing actions remain candidates, in original order. Exact-winning ranks are evaluator-only, never sent to Jev. Predictions do not control actual zombies or feed the human decision.

A singleton safe set executes its sole action locally, zero calls and null predictions. A zero-safe set would retain all legal actions with explicit `all_unsafe_fallback` metadata, not fabricate a safe option. Multi-option Choices are executed without repair. Any malformed/out-of-set response consumes admission and halts, no retries. API/Choice documentation snapshots specify max255 options but do not explicitly establish singleton support; no singleton probe was needed or made.

The exact planner is **not** the old depth2 planner: it selects the first certificate-winning successor, or the maximum finite-rank successor if losing, with first legal N/E/S/W/stay ties. All24 exact-control decisions were independently checked before execution and frozen before inference. Greedy/depth2 remain continuity controls in JSON/CSV.

## Agency, immediate safety and delayed traps

- 24 simulation ticks: **21 genuine Jev choices and3 forced guardrail steps**. Forced ticks: run-01 tick8; run-02 ticks7 and8. No model probabilities or diagnostic predictions are invented there.
- Safe-set sizes: size1 on3 steps, size2 on18, size3 on3. All-unsafe fallback never visited.
- New arm:0 immediate unsafe choices;24/24 executed successors retain exact avoidability; no first loss and no delayed capture within the cap. Historical original:1 unsafe choice and first loss at run-02 decision7, immediately captured, not a delayed trap.
- **There were0 visited genuine-choice states offering an immediately safe but exact-losing alternative.** All retained candidates on the actual trajectories were winning. Consequently, this run does not show that Jev can distinguish delayed traps; it only measures their absence on the reached states. A separate synthetic independent-oracle witness proves the harness can represent one: state91 H(1,2), Z1(0,0), Z2(1,0), safe choices E/S/W, where W is noncapturing but leads to losing rank5, while E/S remain winning. This fixture is not a paid campaign observation.
- First trajectory divergence from original: tick10 for run-01, tick7 for run-02. At the historical tick-7 failure state, S is the sole safe action, so code replaces the opportunity for a mistake with a forced step; the model does not select S then.
- Both new runs and exact controls are **unresolved at12**, not proofs of their realized policy's infinite survival. Certificate-winning endpoints mean some future strategy exists, not that future Jev choices will implement it. No learned weights, training, statistical-confidence or general-intelligence claim.

## Architecture scope: prediction, choice, and authority

This toy is a diagnostic of using **Jev as an inference component behind a world model**, not a validated traffic-light, traffic-flow, pipe-pressure, hydraulic, or system-load model. No new domain was built or tested here; the approved ZL-017 scope and budget did not change.

- **Dynamics prediction:** Jev independently predicts the two next zombie moves. The measured result is 34/42 correct predictions; six values are explicitly not requested on forced steps. These answers are diagnostics, not an executable physics model.
- **Control selection:** Jev makes 21 genuine choices from code-retained candidates. Three other steps have exactly one safe option and are executed by the guardrail with no model call or agency. The decisive prevention of the historical capture is in this forced category.
- **Simulator / constraint-solver authority:** Deterministic production code moves the actual zombies and resolves capture. The immediate-capture mask is computed in code and independently checked. The exact certificate planner is a separate oracle control; its ranks never enter Jev's request.

The combined system's bounded success therefore does not establish that Jev learned the dynamics or can transfer to traffic or hydraulic control. There were no reached states offering an immediately safe delayed-losing alternative, so long-term trap discrimination was not tested by the paid trajectories. Any future domain needs its own grounded state representation, physics/constraint authority, validated predictive judgments, and control evaluation; that is architectural context, not authorization for another experiment.

## Actual usage / bounds

Single campaign completed `2026-09-21T02:06:33.692667+00:00`;21/24 admissions, all HTTP200, pinned returned `jev-1.13.0`, zero invalid/service failures. Three unused admissions stay unused; the single-use ledger refuses a second batch. No warmups, retries, replacement historical calls, or retuning.

- New usage27,434 input /2,751 output tokens. Official checked price$0.042 per million input tokens; output free. Usage-derived estimate **$0.001152228**, not invoice/provider spend cap.
- Client/network-inclusive latency n21: min184.648375ms, median232.531958ms, mean234.76496228571406ms, max338.96925ms. Entire campaign7640.559667ms. No warmed or server-only latency claim.
- Zombie prediction diagnostics34/42 correct;6 additional predictor values missing/not requested on forced steps. Original34/38 is historical and evaluated over a different trajectory/length; no paired accuracy-improvement claim.
- Hard admission limits24 including failures;16KiB/3questions per call,64KiB response,30s absolute request timeout,900s campaign, concurrency1. Frozen conservative cost ceiling$0.024772608.

## Verification and reproduction

Preserved independent Python oracle checked all24 treatment states,107 legal actions, masks and executed frames, including forced steps. Exact control:24 states,105 legal actions and24 executed frames. These are algorithm-parity checks, **not independent implementation review**. All311 inherited Jev evidence files are SHA256-pinned, including old ledgers/recordings. Initial and dynamic request bytes are saved exactly before admission; no evaluator ranks are included in requests.

Offline only:

```sh
node --test scripts/test-jev-safe*.cjs
python3 -B scripts/test-jev-safe-runner.py
python3 -B scripts/test-jev-safe-reference.py
python3 -B scripts/check-jev-safe-reference.py
node scripts/build-preview.cjs preview
node scripts/build-jev.cjs preview
node scripts/build-jev-controller.cjs preview
node scripts/build-jev-policy.cjs preview
node scripts/build-jev-safe.cjs preview
```

Open `preview/jev-safe.html`. Synchronized original/treatment/exact playback holds true endpoints and includes full histories, JSON/CSV, raw evidence links, forced/no-call labels and safe-set sizes. CI runs only offline tests/builds; CI/GITHUB_ACTIONS explicitly refuses paid mode. **Do not rerun live inference.** All requested work is local only: no push, merge, PR artifact or Pages publication in this block. Parent owns independent review and any subsequent release gates. Detailed measured resources and actual cached-browser receipts are in `/Users/tr/Projects/zombie-lab-evidence/ZL-017-implementation.md`.
