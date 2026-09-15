# ZL-010 — Exact human avoidability

## Result

**Capture is avoidable in 24 of the 66 noninitial captures of each lookahead policy.** The other 42 are unavoidable under every legal human policy in this exact world. All 30 starts where depth1 and depth2 disagree are avoidable. Equal legacy outcome totals therefore conceal different policy mistakes; neither lookahead policy is an exact solver.

The complete ordered state graph has **298,396 winning states**, **42,788 initial-contact states**, and **1,816 other losing states**. A complete rank certificate covers all **343,000 states** and **1,351,892 legal nonterminal actions**. These are exhaustive finite-state computational results for the frozen deterministic two-zombie dynamics, not claims about learned intelligence, human behavior, adversarial pursuers, or statistical confidence.

[Preregistered protocol](ZL-010-protocol.md) · [Selected replay](../avoidability.html) · [All results and witnesses](../avoidability.json) · [Complete rank certificate](../avoidability-certificate.json)

## Question, control and source identity

Question: which ZL-009 captures reflect the tested human policy rather than unavoidable capture? The [protocol](ZL-010-protocol.md) was committed at `7cb59fe`, based on `a7cd186ddb3414de0e20e96e2a3c538bc8dc8103`, before this solve. No outcome-dependent changes to the protocol or production rules were made.

- The board remains 10 × 7. Agents move one cardinal cell or stay, omitting out-of-bounds moves; ties traverse **N, E, S, W, stay**.
- Both deterministic zombies choose independently from the **same old human position**. They may overlap; identities remain ordered. The human sees all positions and may choose any legal action.
- Sharing a cell or cardinal adjacency captures initially or after simultaneous movement. Diagonal-only contact does not. Pairwise exchange compatibility is unchanged; a legal one-cell exchange already starts adjacent and is caught before moving.
- The only new intervention is exhaustive human control analysis. Production `two-zombies.js`, the ZL-009 builder, prior simulation/planner sources, prior evidence, and the preregistration remain unchanged. No training, dependency installation, randomness, new world variable, or policy tuning was used.
- The measured engine stage is an **uncommitted worktree based on the preregistration**, not a clean release claim. The artifacts identify that stage explicitly and bind it to SHA-256 source hashes.

## First evaluation: the 30 paired depth disagreements

The unchanged ZL-009 builder was executed first, all 4,761 legacy result rows were checked against preserved historical evidence, and each disagreement's first actual action divergence was inspected **before** the full graph solve. The builder repeats this evaluation order. There are 15 depth1-capture/depth2-cycle starts and 15 with the reverse outcomes.

**All 30 starts are in the exact winning set**, and every one has a selected certified cycle witness. The table gives the first action difference while the original depth1 and depth2 trajectories still share the same ordered position. “Decision tick” is the old tick; the action executes the transition to the next tick. Coordinates are `(x,y)`. Successor rank is the maximum remaining capture delay **from that successor**, not elapsed time from the original start.

In 15 cases, the first divergent actions already separate a winning successor from a losing one. In the other 15, **both successors remain winning**: the eventual failing policy makes a later irreversible error. First trajectory divergence must not be conflated with the first loss of avoidability.

