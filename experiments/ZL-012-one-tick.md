# ZL-012 — One-tick safety filtering helps, but does not replace planning

**The frozen network's avoidable captures fell from 336 to 30 (91.1%) on the original benchmark, with no lost neural successes. It still did worse than either planner's 24 avoidable captures.** Rejecting an immediately fatal move fixes most failures here, but does not prevent taking a safe-looking step into a later trap.

[Phone-readable paired replay](../one-tick.html) · [Preregistered protocol](ZL-012-protocol.md) · [First measurement receipt](../evidence/one-tick/first-evaluation.json) · [Independent oracle freeze](../evidence/one-tick/independent-freeze.json)

## Question and control

Can a single-tick capture filter improve the already-trained ZL-011 policy without changing its weights or preferences? The only policy intervention predicts all legal human moves through one simultaneous production tick. If any avoids capture, capturing moves are masked; otherwise every legal move remains eligible. Original logits and N/E/S/W/stay first ties select among eligible moves. Both zombies choose using the **old human position**. No retraining, exact-solver shield, extra horizon, memory, new seed or model selection.

Board 10×7; same-cell/cardinal adjacency captures, initial contact before movement; simultaneous steps; zombies can overlap. Runs stop on capture, first repeated ordered `(Z1,Z2,H)` positions, or unresolved cutoff 10,000, in that order. A recurrence proves infinite repetition for this deterministic memoryless policy; the playback endpoint is not physical stopping.

Protocol committed before evaluation: `787254a5abc17064748c65dbdeba00a87fda5d24`, based on `ec48b246de1b10822634827a3289470a8be457fc`. Final epoch-40 model SHA256 `c2c007bcb27c68e7f52d61d8e21c3d2003c7331ccb16b84aa46adef87de48275`. The first run truthfully records a dirty implementation worktree with per-file source hashes, not a clean release identity. CI regenerates from the committed source and checks all deterministic rows/witnesses against the [first-run digests](../evidence/one-tick/deterministic-freeze.json); it does not replace original timing measurements.

## Original benchmark: all 4,761 identical starting IDs

Z1 fixed at (2,4); H and Z2 vary, excluding initial H overlap with either zombie but including cardinal contact. This historical slice is **not wholly held out**: 3,809 train / 612 validation / 340 test-group starts. Exactly avoidable: 4,217. Initial contact: 502 (no policy can act). Noninitial unavoidable: 42.

| Policy | Captures | Proven cycles | Unresolved | Avoidable captures |
|---|---:|---:|---:|---:|
| Greedy | 4,761 | 0 | 0 | 4,217 |
| Depth 1 | 568 | 4,193 | 0 | 24 |
| Depth 2 | 568 | 4,193 | 0 | 24 |
| Unchanged neural | 880 | 3,881 | 0 | 336 |
| One-tick filtered neural | 574 | 4,187 | 0 | 30 |

Initial contact accounts for 502 captures in **every** row. Both neural variants also capture all 42 noninitial unavoidable starts.

### Paired comparison, not just matching aggregate totals

| Comparator → filtered | Avoidable captures recovered as cycles | Comparator cycles newly captured | Retained cycles | New unresolved on cycles | Criterion |
|---|---:|---:|---:|---:|---|
| Unchanged neural | 306 | 0 | 3,881 | 0 | Met |
| Depth 1 | 6 | 12 | 4,181 | 0 | Not met |
| Depth 2 | 16 | 22 | 4,171 | 0 | Not met |
| Greedy | 4,187 | 0 | 0 | 0 | Met |

Criterion: fewer avoidable captures and no new captures or unresolved runs on comparator cycles. The two planners' equal totals hide different sets of starts; improvements never cancel regressions. Versus unchanged neural, 574 starts capture under both, 3,881 cycle under both, and 306 change capture→cycle.

Among the 72 **noninitial both-captured** neural/filtered starts, filtered captures later on 30, at the same tick on 42, earlier on none; total delay difference +40 ticks. This is separate from cycle outcomes. Versus depth1, the 60 noninitial both-captured starts are earlier on 2 / same on 58; versus depth2, 50 are earlier on 1 / same on 49. No cycle endpoint is interpreted as a capture duration.

## Frozen held-out training split: all 37,730 starts

These configurations were excluded from ZL-011 training using unordered zombie-pair grouping, but **were already evaluated in ZL-011**. They are not a fresh untouched test set, statistical sample, or held-out trajectories. No planner sweep was performed on this expanded domain.

Initial contact: 4,639. Noninitial unavoidable: 180. Exactly avoidable: 32,911.

| Policy | Captures | Proven cycles | Unresolved | Avoidable captures |
|---|---:|---:|---:|---:|
| Unchanged neural | 7,687 | 30,043 | 0 | 2,868 |
| One-tick filtered neural | 5,163 | 32,567 | 0 | 344 |

Paired: **2,524 recoveries, zero regressions, 30,043 retained cycles**, zero unresolved. Avoidable captures reduced 88.0%. Among 524 noninitial both-captured starts, 177 captures are later / 347 same / none earlier, total +219 ticks. The filtered policy has positive finite-rank delay shortfall on 16 starts, totaling 18 ticks; this measures delay, not avoidability.

