# ZL-009 — two independent zombies

## Result

On the frozen **fixed-Z1 slice**, the model-based one-tick and two-tick human policies each reach a certified noncapturing cycle from **4,193 of 4,761 starts**; greedy is captured from every start. Increasing the horizon from one tick to two does **not** improve the aggregate outcome count: it changes 15 starts from capture to cycle and a different 15 from cycle to capture. Equal totals therefore do not mean identical outcomes or trajectories.

This is a comparison of three specified deterministic policies, not a claim that capture under one of them is unavoidable. No training, randomness, additional dependencies, or policy tuning after observing the results was used.

## Question, control, and frozen intervention

Question: does model-based human planning still enable avoidance against two independent greedy pursuers? The preregistration made no assumption of benefit. The [protocol](ZL-009-protocol.md) was frozen at commit `39bfd229fa20154512a154b7e499edbc954fda21`, based on `0b6756dcc20255ce627a37dbc0be15f71980bc1f`, before outcome execution.

- Board: 10 × 7. Every agent moves at most one cardinal cell per tick, or stays. Ordered action traversal/ties: north, east, south, west, stay; out-of-bounds moves omitted.
- Zombie 1 initially fixed at `(2,4)`, cell ID 42. Enumerate zombie 2 IDs 0–69, then human IDs 0–69; exclude human ID 42 and human equal to zombie 2. Zombie overlap is allowed. Exactly 4,761 starts per policy, 14,283 runs.
- The zombies independently minimize Manhattan distance to the **same old human position**. Neither blocks, coordinates with, nor excludes the other. They retain ordered identities.
- Either zombie captures at shared-cell or cardinal-adjacent contact, initially or after simultaneous movement. Diagonal-only contact is not capture. Pairwise exchange compatibility is retained; legal one-cell exchanges already start adjacent, so initial capture takes precedence.
- Real cap: 10,000 ticks. Classification precedence: capture, first repeated ordered `(human, zombie1, zombie2)` positions, unresolved cap. The first repeated endpoint is included. Production states remain `running`, `caught`, or `limit`; cycle is a runner classification, not a fabricated capture/status.

| Human policy | Frozen decision rule |
|---|---|
| `greedy` | Maximize minimum Manhattan distance from candidate human position to the two **old** zombie positions. First exact tie wins. |
| `depth1` | Enumerate legal one-transition human sequences with the exact old-state zombie model. Maximize completed noncapturing transitions, then minimum endpoint distance to either zombie. First depth-first exact tie wins. |
| `depth2` | Identical model, score, ordering, and replanning, but enumerate up to two transitions. Stop captured branches immediately and score their actual endpoints. |

For both model policies the hypothetical clock is copied/reset to tick 0 with cap 10,000; the real remaining cap does not shorten the planning horizon. Only the chosen first action executes, followed by replanning. Greedy versus either model policy changes **both prediction and scoring**. Only depth1 versus depth2 isolates additional lookahead.

## Complete outcomes and initial-contact separation

The 502 initial-contact starts capture at tick 0 for all three policies; neither policy has an opportunity to act there.

| Policy | Capture, all starts | Certified cycle | Unresolved | Capture among 4,259 noninitial-contact starts |
|---|---:|---:|---:|---:|
| Greedy | 4,761 | 0 | 0 | 4,259 |
| Depth 1 | 568 | 4,193 | 0 | 66 |
| Depth 2 | 568 | 4,193 | 0 | 66 |

A cycle certificate means the same complete ordered position state recurs under the deterministic memoryless policy. It certifies repetition without capture under these exact rules, not safety against another pursuer or human policy.

### Paired contingency matrices

Every cell counts **identical starting IDs**, not an unpaired comparison of totals. Rows are policy A; columns are policy B. Initial-contact cases are included here.

**A = greedy, B = depth1**

| A outcome / B outcome | Capture | Cycle | Unresolved |
|---|---:|---:|---:|
| Capture | 568 | 4,193 | 0 |
| Cycle | 0 | 0 | 0 |
| Unresolved | 0 | 0 | 0 |

**A = greedy, B = depth2**

| A outcome / B outcome | Capture | Cycle | Unresolved |
|---|---:|---:|---:|
| Capture | 568 | 4,193 | 0 |
| Cycle | 0 | 0 | 0 |
| Unresolved | 0 | 0 | 0 |

**A = depth1, B = depth2**