| Start ID | Depth1 / Depth2 outcome | Decision tick | Old H; Z1; Z2 | Depth1 action → successor | Depth2 action → successor |
|---|---|---:|---|---|---|
| `z2-21-h60` | cycle / capture | 0 | (0,6); (2,4); (1,2) | stay → winning | N → rank 2 |
| `z2-50-h0` | capture / cycle | 1 | (1,0); (2,3); (0,4) | W → rank 2 | E → winning |
| `z2-50-h1` | capture / cycle | 0 | (1,0); (2,4); (0,5) | W → rank 3 | E → winning |
| `z2-50-h11` | capture / cycle | 1 | (1,0); (2,3); (0,4) | W → rank 2 | E → winning |
| `z2-50-h55` | cycle / capture | 5 | (9,6); (7,4); (5,5) | stay → winning | N → rank 2 |
| `z2-50-h57` | cycle / capture | 3 | (9,6); (5,4); (3,5) | stay → winning | N → winning |
| `z2-50-h59` | cycle / capture | 1 | (9,6); (3,4); (1,5) | stay → winning | N → winning |
| `z2-50-h64` | cycle / capture | 5 | (9,6); (7,4); (5,5) | stay → winning | N → rank 2 |
| `z2-50-h66` | cycle / capture | 3 | (9,6); (5,4); (3,5) | stay → winning | N → winning |
| `z2-50-h68` | cycle / capture | 1 | (9,6); (3,4); (1,5) | stay → winning | N → winning |
| `z2-54-h22` | capture / cycle | 2 | (2,0); (2,2); (4,3) | E → rank 1 | W → winning |
| `z2-60-h0` | capture / cycle | 0 | (0,0); (2,4); (0,6) | stay → winning | E → winning |
| `z2-60-h11` | capture / cycle | 2 | (0,0); (2,2); (0,4) | stay → rank 2 | E → winning |
| `z2-60-h20` | capture / cycle | 2 | (0,0); (2,2); (0,4) | stay → rank 2 | E → winning |
| `z2-60-h64` | capture / cycle | 5 | (9,6); (7,4); (5,6) | stay → rank 2 | N → winning |
| `z2-60-h65` | capture / cycle | 4 | (9,6); (6,4); (4,6) | stay → winning | N → winning |
| `z2-60-h66` | capture / cycle | 3 | (9,6); (5,4); (3,6) | stay → winning | N → winning |
| `z2-60-h67` | capture / cycle | 2 | (9,6); (4,4); (2,6) | stay → winning | N → winning |
| `z2-60-h68` | capture / cycle | 1 | (9,6); (3,4); (1,6) | stay → winning | N → winning |
| `z2-60-h69` | capture / cycle | 0 | (9,6); (2,4); (0,6) | stay → winning | N → winning |
| `z2-61-h0` | cycle / capture | 0 | (0,0); (2,4); (1,6) | stay → winning | E → winning |
| `z2-61-h11` | cycle / capture | 2 | (0,0); (2,2); (1,4) | stay → winning | E → rank 2 |
| `z2-61-h20` | cycle / capture | 2 | (0,0); (2,2); (1,4) | stay → winning | E → rank 2 |
| `z2-61-h55` | cycle / capture | 5 | (9,6); (7,4); (5,5) | stay → winning | N → rank 2 |
| `z2-61-h57` | cycle / capture | 3 | (9,6); (5,4); (3,5) | stay → winning | N → winning |
| `z2-61-h59` | cycle / capture | 1 | (9,6); (3,4); (1,5) | stay → winning | N → winning |
| `z2-61-h66` | cycle / capture | 2 | (8,6); (4,4); (3,6) | E → winning | N → winning |
| `z2-61-h68` | cycle / capture | 0 | (8,6); (2,4); (1,6) | E → winning | N → winning |
| `z2-65-h22` | capture / cycle | 3 | (3,0); (2,1); (5,3) | E → rank 1 | S → winning |
| `z2-65-h33` | capture / cycle | 3 | (3,0); (2,1); (5,3) | E → rank 1 | S → winning |

The machine-readable `summary.depthDisagreements.cases` retains both complete legacy outcomes, the exact old frame/state index, action/destination, successor index, and successor avoidability/rank for every entry. No outcome was inferred from a different start or merely from aggregate counts.

## Complete ZL-009 slice: impossibility versus policy failure

The graph is complete over all agent positions; this evaluation table uses the original, narrower initial slice: zombie1 fixed at `(2,4)`, zombie2 IDs 0–69, human IDs 0–69; exclude human overlapping either zombie initially. Zombie overlap is permitted. Order and IDs are exactly those of the unchanged builder.

