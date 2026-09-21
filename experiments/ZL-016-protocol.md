# ZL-016 — policy-guided Jev prompt, unchanged execution

## Preregistration

Authorized by TR, Discord `1551406329745117276` (“Do ot”), thread `1551351642509803581`. Base is clean ZL-015 commit `3b42d9d913e4bd9a442857c79a1cc962176026b0`. This protocol is committed before any new inference.

**Question:** Does making the immediate-capture decision procedure explicit in Jev's human question avoid the earlier closed-loop failure without regressing the other fixed start? This is a prompt/policy intervention, not model training, new intelligence, or a guaranteed solver.

**Original arm:** reuse the immutable 19 ZL-015 recordings (12 decisions in run-01; capture at decision 7 in run-02). No new original-arm calls. These are historical, previously inspected data. Same starts and pinned model are paired; service time and possible hosted nondeterminism are not paired or randomized. This known-failure-targeted experiment is not a fresh test set, and two purposive starts cannot support generalization or statistical confidence.

**Policy-guided arm:** same exact frozen ZL-015 starts in manifest order, 12 decisions maximum each, stopping at capture. At most 24 NEW requests total including failures; concurrency one, no warmups, retries, replacements, adaptive tuning or budget reallocation. Pin request and returned model `jev-1.13.0`. Preserve all inherited ledgers and recordings byte-for-byte.

## Exactly one prompt intervention

Keep shared rules, old positions, all legal candidate coordinates, two zombie Choice questions, human Choice criteria, transport, and simulator unchanged. Change only `questions.human_action.instructions` by prepending this explicit procedure to the original instructions:

> First apply this decision procedure yourself using the rules and OLD positions in state; no other question's answer is available. (1) For EACH zombie, evaluate ALL its legal candidate destinations against the OLD human position using Manhattan distance |dx|+|dy|. Select the minimum-distance destination, breaking ties by the FIRST legal move in N,E,S,W,stay order. These two zombie destinations are fixed for this simultaneous tick; do not recompute them toward a hypothetical new human destination. (2) Evaluate EVERY legal human candidate against those two zombie destinations. Mark a candidate as immediate capture if its destination shares a cell or is cardinal-adjacent (Manhattan distance <=1) to either destination, or exchanges old positions with either zombie. Diagonal adjacency alone is not capture; initial contact would already end the run. (3) If ANY candidate avoids immediate capture, reject ALL immediately capturing candidates and choose only among the noncapturing candidates. If ALL candidates capture, retain all legal candidates. (4) Among the remaining candidates apply the original long-term preference and tie order below. This is an instruction for your own choice, not a supplied safe-action label or external filter.

Original suffix remains verbatim: prefer indefinite avoidance, else maximize capture delay with best future human choices, first-tied N,E,S,W,stay. This retains freedom among immediately safe moves; no safe action/rank/predicted endpoint is supplied to Jev. The separate prediction questions are independent and cannot feed the human question.

Only the raw validated human Choice is executed, even if it is unsafe. Actual zombies use unchanged `two-zombies.js` OLD-state behavior; shared-cell/cardinal adjacency/exchange capture remains production-defined. No safety filtering, fallback, selected-answer correction, confidence gate, memory or model tuning. Missing/malformed ANY Choice, wrong model, service/account/price failure consumes any admitted request then stops the whole campaign without moving, retrying or starting the second run. Unused slots remain unused. Position recurrence is not an infinite-survival certificate for a hosted model.

## Evidence and metrics

Before inference freeze and commit source hashes, identical starts, baseline file hashes, initial request bytes and independently checked starting truth. Exact future requests depend on prior actual actions: persist/hash each request and independently verify ALL current legal action successor/capture/rank labels before its admission. Persist proof separately; no labels enter request construction. Durably admit before network I/O. Postrun offline independent parity over every visited decision and actual executed frame.

Primary per-start comparison: capture vs unresolved 12-tick cutoff (or failure) and stopping tick. Do not subtract a cutoff tick from a capture tick as a proven survival-time effect. Retain greedy/depth2 controls on the same starts/horizon, all initial/stopping frames. Secondary: correct zombie predictions, immediately noncapturing human choices, winning successors, first loss of exact avoidability, first action/trajectory divergence, invalid/missing/service counts, requests, token usage, latency and usage-derived estimated cost. Diagnostic labels appear only offline/in the viewer, never in API state. Report descriptive denominators; a negative treatment result completes the experiment.

## Bounded transport, tooling, delivery

Reuse fixed-host stdlib HTTPS to `api.typesafe.ai/v1/systemone`; no redirects or retry layer. Requests <=16KiB and exactly three questions; responses <=64KiB, absolute timeout <=30s/request, campaign <=15min, exclusive lock and single-use ledger. Official price/model preflight checked: $0.042/M input, output free. Existing conservative maximum 24*(16384+8192) byte-as-token units = $0.024772608, below $1, not a billing cap. `TYPESAFE_API_KEY` environment only, never artifacts/logs/browser. CI paid calls categorically rejected; static builders never call live inference.

Read live TypeSafe API, Choice, State, Models and parallel-question cookbook before integration. Retain original response validation except stricter campaign stop on ANY invalid Choice. No installed dependencies, new browser, GPU or server. Use cached Playwright/Chromium to exercise the actual exported read-only phone viewer, controls and endpoint holding; ship report/JSON/CSV in normal offline PR and Pages builds. Preserve historical source bytes; inject navigation only into generated output. No push/merge/publication in this block. Independent implementation review belongs to parent and is not implied by oracle parity.

Block: start 2026-09-21T01:35:02Z, implementation cutoff 02:20:02Z, checkpoint 02:35:02Z (45min + 15min verification reserve). Worktree `/Users/tr/Projects/zombie-lab-jev-policy`; sole implementation writer. Target <30MB new retained exports, measure actual storage and disclose exclusions.
