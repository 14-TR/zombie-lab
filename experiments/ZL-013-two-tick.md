# ZL-013 — Fixed-model existential two-tick safety filter

## Conclusion

Two-tick filtering removes more delayed traps than one-tick filtering, with no new captures on the one-tick policy's cycles in either evaluated domain. It does **not** dominate the planners: lower aggregate avoidable capture counts hide 6/14 regressions against depth1/depth2. The remaining 22 original and 187 held-out-training avoidable captures are negative evidence, not a safety guarantee.

## Preregistered control

Protocol commit `48f762a5c9e954f7378a19eb30b9fe879454d670`, base `f41a99911f397ba76cc1822c6fb41f33ebebc9db`. Only the safety horizon changes. A first action qualifies iff it avoids first-tick capture and **some** legal second action avoids second-tick capture. Otherwise fall back to one-tick-safe, then all legal moves. Score only the unchanged current-state neural logits, first N/E/S/W/stay tie; replan each real tick. Zombies choose from each hypothetical tick's OLD state. This is neither universal continuation nor a future neural evaluation nor an exact-rank shield.

The seed-17 epoch-40 6–32–5 model remains SHA256 `c2c007bcb27c68e7f52d61d8e21c3d2003c7331ccb16b84aa46adef87de48275`. No training, new seeds, checkpoint selection, physics/split changes or new dependencies. Preserve all prior reports and model/evidence bytes. Initial contact precedes action; capture precedes ordered-position recurrence and cutoff10000.

## Complete outcomes

Original 4,761 mixed-split starts: **502 initial contacts, 42 noninitial unavoidable, 4,217 avoidable**. Held-out training split 37,730 starts: **4,639 initial contacts, 180 noninitial unavoidable, 32,911 avoidable**. All policies capture the unavoidable starts; every evaluated run is capture or certified positional cycle, **zero unresolved**. Original split:3,809 train/612 validation/340 test. The held-out training configurations were already evaluated in ZL-011/012; this is not a new untouched test set and not held-out trajectories. No held-out planner sweep.

| Policy | Original avoidable captures | Original cycles | Held-out-training avoidable captures |
|---|---:|---:|---:|
| neural | 336 | 3881 | 2868 |
| oneTick | 30 | 4187 | 344 |
| filtered | 22 | 4195 | 187 |
| depth1 | 24 | 4193 | not swept |
| depth2 | 24 | 4193 | not swept |
| greedy | 4217 | 0 | not swept |

| Comparator → two-tick | Original recoveries | Original regressions | Criterion |
|---|---:|---:|---|
| neural | 314 | 0 | met |
| oneTick | 8 | 0 | met |
| depth1 | 8 | 6 | not met |
| depth2 | 16 | 14 | not met |
| greedy | 4195 | 0 | met |

Held-out-training paired results: versus original neural, 2,681 recoveries / 0 regressions; versus one-tick, 157 / 0. Original versus one-tick: 8 recoveries / 0 regressions; retained cycles4,187. Recovery means avoidable capture→cycle; regression means cycle→capture, never a net-total inference. Complete same-ID scalar rows and recovery/regression ID lists are in the exports.

Both-captured noninitial timing vs one-tick is separate: original64 starts,1 later/0 earlier/63 same; held-out367 starts,26 later/0 earlier/341 same (33 total ticks later). Recurrence endpoint time is not subtracted from capture time.

## Remaining failure mechanisms

All22 original and187 held-out avoidable captures first transition from exact rank -1 into a finite-rank trap **before** the final capture. At the last decision of every actionable captured two-tick run, no one-tick-safe or two-tick-safe option remains. Original actionable captures:0 immediate/64 delayed; held-out:18 immediate/349 delayed, including initially unavoidable starts. Two-tick survival can therefore still commit to a trap that closes later.

Seven deterministically selected, nonrepresentative original witnesses include first recovery/regression for each comparator, remaining avoidable failure, noninitial unavoidable and initial contact. All three neural variants retain complete initial-to-endpoint frames. Loss witnesses list every legal successor and its exact rank; independent release tests re-enumerate them with production physics and serialized ranks. Synchronized playback clamps each local run at its real capture or first-repeat endpoint. JSON/CSV includes every frame, not only selected snapshots.

## Independence and verification