| Start class | Count | Meaning |
|---|---:|---|
| Initial contact | 502 | Capture at tick 0; no decision opportunity |
| Noninitial unavoidable capture | 42 | Every legal human policy captures; finite maximum delay |
| Avoidable | 4,217 | A certified stationary human strategy stays safe forever |
| **Total** | **4,761** | Complete frozen fixed-zombie1 slice |

| Legacy policy | All captures | Cycles | Avoidable captures | Noninitial unavoidable captures | Initial captures |
|---|---:|---:|---:|---:|---:|
| Greedy | 4,761 | 0 | 4,217 | 42 | 502 |
| Depth1 | 568 | 4,193 | 24 | 42 | 502 |
| Depth2 | 568 | 4,193 | 24 | 42 | 502 |

All legacy runs resolved as capture or first position recurrence; none is an unresolved cutoff. Depth1 and depth2 share **9 avoidable capture starts** and each has **15 additional avoidable captures** where the other cycles. Thus each has the same 24-start gap from exact avoidability, but the gaps are not the same set. The frozen JSON retains all three original result objects (`outcome`, `stopTick`, `cycleStart`, **`period`**) unchanged for all starts.

## Capture-delay shortfalls — finite-rank captured starts only

For an unavoidable start, `shortfall = maxCaptureTicks − legacy capture tick`. This is a maximum-delay comparison, not a survival-rate comparison. No cycle-detection tick is subtracted from a capture time. The denominator is 544 finite-rank captured starts per policy, including 502 tick-zero cases whose shortfall is zero; the separate actionable denominator is 42.

| Policy | Noninitial finite-rank captures | Positive shortfalls | Sum of lost ticks | Largest shortfall | Mean over the 42 actionable starts |
|---|---:|---:|---:|---:|---|
| Greedy | 42 | 10 | 21 | 4 | 21/42 = 0.5 ticks |
| Depth1 | 42 | 1 | 1 | 1 | 1/42 ticks |
| Depth2 | 42 | 1 | 2 | 2 | 2/42 ticks |

- Largest greedy shortfall: `z2-10-h31`, captured at tick 1 versus maximum delay 5.
- The only positive lookahead shortfall is `z2-10-h60`: maximum delay 5, depth1 capture tick 4, depth2 capture tick 3. Additional horizon is not monotonically better even for delay in this world.
- All remaining unavoidable captures attain maximum delay; initial-contact ties do not measure decision quality.
- Summary histograms include all finite-rank captured starts. The local receipt `capture-delay-shortfalls.json` enumerates every such policy/start comparison; every value is also derivable from the public results and certificate.

## Certificate construction and meaning

The state index is `((z1*70 + z2)*70 + h)`, with each cell `y*10+x`. The domain includes overlapping human/zombie terminal states and colocated zombies, so it is closed under every legal action, not just trajectories of an existing policy.

For each nonterminal state, the generator obtains both fixed zombie destinations from unchanged production `ZombiePair.step(state,"greedy")`, then passes each legal human destination with those same old-state zombie choices to unchanged `ZombiePair.resolveTick`. Greedy's human destination is **not** imposed on the graph. Every successor is checked in bounds and every capture endpoint checked to be positional contact. Initial contact is checked against production without consuming a tick.

1. Seed every contact state at rank 0.
2. Use reverse-edge predecessor counts to mark a nonterminal losing only after **all its action successors** have finite ranks; duplicate endpoints are still counted per action.
3. Assign `rank(s) = 1 + max(rank(successor))`. Remaining states receive −1, meaning winning.
4. For winning states choose the first winning successor in frozen action order. For losing states choose the first maximum-rank successor. Terminal states choose no action.
5. Verify all states/actions internally: contact iff rank 0, complete legal-action coverage, successor closure, every losing action strictly descends, the exact maximum-rank equation, a winning successor at every winning state, and canonical first-tied choices.

For losing states, **every** action strictly reduces rank, so even a history-dependent policy cannot escape indefinitely; the selected maximum-delay action reduces rank by exactly one and attains the bound. For winning states, the selected stationary strategy stays in a noncontact controlled-invariant set, hence is safe forever. A displayed cycle follows that certified strategy to its first repeated ordered position, including the repeated endpoint.