Of the 37,730 trajectories, unchanged neural visits a training group in 32,930 cases and filtered neural in 33,043; validation groups in 22,818 and 23,935 respectively. Every run starts in a test group. Full visit/unique-state/group counts are in the receipt. Holding out starting configurations does not isolate whole trajectories.

## Immediate versus delayed failures

Original domain: filtered has no first-tick captures; all 72 actionable captures are delayed. Every one of its **30 avoidable failures loses avoidability before the capture tick**. At each last decision there is no one-tick-safe action.

Expanded held-out domain: 18 first-tick captures (unavoidable starts), 506 delayed actionable captures, plus 4,639 initial contacts. All **344 avoidable failures first enter a finite-rank losing state before eventual capture**. Again, no final decision has an immediate-safe alternative. The filter does exactly its one-tick job, but choosing an immediately safe successor is not the same as preserving an infinite escape strategy.

Selected witnesses use the preregistered first-ID rules, deduplicated in source order: six starts, 155 total paired frames including both initial and stopping endpoints. `z2-0-h11` is the first neural recovery; `z2-0-h20` the first remaining avoidable filtered capture and a regression against both planners; `z2-5-h3` recovers failures of both planners. These are explanatory examples, not representative sampling. Replay can inspect every original ID; non-witness endpoint coordinates are recomputed, not authenticated by stored frames.

## Cost: measured, not assumed

Original host: Apple M4, macOS arm64, Node v26.8.1. Same-realm uncached choices on the same 256 nonterminal states, 3 warmups and 11 timed batches, rotating four-policy order. Loop/call/checksum overhead is measured separately, not subtracted. Median microseconds per decision:

| Policy | µs/decision |
|---|---:|
| Unchanged neural | 2.815 |
| Filtered neural | 6.060 |
| Depth 1 | 0.416 |
| Depth 2 | 1.959 |
| Loop/call/checksum overhead | 0.012 |

The filter was **slower**, not a speed replacement, in this implementation and host. Its implementation calls the existing neural choice routine to retain validation/terminal behavior and then obtains logits for filtering; these costs, production successor generation and score masking are all included. Raw times/min/max are retained. CI hardware measurements are separate and cannot select a different model or overwrite this result. **New training cost: zero.**

First sweep elapsed 12.648 s; supervised command elapsed 12.796 s. First sweep peak RSS before serialization: 191.188 MiB. Three result exports total 18,772,369 bytes (below the 30 MB unique-result target); small receipts/source/screenshots are additional. Release receipts additionally measure peak RSS after serialization, enforce 512 MiB, and retain actual source identity. Temporary preview/download copies are not extra independent scientific datasets. Existing runtime, shared Git history and legacy artifacts are not charged as new experiment data.

## Verification and reproduction

An independent fresh Hermes session (`20260915_224046_879c81`) wrote a coordinate-sign pursuit oracle from the protocol and legacy physics, without opening new implementation/results. It was frozen before the first real run; its nine literal test groups passed. Reference SHA256 `1b81902c0aa2109f5c382b2b71fbbdd0650587566f41797e33c1f6de532802a9`.

The first full evaluation checked all 343,000 terminal flags, **300,212 nonterminal filtered decisions**, **1,351,892 legal successors/capture flags/retained masks**, and exact-rank equations. Production/reference stream SHA256 both `560b4dbf49b583af202138e16edee4bfdee9f3b7c945c53518852e4d140410d0`. All 99,265 evaluated policy/start runs matched uncached production replay (2,137,999 frames); 84,982 neural/filtered runs also matched independent-transition/action-table replay. All 14,283 historical planner outcome rows matched. The unchanged logits retain ZL-011's prior cross-language validation; this oracle independently checks filtering and dynamics, not neural arithmetic.

Policy tests exercised unsafe-high-score rejection, all-unsafe fallback, first ties, borders, initial terminal states, hypothetical-clock independence and failure bookkeeping. Fixture builder/export tests and first-run deterministic artifact/classic-script parity checks passed. The existing core, preview, sweep/view, comparison, proof, planning/view, two-zombie/view, avoidability and independent Python checker test commands passed. Browser and candidate-review receipts accompany release verification; these build tests alone do not certify publication.

```sh
node --test scripts/test-one-tick.cjs scripts/test-one-tick-release.cjs
# Linux: independent OS timeout; existing Node only, no training/install
 timeout 890s node --max-old-space-size=384 scripts/build-one-tick.cjs --out-dir /tmp/zl012
ZL012_DATA=/tmp/zl012/one-tick.json node --test scripts/test-one-tick-release.cjs
ZL012_DATA=/tmp/zl012/one-tick.json node scripts/test-one-tick-view.cjs
```

On macOS use an existing Python `subprocess.run([...], timeout=890)` supervisor in place of GNU `timeout`; the evaluator also has a VM watchdog of 840 s. Serve/download the built preview for browser verification, or open its packaged `one-tick.html` offline. See `one-tick-evaluation.json` in that build for actual commit/source/artifact hashes and host measurements. The preservation test covers 216 protected historical files byte-for-byte; workflow packaging and README navigation are the only modified legacy files.

## Interpretation and limits

A small model-based immediate safety check repairs most network failures in this exact deterministic toy world. It does not make the learned policy uniformly better than one- or two-tick planners, eliminate multi-step errors, or establish any claim about general intelligence or real human behavior. No next experiment, training run, or deeper shield is implied by this result.