| A outcome / B outcome | Capture | Cycle | Unresolved |
|---|---:|---:|---:|
| Capture | 553 | 15 | 0 |
| Cycle | 15 | 4,178 | 0 |
| Unresolved | 0 | 0 | 0 |

### Capture-time comparisons — both captured only

“Earlier/later” describes B's **capture tick** relative to A's capture tick. Cycle detection times are never subtracted from capture times and are not treated as survival durations.

| A → B | Both captured | B earlier | B later | Same capture tick |
|---|---:|---:|---:|---:|
| Greedy → depth1 | 568 | 1 | 12 | 555 |
| Greedy → depth2 | 568 | 1 | 11 | 556 |
| Depth1 → depth2 | 553 | 1 | 0 | 552 |

After excluding the 502 initial-contact ties:

| A → B | Both captured after acting | B earlier | B later | Same capture tick |
|---|---:|---:|---:|---:|
| Greedy → depth1 | 66 | 1 | 12 | 53 |
| Greedy → depth2 | 66 | 1 | 11 | 54 |
| Depth1 → depth2 | 51 | 1 | 0 | 50 |

### Deterministically selected inspection cases

These are the first matching rows in frozen enumeration order, **not representative samples**. The aggregate conclusions use all starts.

- First row with any policy outcome disagreement: `z2-0-h2`. Greedy captures at tick 71; both model policies repeat at tick 22, cycle start 20, period 2.
- First depth1-capture/depth2-cycle row: `z2-50-h0`. Depth1 captures at tick 4; depth2 repeats at tick 27, cycle start 25, period 2.
- First depth1-cycle/depth2-capture row: `z2-21-h60`. Depth1 repeats at tick 9, cycle start 7, period 2; depth2 captures at tick 3.
- First both-captured row with earlier depth2 capture: `z2-10-h60`. Depth1 captures at tick 4; depth2 captures at tick 3.

## Colocated-zombie reduction controls

All 69 legal human starts with both zombies initially at `(2,4)` were compared to the unchanged single-zombie implementations:

- Pair greedy against `simulation.js`.
- Pair depth2 against `planner.js` using the old simulation transition.
- Every outcome/stop tick/cycle start/period matched; every human and both zombie coordinates, tick, and production status matched frame-for-frame, including initial and stopping endpoints: **138 policy runs, 5,092 compared frames, zero mismatches**.
- Colocated results: greedy 69 captures; depth1 and depth2 each 4 initial captures and 65 cycles. Depth1 decisions are also checked against the separate test leaf enumerator, including this colocated slice.

The old control sources and the preregistration were checked byte-for-byte against the frozen commit. No old source or historical evidence was edited by this engine implementation.

## Engine API and artifact contract

`two-zombies.js` is a dependency-free classic script exporting frozen `globalThis.ZombiePair`:

- `initialState(humanId = 27, zombie2Id = 42)` returns `{width, height, tick: 0, tickLimit: 10000, human: {x,y}, zombies: [{x,y},{x,y}], status: 'running', reason: ''}`.
- `chooseHuman(state, policy)` returns a fresh `{x,y}` for `greedy`, `depth1`, or `depth2`.
- `step(state, policy)` returns the next state without mutating input coordinates; terminal normalization consumes no tick.
- `resolveTick(state, {human, zombies})` exposes legal-move/contact resolution for focused tests.

`scripts/build-two-zombies.cjs` exports `buildTwoZombies({commit?})` and `classifyRun(simulation, initial, policy)`. The builder uses **no memoization** and has a 120-second VM sweep watchdog, separate from the simulation's 10,000-tick cap. The command-line builder writes **only** `two-zombies.json` and `two-zombies-data.js` into the destination, preserves neighboring files, and safely escapes data assigned to `globalThis.ZombiePairData`.

The version-1 scalar schema, policy order, exact row order/IDs, configuration, metadata, all outcome fields, and totals match the protocol. No bulk trajectories are stored in these artifacts.

## Validation and measured resources

Strict incremental test-first receipts contain eight observed RED → GREEN cycles: initial state; resolution; greedy/simultaneous chasing; depth1; depth2; adjudication; complete sweep/control reduction; CLI serialization. The final engine suite passes all nine tests. Separate unchanged planning/sweep regression suites pass all 16 tests.

The engine suite checks:

- Initial/shared/cardinal contact, diagonal noncapture, exchange precedence, either-zombie capture, legal zombie overlap, simultaneous old-state decisions, illegal moves, purity, real cap, and capture-over-cap precedence.
- Depth1 and depth2 decisions against an independently structured iterative leaf enumerator at every nonterminal enumerated start, including traversal ties, stopped captured leaves, clock/cap variation, different-depth choices, and replanning.
- Ordered two-zombie cycle keys, nonzero cycle start, first-repeat endpoint, cycle exactly at the cap, capture-over-cycle precedence, unresolved cutoff, and malformed runner progress/positions/caps. Synthetic bookkeeping policies exercise boundary outcomes without attributing them to production.
- All 4,761 rows and 14,283 uncached trajectories; a separately structured replay adjudicator matches every classification field. The collected replay receipt accounts for **335,454 frames**, including initial and stopping endpoints, with zero classification mismatches.
- All 12,777 nonterminal initial decisions exported for parent-owned independent-oracle reconciliation.
- Safe metadata serialization, classic global loading, complete schema, output byte counts, and preservation of neighboring files.

Measured on the local Node runtime, with no installations:

| Measurement | Observed |
|---|---:|
| Complete CLI build wall time | 5,123.609625 ms |
| CLI user CPU / system CPU | 5,188,090 / 24,438 µs |
| CLI peak RSS | 79,472 KiB |
| CLI current RSS at receipt | 81,412,096 bytes |
| JSON output | 1,318,477 bytes |
| Classic data script output | 1,318,506 bytes |
| Both generated outputs | 2,636,983 bytes |
| Collection + independent uncached replay/control receipt wall time | 10,899.980125 ms |
| Receipt-process peak RSS | 87,264 KiB |
| Final nine-test suite wall time | 17,424.420708 ms |

These are measured execution costs, not hypothetical simulation durations. The exported metadata explicitly identifies an uncommitted engine worktree based on the frozen protocol commit; it is **not** a clean release-commit claim. Independent Python-oracle reconciliation and viewer/browser/CI/publication verification are parent-owned integration gates, not assertions made by this engine-stage receipt.

## Reproduction and source identity

```sh
NODE=/Users/tr/.hermes/node/bin/node
"$NODE" --test scripts/test-two-zombies.cjs
"$NODE" --test scripts/test-planning.cjs scripts/test-sweep.cjs
PREVIEW_COMMIT='<actual source identity>' "$NODE" scripts/build-two-zombies.cjs preview
```

Local engine handoff evidence is under `/tmp/zl009-engine/`: `outputs/`, `metrics.json` (all paired matrices and capture-only deltas), `verification.json` (coverage, trajectory hashes, controls, resources), `decisions.json`, `colocated-controls.json`, `build-metrics.json`, `manifest.json`, `source/` snapshots, and `tests/` RED/GREEN logs with source-bound receipts. The parent should preserve this evidence with the integrated publication; the temporary directory itself is not a public deployment.

SHA-256 identities for the measured engine stage:

| File | SHA-256 |
|---|---|
| `two-zombies.js` | `ae62cc4ed7d4fb465a97827c0da34eb191005afc3de6c1c0185b163b00fc3243` |
| `scripts/build-two-zombies.cjs` | `5a5a403b30a0ba1242a0411ff6aee769d787a86d277e1e3cf11d160f69f965c2` |
| `scripts/test-two-zombies.cjs` | `9563a9abc6c68b0d605e997cd3803ef9e587c757b04bc58c438b8da620ebc04d` |
| `experiments/ZL-009-protocol.md` | `8401922409e83724dfdbba073f57087838cbe88c74bb52367bc917b767c5866d` |
| `simulation.js` control | `4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568` |
| `planner.js` control | `ea535e5a564ca133cdcf1cfa339c359d967d7d89a64640f3e9e8bc977000cb6a` |
| Measured `two-zombies.json` | `2fbd521632beeb399d830977eefe5358472e87ef7682ccf7601e8bc02da268e7` |
| Measured `two-zombies-data.js` | `bc550060429e23acef962083bc37636ebba2a00fc73822ab465897997d049405` |

## Interpretation limits

This is the specified **fixed-Z1 initial slice**, not all possible three-agent configurations. Colocated starts are included deliberately as reduction controls. A finite first-repeat certificate is policy-specific; a policy that captures does not establish that all legal human policies must capture. The depth1/depth2 result is a matched-model/scoring horizon comparison with no net aggregate gain and opposing same-start changes. No conclusion about learned intelligence, human behavior, optimal play, real pursuit, or statistical confidence follows from this deterministic toy experiment.