The graph has **no simulation-tick cutoff**. One-step graph evaluation resets reporting clock fields to tick 0 before production's cap; selected witness replay disables that cap and ends only at capture or first recurrence. The bound of one more frame than the complete state count is a finite-state invariant assertion, not an unresolved-survival classification. A separate 840,000 ms wall-clock watchdog aborts computation rather than labeling an unfinished solve safe.

| Rank | State count |
|---|---:|
| 0 | 42,788 |
| 1 | 206 |
| 2 | 264 |
| 3 | 336 |
| 4 | 408 |
| 5 | 418 |
| 6 | 86 |
| 7 | 52 |
| 8 | 36 |
| 9 | 10 |
| −1 (winning) | 298,396 |

Maximum finite rank is 9 over the full graph and 8 over the original fixed-zombie1 slice. These are maximal capture delays where capture is unavoidable, not bounds on how long an arbitrary failing policy can remain in the winning region before making a mistake.

## Selected production witnesses

The frozen selection contains 32 unique IDs in result order: all 30 disagreements, the first avoidable legacy capture, and the first noninitial unavoidable capture. There are 31 cycle traces and one maximum-delay capture trace, with **734 frames and 702 transitions**. Every initial and stopping/repeated endpoint is present; these are deterministic inspection selections, not representative samples.

- `z2-0-h2`: first avoidable legacy capture. Greedy captures at tick 71; the exact selected strategy first repeats at tick 22, cycle start 20, period 2.
- `z2-0-h30`: first noninitial unavoidable capture. Maximum delay is 5, and the selected trace captures at tick 5. All three legacy policies also attain 5 here; this witness shows impossibility, not suboptimal delay.
- `z2-21-h60`: first depth disagreement. The selected strategy first repeats at tick 9, cycle start 7, period 2. At tick 0, depth1 stays in the winning set while depth2 moves north into rank 2.

The generator validates selected successors against actual production as it replays. A separate local receipt re-enumerated production candidates from the serialized ranks, without using the generated edge table: **702 selected transitions, 3,003 candidate transitions, 734 frames**, all matching. Per-witness frame hashes are retained in `metrics.json`.

## API and artifact contract

`require('./scripts/build-avoidability.cjs')` exports:

- `buildAvoidability({commit?})`: returns the frozen data object directly: `{schemaVersion:1,metadata:{commit,sourceHashes},summary,results,witnesses}`.
- `solveGraph()`: returns typed `ranks`, `successors`, `terminals`, `chosenActions`, plus summary, internal verification and resource measurements. Successor slot is `stateIndex*5+actionIndex`; −1 means illegal/no terminal action.
- `buildArtifacts({commit?})`: returns `{data,certificate,verification,resources}` in one solve, for integration without redundant graph computation.
- Focused test helpers: `assignControlledRanks`, `verifyGraph`, `traceStrategy`, `withWatchdog`.

The CLI writes only `avoidability.json`, `avoidability-data.js` assigning **`window.ZL_AVOIDABILITY_DATA`**, and `avoidability-certificate.json`. The certificate stores all 343,000 integer ranks as a plain JSON array; metadata/source hashes and graph summary accompany it. Result rows preserve legacy **`period`** while ZL-010 witnesses use **`cyclePeriod`**, exactly as preregistered. Browser serialization escapes HTML-sensitive characters and line separators. Neighboring destination files are not cleaned or copied over.

## Validation and measured cost

Six source-bound RED → GREEN stages are preserved under `/tmp/zl010-engine/tests/`: full production domain; controlled ranks/ties; corruption checks and traces; all legacy rows/shortfalls; disagreements and complete witnesses; complete artifacts and watchdog. The final engine suite passes **10 tests**. Unchanged core/two-zombie/planning/sweep/proof regression suites pass **33 Node test entries**, including the core runner's 13 individual checks.

