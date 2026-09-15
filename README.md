# Zombie Lab

## ZL-010 — Which captures are avoidable?

[Exact-solver replay](https://14-tr.github.io/zombie-lab/avoidability.html) · [Protocol](experiments/ZL-010-protocol.md) · [Report](experiments/ZL-010-avoidability.md)

The complete ordered-position graph separates safe strategies from unavoidable capture under the **same deterministic zombie rules**. For the 4,761 earlier starts: 502 begin in contact, 42 others cannot avoid capture, and 4,217 admit indefinite avoidance. Each short-horizon planner fails on 24 avoidable starts; all 30 planner disagreements are avoidable. This is an exact control benchmark, not a trained model or a claim about general intelligence.

Using existing Node 22+ and Python 3 (no install):

```sh
node scripts/test-avoidability.cjs
python3 -B scripts/test-avoidability-checker.py
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-avoidability.cjs --out-dir preview
python3 -B scripts/check-avoidability.py preview/avoidability-certificate.json --out-dir /tmp/zl010-check
ZL010_DATA=preview/avoidability.json node --test scripts/test-avoidability-view.cjs
cp two-zombies.js avoidability.html avoidability-view.js preview/
mkdir -p preview/experiments
cp experiments/ZL-010-protocol.md experiments/ZL-010-avoidability.md preview/experiments/
```

Open `preview/avoidability.html`; generate prior pages below for historical navigation. Public links become available after deployment. The JSON certificate contains every state rank; the independent Python checker validates every legal action, not just selected replays.

## ZL-009 — Two independent zombies

[Three-policy comparison](https://14-tr.github.io/zombie-lab/two-zombies.html) · [Frozen protocol](experiments/ZL-009-protocol.md) · [Results](experiments/ZL-009-two-zombies.md)

Zombie 1 starts at `(2,4)`; vary the human and zombie 2 across 4,761 legal arrangements. Compare greedy, one-tick and two-tick policies at identical starts. Both zombies chase independently and may overlap; either can capture. This is a **fixed-Z1 slice**, not an exhaustive study of all three-agent configurations. Initial contact is reported separately. A policy getting caught is not proof that capture was unavoidable.

Using an existing Node 22+ (no installation):

```sh
node scripts/test-two-zombies.cjs
node scripts/test-two-zombies-view.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-two-zombies.cjs preview
cp two-zombies.js two-zombies.html two-zombies-view.js preview/
mkdir -p preview/experiments
cp experiments/ZL-009-two-zombies.md experiments/ZL-009-protocol.md preview/experiments/
```

Open `preview/two-zombies.html`. Generate the older pages below to enable historical navigation. Shared playback distinguishes capture from first-repeat cycle endpoints; JSON contains all policy outcomes. Public links update only after successful deployment.

## ZL-008 — Does this planning policy help?

[Same-start policy comparison](https://14-tr.github.io/zombie-lab/planning.html) · [Preregistered protocol](experiments/ZL-008-protocol.md) · [Result report](experiments/ZL-008-lookahead.md)

Compare the frozen greedy human with a model-based two-tick planner from the **same** starting pair. Only the experimental human policy changes; the original simulation, zombie policy, board and capture rules remain fixed. The planner has an accurate model of zombie behavior. This tests that specific policy package, not intelligence generally or planning depth in isolation.

The viewer distinguishes later capture, earlier capture, equal capture time, proven non-capturing cycles, and unresolved cutoffs. A cycle is not a large capture time; its first repeated endpoint is displayed and frozen honestly. Outcome totals come from every allowed starting pair, not the selected demonstration.

With an existing Node 22+ and no package install:

```sh
node scripts/test-planning.cjs
node scripts/test-planning-view.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-planning.cjs preview
cp simulation.js planner.js planning.html planning-view.js preview/
mkdir -p preview/experiments
cp experiments/ZL-008-lookahead.md experiments/ZL-008-protocol.md preview/experiments/
```

Open `preview/planning.html`; `planning.json` contains the full paired scalar results. Build the previous preview pages using their commands below to enable the historical navigation links. Public URLs update after successful main deployment, not local generation.

## ZL-007 — Understand starting-position effects

[Compare two starts](https://14-tr.github.io/zombie-lab/compare.html) · [Explanation and certificate method](experiments/ZL-007-start-position-effects.md)

Start with the preset human positions `(1,0)` versus `(2,0)`, zombie `(2,4)`. Both capture, but at ticks 11 and 73. The synchronized timeline holds a captured run at its actual endpoint while the other continues. Capture-time colors reveal duration; the sensitivity map shows the largest absolute time difference to a legal cardinal neighboring human start while holding the zombie fixed. It is a local difference, not a probability or derivative.

Build the sweep as below, then run `node scripts/test-compare.cjs`, `node scripts/test-proof.cjs`, and `PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-proof.cjs preview`; copy `compare.html compare-view.js` into `preview/` alongside the existing assets, copy the report into `preview/experiments/`, and open `preview/compare.html`. `proof.json` records a finite-state rank certificate for this exact simulation. New public assets are available only after successful deployment.

## ZL-005 — Previous two-start integration

One human, one zombie, deterministic simultaneous movement. The current replay combines the position comparison from main with PR4's production adjacent-capture rule. **Both runs use adjacency capture:** control H `(7, 2)`, treatment H `(6, 2)`, Z `(2, 4)` in both. Only `human.x` differs between the two current initial states. This is a **new combined integration**, not a relabeling of either original one-factor experiment. See [ZL-005 results and reproduction](experiments/ZL-005-position-adjacency.md).

## ZL-006 — All starting positions

[All-starts explorer](https://14-tr.github.io/zombie-lab/sweep.html) · [Experiment report](experiments/ZL-006-all-starts.md)

The sweep holds the current production rules fixed and enumerates all 4,830 ordered human/zombie starts on the 10×7 board, excluding only same-cell starts. Initially adjacent pairs count as capture at tick 0. Select a zombie start, inspect the human-start heatmap, and select a condition for its full position replay. This is exhaustive coverage of this finite configuration, not a statistical sample of general human behavior.

Build with an existing Node 22+ (no install):

```sh
node scripts/test-sweep.cjs
node scripts/test-sweep-view.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-preview.cjs preview
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-sweep.cjs preview
cp sweep.html sweep-view.js simulation.js preview/
```

Open `preview/sweep.html`. Full sweep outcomes are in `preview/sweep.json`; trajectories are reconstructed on selection rather than bulk stored. PR artifacts include both the explorer and previous comparison. Public URLs update only after a successful main deployment.

## Launch and manual controls

Open `index.html` directly in a modern browser, keeping `simulation.js` and `app.js` beside it. No install, server, account or network is needed. **Step** advances one tick; **Reset** restores the initial world. Tab and Enter/Space work on native buttons. The blue H circle and red Z square have text coordinates and decision explanations; shared-cell agents are drawn side-by-side.

The manual app keeps H `(7, 2)`, Z `(2, 4)` and its **40-tick cap**. It reaches that limit, not capture. The two-condition comparison is the generated offline replay, not a new manual-app mode.

## World and production rules

- Bounded 10×7 grid; no obstacles or wrapping. Integer coordinates; `(0, 0)` at top-left, x right, y down.
- Legal actions: north, east, south, west or stay, at most one cell per tick.
- Both choose from the **same old state**. Human maximizes Manhattan distance to the old zombie; zombie minimizes distance to the old human. Ties keep the first legal action in **north → east → south → west → stay** order; moves resolve simultaneously.
- Capture means a **shared cell or orthogonally adjacent cells**, Manhattan distance ≤1, **not diagonal**. Check before movement (including tick 0) and after simultaneous movement. Initial contact consumes no tick, with `already in shared cell` or `already orthogonally adjacent`. Post-move reasons remain `shared destination`, `exchanged positions`, or `orthogonally adjacent`. Legal one-cell swaps already start adjacent and are caught by the pre-check.
- Capture precedes the tick limit; terminal states cannot advance. `simulation.js` is unchanged from PR4 during integration; no policies, randomness, memory, speeds or population were added.

## Actual combined results

Both extended runs copy production `initialState()` into separate Node VM contexts, set the common experiment-only `tickLimit: 10000`, and change only treatment `human.x` to 6.

| Condition | Initial H / Z | Executed outcome | Endpoint H / Z | Frames |
| --- | --- | --- | --- | --- |
| Control | `(7, 2)` / `(2, 4)` | Capture at tick **73**, `orthogonally adjacent` | `(0, 6)` / `(1, 6)` | **74**, ticks 0–73 |
| Treatment | `(6, 2)` / `(2, 4)` | Capture at tick **73**, `orthogonally adjacent` | `(0, 6)` / `(1, 6)` | **74**, ticks 0–73 |

No earlier capture or repeated ordered position pair occurs. Positions differ initially, then coincide from tick 11 through capture; incoming decisions at tick 11 still differ. Each trajectory was independently recomputed from production stepping, not assumed equal. These are two deterministic conditions, not independent statistical samples. This neighboring start changes the transient but not the observed capture outcome/timing under the current rule. No general survival, intelligence, probability or significance claim follows.

## Build, replay and data contract

With an already-installed Node 22+:

```sh
node test-node.cjs
node scripts/test-preview.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" \
PREVIEW_REF="$(git branch --show-current)" \
PREVIEW_REPOSITORY="14-TR/zombie-lab" \
node scripts/build-preview.cjs preview
```

Use a clean, reviewed commit for commit-only metadata. For an uncommitted merge, label `PREVIEW_COMMIT` with both parents and `uncommitted integration`; the builder preserves supplied text and does not certify checkout cleanliness.

The optional first argument overrides `PREVIEW_OUTPUT_DIR`; otherwise output is `preview/` in the working directory. Exactly three files are generated:

- **`index.html`**: self-contained replay, side-by-side control/treatment starts and outcomes. Canvas, Play/Pause, Back/Next, scrubber and complete table show **treatment**. Playback selects recorded frames at four per second, not simulation steps. Playing at the endpoint restarts; stepping/scrubbing pauses.
- **`positions.json`**: preserves `schemaVersion: 2`, `metadata: { commit, ref, repository }`, top-level treatment `frames` and `outcome`, `control: { initialState, outcome, frames }`, and `treatment: { initialState, outcome }`. Every frame of **both** runs is retained. `experiment` is `{ name: "human-one-cell-west-adjacent-capture", safetyTickLimit: 10000, changedField: "human.x", playback: "treatment", captureRule: "shared-cell-or-orthogonally-adjacent-or-crossing" }`.
- **`positions.csv`**: every treatment tick, unchanged columns `tick,human_x,human_y,zombie_x,zombie_y,status,reason`.

At each frame, including tick 0 and the stopping endpoint, recording stops in priority order:

1. **Capture:** production `caught`, with exact tick and reason.
2. **Cycle:** first repeated ordered key `Hx,Hy,Zx,Zy`, reporting `startTick`, `repeatTick`, `period`, `positionKey`.
3. **Unresolved:** neither outcome by the inclusive tick-10000 safety boundary; not proof of survival.

Outcomes retain `{ type: "capture", tick, reason }`, `{ type: "cycle", startTick, repeatTick, period, positionKey }`, or `{ type: "unresolved", tick, reason: "safety tick limit" }`. Production snapshots, decisions, status and reason are not rewritten; cycle is a runner outcome, not a fabricated production status. Capture beats cycle, and both beat safety even on tick 10000. A repeated-position proof assumes fixed deterministic memoryless movement, not future time-dependent or learned rules.

Metadata defaults are commit `unknown`, ref/repository empty. Hostile metadata is escaped in embedded JSON and rendered as text. Same source and metadata produce byte-identical exports. Builds reject missing/skipped ticks, unknown statuses and premature limits, with a one-second VM timeout for loading, initialization and each step. Malformed or nonprogressing runs fail before output is written.

## Verification and boundaries

`node test-node.cjs` tests core rules only, not Canvas/DOM. Open `tests.html` for the browser suite. Core retains exhaustive paired starts on all 1×1 through 4×4 rectangular boards, purity, determinism, illegal moves, adjacency/diagonal rules and terminal precedence. Preview tests retain full production trajectory equality, CSV quoting, hostile metadata, determinism, output paths, bounded execution and synthetic capture/cycle/unresolved boundary coverage. Fixtures only alter temporary copies, never production source.

Runtime: classic JavaScript and native Canvas, **zero package dependencies**, no persistence, telemetry or uploads. The manual app has no clock; replay has a playback timer only. Existing optional cached browser automation is verification tooling, not a runtime dependency. No new infrastructure or installs are required. Historical performance measurements in `RECEIPT.md` are not new integration benchmarks.

Existing CI metadata inputs and workflow files are unchanged. PR workflows produce downloadable artifacts; a PR artifact is not automatically the [public main Pages replay](https://14-tr.github.io/zombie-lab/). Local verification does not certify CI, deployment, cross-browser or assistive-technology behavior.

## Historical experiments — immutable source-bound snapshots

- [ZL-003: human one cell west](experiments/ZL-003-position.md), with [`evidence/position/`](evidence/position/), records the old shared-cell/crossing rule: both runs cycle 88→102, period 14. It is **not** the current runtime result.
- [ZL-004: adjacent capture](experiments/ZL-004-adjacent-capture.md), with [`evidence/adjacent/`](evidence/adjacent/), records the original H `(7, 2)` capture-only intervention against its pinned baseline: capture at 73.

These reports, source hashes, receipts and replay bytes are retained unchanged. Their branch/deployment statements and reproduction commands describe their original source snapshots; do not rerun those commands into the historical evidence directories from the integrated checkout. Use a fresh output directory and the ZL-005 report for current reproduction. `RECEIPT.md` remains the older ZL-001 baseline receipt. See `GOAL.md` for expansion gates.
