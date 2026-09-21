# ZL-016 result: explicit policy instructions did not improve this comparison

**The policy-guided prompt was captured three ticks earlier on the previously failing start (tick 4 versus tick 7). On the other start it followed exactly the original path to the 12-tick cutoff.** The requested prompt-only intervention ran successfully, but its scientific result is negative: written safety instructions were not reliably followed.

## What changed—and what did not

The [preregistration](ZL-016-protocol.md) was committed as `0e3fbe3` before inference. Source/start/baseline freeze `1a4d9c2bfa239ea5269389dbf43cefd0e870e43e` preceded every new request. Original source: `3b42d9d913e4bd9a442857c79a1cc962176026b0` (ZL-015). Raw new recordings committed `453155a` without prompt retuning or reruns.

Only the **human Choice instructions** changed: compute both actual zombie destinations from the old human position, use the first legal N/E/S/W/stay tie, check every human candidate for simultaneous capture, reject capturing moves if any safe move exists, then apply the original indefinite-avoidance/delay/tie preference. If all capture, all remain candidates. All shared state, rules, candidate coordinates, zombie questions, model, production physics and execution are unchanged. Only Jev's raw human Choice is executed. No external safety filter, action correction, computed safe labels, answer-to-answer dependence, training, or memory was added.

The new campaign additionally stops on a malformed **any** Choice, not just the human Choice. This validation safeguard did not affect the comparison: all original and new answers were valid.

## Paired starts and real outcomes

| Frozen start | Original prompt (historical) | Policy-guided prompt (new) | Greedy | Depth2 |
|---|---|---|---|---|
| run-01, state 205802: H(2,0), Z1(2,4), Z2(0,0) | Unresolved at 12 | Unresolved at 12; identical complete frames | Unresolved at 12 | Unresolved at 12 |
| run-02, state 210697: H(7,6), Z1(2,4), Z2(9,6) | Captured at 7 | **Captured at 4** | Captured at 7 | Unresolved at 12 |

The second trajectory first diverges at human decision 2. Original actions: N,N,N,N,N,N,W. New actions: N,W,S,stay. New first loss of exact avoidability is decision 4, immediate capture; earlier choices retained winning successors. The original first loss was decision 7. Both second-start runs capture, so their observed capture-time difference is -3 ticks. There is no claim that an unresolved cutoff proves infinite survival.

## Concrete failure, checked independently

Before policy decision 4: H(6,6), Z1(5,4), Z2(7,5).

- Z1's E and S both minimize Manhattan distance to the **old** human; the correct first tie is **E**, to (6,4). Jev's diagnostic zombie Choice instead predicts S (0.55).
- Z2's S and W tie; the correct first tie is **S**, to (7,6). Jev instead predicts W (0.48).
- Human Choice is **stay (0.32)**, leaving H(6,6), cardinal-adjacent to actual Z2(7,6): captured.
- **W to (5,6) is the only immediately noncapturing move**, and its successor is exactly avoidable. Jev assigns W 0.26, but no filter rescues the selected stay.

These prediction answers were independent of the human question. Their errors do not establish the human question's internal reasoning or a causal explanation for its decision. The policy arm never reaches the original tick-7 failure state, so this is a closed-loop comparison, not a direct repair test at that exact later state.

## Measured decisions and cost

| Metric | Original historical arm | New policy-guided arm |
|---|---:|---:|
| Real admitted requests | 19 | 16 |
| Valid Choice answers | 57/57 | 48/48 |
| Correct zombie predictions | 34/38 | 30/32 |
| Immediately noncapturing human choices | 18/19 | 15/16 |
| Winning successors selected | 18/19 | 15/16 |
| Input tokens | 25,226 | 24,808 |
| Output tokens | 2,734 | 2,257 |
| Usage-derived estimated USD | $0.001059492 | **$0.001041936** |

All 16 new responses were HTTP 200 and returned pinned `jev-1.13.0`. Zero invalid/missing answers or service failures. The new arm used 12 calls in run-01 and 4 in run-02; **8 of the 24 authorized slots remain unused and will not be spent**. Historical 19 calls are reused data, not new calls. No retries or warmups occurred. The differing trajectory lengths/states mean aggregate prediction ratios are not a controlled paired accuracy effect.

Official Models page checked at admission: $0.042 per million input tokens, output free. Costs are token-usage estimates, not invoices or provider billing caps. Preflight conservative ceiling: $0.024772608. New batch elapsed 5,644.515 ms. Per-request client/network latency (n=16): min 183.692, median 216.002, mean 227.943, max 291.944 ms. No warmup and no server-only latency claim; inference/server RSS was not sampled.

## Limitations and interpretation

- Same starts/model, **historical original recordings** rather than randomized same-time repeats. Service changes or hosted variability remain uncontrolled.
- Two deliberately reused, previously inspected endpoints; the intervention targeted a known failure. No untouched holdout, statistical confidence, general-intelligence or calibration claim.
- This is policy prompting, **not learning**. It neither changes model weights nor proves Jev cannot follow a better prompt. No alternate prompts were tried after outcomes.
- Immediate noncapture is not indefinite avoidance. The exact oracle labels are evaluation-only; cutoff runs remain unresolved.
- Negative results are completed science. A future external filter would be a different intervention and is not silently substituted here.

## Verification and evidence

All 216 inherited ZL-014/ZL-015 evidence files are frozen by SHA-256. The original ledgers were never reopened. Per-visited-state independent Python oracle checks ran **before all 16 admissions**, validating all 65 legal-action transitions, capture flags, ranks, and true zombie moves. Their timestamped `.truth.json` files are separate from requests. Offline postrun parity additionally checks all 16 executed frames. This oracle independence is **not an independent implementation review**.

Exact requests, raw responses, durable admissions/receipts and complete trajectories: [`evidence/jev-policy/recording`](../evidence/jev-policy/recording/run.json). Source/start/baseline freeze: [manifest](../evidence/jev-policy/frozen/manifest.json). Original recordings remain in `evidence/jev-controller/recording/`. The [static replay](../jev-policy.html), [JSON](../jev-policy.json), and [CSV](../jev-policy.csv) compare both prompts with the same greedy/depth2 controls, hold captured endpoints, and include complete histories.

Offline reproduction (does not call the API):

```sh
node --test scripts/test-jev-policy.cjs scripts/test-jev-policy-release.cjs scripts/test-jev-policy-view.cjs
python3 -B scripts/test-jev-policy-runner.py
python3 -B scripts/check-jev-policy-reference.py
node scripts/build-preview.cjs preview
node scripts/build-jev.cjs preview
node scripts/build-jev-controller.cjs preview
node scripts/build-jev-policy.cjs preview
```

The single live run was `python3 -B scripts/run-jev-policy.py --live-authorized`; **do not rerun**. The runner refuses a second campaign and paid calls in CI. Normal PR/Pages build steps are offline only. No new package/browser install, training, push, merge or publication. Exact-candidate tests/browser receipts and resource accounting are retained in the local handoff and experiment evidence. Independent implementation review and subsequent approved release/live verification belong to the parent.