Tests cover the complete 343,000-state domain, all legal-action slots, exact rank equations and first-tied action choices; labeled synthetic cycle/duplicate-edge/max-delay fixtures; malformed/incomplete/corrupted ranks and strategies; actual production witness transitions; every legacy row and shortfall; all 30 first action divergences; complete certificate serialization; safe browser globals; argument errors; output neighbor preservation; and an actually interrupted synchronous infinite loop proving the watchdog.

Measured on local Node `v26.8.1`, with no installations:

| Measurement | Observed |
|---|---:|
| Complete CLI wall time | 9,935.419 ms |
| Graph construction, solution and internal check | 4,554.729 ms |
| CLI user / system CPU | 10,124,094 / 37,442 µs |
| CLI peak RSS | 137,616 KiB (134.390625 MiB) |
| CLI current RSS at receipt | 140,918,784 bytes |
| Graph typed-array workspace allocations | 20,156,572 bytes |
| JSON results | 1,887,461 bytes |
| Browser data script | 1,887,492 bytes |
| Complete rank certificate | 985,208 bytes |
| All three generated artifacts | 4,760,161 bytes |
| Final engine suite | 29,027.138 ms |

The graph workspace number includes forward/reverse edges, ranks, strategy, counters and queue; RSS also includes VMs, transient witness arrays, legacy results and serialization. Actual peak RSS is below the 512 MiB bound and generated artifacts below 30 MB. The complete API/CLI watchdog is 14 minutes; legacy evaluation retains its unchanged 120-second VM watchdog. These are measured computation costs, not simulation-duration claims.

## Reproduce and inspect evidence

```sh
node --max-old-space-size=256 --test scripts/test-avoidability.cjs
node --test test-node.cjs scripts/test-two-zombies.cjs scripts/test-planning.cjs scripts/test-sweep.cjs scripts/test-proof.cjs
PREVIEW_COMMIT='<actual source identity>' node --max-old-space-size=256 scripts/build-avoidability.cjs --out-dir preview
```

Local engine-stage handoff: `/tmp/zl010-engine/outputs/`, `build-metrics.json`, `metrics.json`, `capture-delay-shortfalls.json`, `verification.json`, `pre-solve-disagreements.json`, `source/`, and source-bound `tests/` RED/GREEN and regression receipts. This temporary path is not a publication or live-deployment claim. The parent owns preservation of those receipts in the integrated delivery.

Measured source identities:

| File | SHA-256 |
|---|---|
| `two-zombies.js` | `ae62cc4ed7d4fb465a97827c0da34eb191005afc3de6c1c0185b163b00fc3243` |
| `scripts/build-two-zombies.cjs` | `5a5a403b30a0ba1242a0411ff6aee769d787a86d277e1e3cf11d160f69f965c2` |
| `scripts/build-avoidability.cjs` | `3695964bf1f7a71094f3cd795b264cde5a0d3faa76418c7eaad348e4ca36ace1` |
| `scripts/test-avoidability.cjs` | `e1762879442911adaa566577fe5ca7a4f61ebcfd8bcd61d3ac1563bdd5dba858` |
| `experiments/ZL-010-protocol.md` | `c809145e263e8f360b587b16a25183bcf3e55f21cdffad0a713212baa9757f33` |

Artifact hashes are in `verification.json`; source snapshots identify the exact measured worktree. Internal graph checks and selected production replays are **not a substitute for the separately implemented complete checker**. Independent checker, review, browser/package/CI, merge and live Pages verification remain parent-owned delivery gates and are not claimed complete by this engine-stage report.

## Interpretation limits

The graph is exhaustive only for this fixed board, full observations, deterministic frozen zombies, legal action set, ordering and contact rules. The 4,761-row policy comparison is a named initial slice of that graph, not the whole graph's distribution. A winning classification proves existence of a legal safe strategy, not that arbitrary choices are safe; a losing rank proves eventual capture and its attainable maximum delay, not that every policy captures at the same tick. No comparison to learned policies was conducted, and nothing here establishes a requirement for recurrence, training, increased horizon, or a neural model.