Fresh reference worker `20260917_183723_c97826` read only preregistration and old physics/neural interface; completed and froze before production comparison. Reference SHA256 `f14457d7fda57610de805078ddcec99ec99c75011e127d4693598476342235c4`. All343,000 terminal states,300,212 decisions and1,351,892 legal transitions matched. Every depth1/depth2 mask, fallback horizon, first-tied action and actual transition is checked. Production reproduced the preregistered-reference47-byte stream SHA256 `5050ce041907c28bdb27f657f3b5ce10dd94d275a7f59b19c0827d88b62237e1` (206 all-legal fallback/264 depth1 fallback/299,742 depth2 states).

141,756 uncached production trajectory checks and127,473 independent neural/one/two-tick trajectory checks cover all evaluated starts;3,075,622 frame comparisons. All14,283 original planner scalar results match the historical exact-avoidability export. Prior-release neural/one-tick scalar comparison receipt covers every original and held-out ID.

RED/GREEN tests cover the existential depth distinction, fallbacks, ties, boundaries, terminal/clock invariance, fixture build/export, UI contract and packaging. Full existing workflow regressions executed; optional older browser/real-artifact skips are labeled in receipts and are not claimed passes. ZL-013's mandatory real-artifact replay/browser and release checks are separate. Emitted classic-script data equals JSON; real viewer checks all14,283 original neural-variant replays and every witness frame, plus fail-closed stale playback clearing.

## Measurements and limits

First CPU-only evaluation:23.944s before export,24.025s including serialization/parity (supervisor24.096s). Peak RSS rose from209,616KiB before export to**295,296KiB after serialization**, below512MiB. Unique initial result payloads**22,512,259bytes**, below30MB. These exclude the compact receipt; inclusive retained duplicate reruns, review snapshots, CI ZIPs/extractions and browser evidence are larger and measured separately in the final handoff/release receipt. The30MB unique-export target is not an inclusive-storage claim. Shared Git history and existing runtime excluded; model counted once inside each measured worktree. No new training cost.

Same-realm uncached256-state batch,3 warmups/11 rotating five-policy batches, original hardware Apple Silicon/Node as recorded in first receipt; median:

- neural: 2.817 µs/decision.
- oneTick: 6.107 µs/decision.
- filtered: 7.971 µs/decision.
- depth1: 0.467 µs/decision.
- depth2: 2.064 µs/decision.
- overhead: 0.013 µs/decision.

Overhead is measured, not subtracted. Neither cache savings nor cross-VM overhead is called a speedup. Two-tick is slower than one-tick and both planners on this host. Release/CI rerun timings are host-specific and do not overwrite these first measurements.

Held-out trajectories can visit training groups; exact counts for all three variants are in `summary.overlap`, including repeated endpoints. No claim about general intelligence, people, adversarial zombies, statistical confidence or untested board sizes follows.

## Reproduction and provenance

```sh
node --test scripts/test-two-tick.cjs scripts/test-two-tick-release.cjs
node scripts/test-two-tick-reference.cjs
node scripts/test-two-tick-reference-properties.cjs
node --max-old-space-size=384 scripts/build-two-tick.cjs --out-dir preview
ZL013_DATA=preview/two-tick.json node --test scripts/test-two-tick-release.cjs
ZL013_DATA=preview/two-tick.json node scripts/test-two-tick-view.cjs
```

Use an independent process timeout around heavy commands. Existing cached Playwright may be supplied as `ZL013_PLAYWRIGHT` for actual320/390/1200px browser checks; no install is implied. Both CI workflows run/build/package the new replay and reports, preserving prior pages.

Evidence: [protocol](ZL-013-protocol.md), [first evaluation](../evidence/two-tick/first-evaluation.json), [independent freeze](../evidence/two-tick/independent-freeze.json), [deterministic freeze](../evidence/two-tick/deterministic-freeze.json), [diagnostic correction](../evidence/two-tick/diagnostic-correction.json), [prior-release parity](../evidence/two-tick/prior-release-parity.json), [replay](../two-tick.html). First-run raw exports remain externally preserved at `/Users/tr/Projects/zombie-lab-evidence/ZL-013-first`.

One diagnostic-only correction after first evaluation changed original-neural loss candidate `keep` flags from an inherited one-tick mask to all legal; no scalar result, action, transition or replay frame changed. Original failed diagnostic test and first outputs are retained, not replaced. Publication is established only by the external exact-tree review, CI/artifact and live-target receipt, not by this report's existence.
