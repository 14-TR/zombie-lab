# Zombie Lab · ZL-004 adjacent-capture experiment

An atomic, deterministic human-versus-zombie experiment. One human, one zombie, one tick per click. No training or learned behavior. This isolated branch changes **capture only**, not starting positions or movement. See the [experiment write-up](experiments/ZL-004-adjacent-capture.md) for the question, executed result, control comparison, and evidence.

## Launch

Double-click **`index.html`**, or open it directly in a modern browser:

```text
file:///Users/tr/Projects/zombie-lab-capture/index.html
```

On this Mac, `open /Users/tr/Projects/zombie-lab-capture/index.html` uses the default browser. No install, build command, web server, account, or network connection is needed. Keep `index.html`, `simulation.js`, and `app.js` together.

- **Step** advances exactly one tick. There is no automatic clock.
- **Reset** restores the identical initial world and clears the decision explanation.
- Native buttons also work with Tab and Enter/Space.
- The Canvas shows a blue **H** circle and a red **Z** square. The text below it reports coordinates, tick, terminal reason, and each decision. Co-located agents are drawn side-by-side inside their shared cell so neither label hides the other.

## World and rules

| Setting | Value |
| --- | --- |
| Grid | 10 columns × 7 rows, bounded, no wrapping or obstacles |
| Initial human | `(7, 2)` |
| Initial zombie | `(2, 4)` |
| Tick limit | 40 |
| Coordinates | Integers; `(0, 0)` is top-left, x increases right, y increases down |
| Legal action | North, east, south, west, or stay; at most one cell per tick |

Both agents choose using the **same old state**. The human chooses the legal destination with greatest Manhattan distance to the old zombie position; the zombie chooses the destination with smallest distance to the old human position. Manhattan distance is `abs(x1 - x2) + abs(y1 - y2)`.

Ties keep the first legal action in **north → east → south → west → stay** order. Choices are resolved simultaneously. Capture now means **shared cell or orthogonally adjacent cells** (Manhattan distance ≤ 1), **not diagonal** contact. Check before movement, including tick 0, and after simultaneous movement. Existing adjacency is caught without consuming a tick, with reason `already orthogonally adjacent`; existing overlap reports `already in shared cell`. Post-move reasons are `shared destination`, `exchanged positions`, or `orthogonally adjacent`. The crossing check is retained, but legal one-cell swaps necessarily start adjacent and are caught before moving under this rule. Following into a vacated cell likewise cannot evade initial adjacency. Capture takes precedence over the tick limit; terminal states cannot advance.

The manual default trial still reaches the **40-tick limit**, not capture. The extended fixed-start replay below captures at **tick 73**. This is a transparent local-distance heuristic, not evidence of intelligence or general survival ability. Shared-destination and crossing compatibility are covered by explicit small fixtures; no policy or west-shift change is included.

## Small stack

**Runtime:** one HTML file (inline CSS), two classic JavaScript files, native Canvas 2D. No ES modules, fetch, package manager, framework, assets, models, API, database, persistence, telemetry, workers, timers, recurring work, or deployment. State is held only in the page's JavaScript memory; reload resets it. Browser/system fonts are used.

- `simulation.js`: pure `ZombieLab.initialState()`, `ZombieLab.step(state)`, and `ZombieLab.resolveTick(state, moves)`.
- `step` chooses both moves from the old state, then calls the same resolver tested for crossing/collision.
- `resolveTick` accepts `{human: {x, y}, zombie: {x, y}}` for testing legal explicit moves independently of policy. It rejects out-of-bounds, diagonal, fractional, and long moves. This is not a second UI mode.
- The core expects valid states: positive integer dimensions, in-bounds integer positions, nonnegative integer tick/limit, and the documented status values. No arbitrary state editor/importer is provided.
- `app.js`: read-only drawing and event-driven controls. Drawing never steps the world; snapshots do not expose mutable UI state.
- Terminal `step` may return the input object unchanged; purity means no input writes, not mandatory cloning of unchanged data.

## Run tests

Open **`tests.html`** directly from disk, or follow **Run browser tests** in the app. Reload to rerun. The page reports each result and a total. It tests core transitions plus actual browser Canvas and DOM controls.

Optional, using an already-installed Node (not an app dependency):

```sh
node test-node.cjs
```

The Node run covers core rules only. It deliberately does **not** pretend to test Canvas or DOM. Browser checks cover drawing/state independence, controls, reset and terminal stop. Exhaustive small-board checks cover all paired starting cells on every rectangular board from 1×1 through 4×4, including narrow and one-cell cases; they are regression coverage, not a proof for every possible world.

[`evidence/adjacent/`](evidence/adjacent/) contains this experiment’s actual RED/GREEN receipts, final verification, complete replay and baseline trajectories, screenshots, and verification-only scripts. The scripts reuse cached Playwright Core and Chromium supplied as arguments; they do not install anything and are not required to use the app. Reproduction commands and evidence handles are in the [write-up](experiments/ZL-004-adjacent-capture.md). `RECEIPT.md` describes the historical ZL-001 baseline, not these changed source bytes.

## Resource and verification boundaries

The source-size, benchmark, and heap observations discussed below belong to the **historical baseline receipt**, not a fresh performance measurement of this branch. Current adjacent-capture verification records zero external page requests and no failed loads or page errors in cached Chromium; no new performance claim is made.

Runtime package dependencies: **0**. Observed app page loads: **3 local files, 0 external network requests**. This count is page-scoped; it is not a measurement of all browser or operating-system traffic.

The recorded benchmark measures warmed pure ticks plus trial resets, excluding Canvas, DOM updates, painting and automation. It is a local microbenchmark, not a frame-rate or cross-machine performance claim. A CDP JavaScript-heap sample is recorded separately; isolated app/process memory, RSS, GPU memory and energy are **unavailable**, not assumed zero. Source size is not the browser's total runtime footprint.

No dependencies were installed for verification. Automated evidence uses an existing headless Chromium opened at `file://`; screenshots were generated by the real browser. Native Safari automation was unavailable in this worker session. Cross-browser testing and assistive-technology testing remain unverified. Independent source review and any local Git checkpoint belong to the lead; this worker leaves files uncommitted and performs no remote publication.

Expansion is intentionally out of scope: no additional agents, infection, resources, training, or deeper brains. See `GOAL.md` for the next decision gates.

## Fixed-start capture/cycle experiment · offline replay

The optional runner executes this branch’s **production `simulation.js`**, without injecting or replacing capture logic, using Node’s built-in VM. It copies `initialState()` and overrides **only `tickLimit: 10000`**. The start remains H `(7, 2)`, Z `(2, 4)` on the same 10×7 board, with unchanged simultaneous movement and tie-breaking. Both manual app and replay use the adjacent-capture rule above; the manual cap remains 40. No new controls, population, policy, randomness, memory or dependency are added.

The runner records tick 0 and each actual production `step` result, then stops in this exact order at every frame:

1. **Capture:** production `status === "caught"` wins, including shared cells, orthogonal adjacency, and retained crossing compatibility; report the exact capture tick and production reason.
2. **Cycle:** key the ordered pair as the comma-separated integers `Hx,Hy,Zx,Zy`. Remember the first tick for each key, including tick 0. On the first repeated key, report `startTick`, `repeatTick`, `period = repeatTick - startTick`, and `positionKey`. Include the repeated endpoint in every export.
3. **Unresolved:** if neither happened by tick 10000, include that safety endpoint and report unresolved, not survival. Capture beats cycle, and both beat safety even on tick 10000.

**Executed adjacent-capture result:** ticks **0–73**, **74 frames**, ending **caught** at H **`(0, 6)`**, Z **`(1, 6)`**, reason **`orthogonally adjacent`**. No earlier frame is captured or repeated. All exports are compared with separate calls of the real production source under the same cap.

**Original control:** source commit **`6a690bd8801db120957dd77fc5d84da680f7bd06`** yields a cycle from tick **88** to **102**, period **14** (103 recorded frames). This is the original same-cell/crossing baseline, not the current branch’s runtime result. It was re-executed directly from that Git blob, without reading another worktree: [control receipt and full trajectory](evidence/adjacent/control-baseline.json). Frames through tick 72 match exactly; movement and decisions also match at tick 73, where only capture classification changes. These are deterministic outcomes for one fixed setup, not independent statistical trials or general survival evidence.

```sh
node scripts/test-preview.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-preview.cjs preview
```

Use an already-installed Node 22 or newer; no npm install, framework, server, or external assets are needed. The optional first argument selects the output directory, overriding `PREVIEW_OUTPUT_DIR`; otherwise output is `preview/` relative to the working directory. Only these files are generated:

- **`index.html`**: self-contained offline replay with a visibly labeled experiment and exact outcome summary, embedded recorded states, Canvas H/Z positions, Play/Pause, Back/Next, a tick scrubber, and the complete position table. Open it directly from disk after downloading and extracting the artifact. Playback selects recorded frames at four frames per second; it does not rerun the simulation. Playing from the final frame restarts playback; stepping or scrubbing pauses it.
- **`positions.json`**: `{ schemaVersion: 2, metadata: { commit, ref, repository }, experiment: { name: "fixed-start-capture-cycle", safetyTickLimit: 10000, captureRule: "shared-cell-or-orthogonally-adjacent-or-crossing" }, outcome, frames: [...] }`. `outcome` is one of `{ type: "capture", tick, reason }`, `{ type: "cycle", startTick, repeatTick, period, positionKey }`, or `{ type: "unresolved", tick, reason: "safety tick limit" }`.
- **`positions.csv`**: one row per captured tick, with `tick,human_x,human_y,zombie_x,zombie_y,status,reason` columns.

Frames remain unmodified production snapshots under the configured cap, including decisions and production status/reason. The adjacent-capture endpoint at tick 73 says `caught` / `orthogonally adjacent`. **Cycle remains a runner outcome, not a fabricated production status:** cycle fixtures and the original control can end on a `running` production frame. Read the HTML summary or JSON `outcome` for why recording stopped; CSV retains production fields. JSON includes tick 0 and the stopping endpoint.

`PREVIEW_COMMIT` sets the displayed source commit (default `unknown`); optional `PREVIEW_REF` and `PREVIEW_REPOSITORY` add context. Metadata is preserved as text and safely escaped in the embedded HTML data. The generator does not infer or certify that supplied metadata describes a clean checkout; CI must supply the exact checked-out PR head or main commit. The same source and metadata produce the same output bytes.

Builds reject missing/skipped ticks, unknown production statuses (only `running`, `caught`, `limit` are accepted), and a premature production `limit` before tick 10000. They apply a one-second VM timeout to loading, initialization, and each step. Hitting the safety bound is a valid unresolved outcome, not a build error; malformed/nonprogressing sources or timeouts fail before writing output. Tests use temporary directories and compare every recorded frame to an independent run of the real production simulation. Synthetic copied-source fixtures cover capture, all four cycle-key coordinates, tick-zero repeats, unresolved safety endpoints (with either `limit` or `running` production status), and capture/cycle precedence at the safety boundary. No fixture alters runtime source. Metadata escaping, CSV quoting, output-path behavior and standalone playback are retained.

**Delivery:** PR workflows provide downloadable replay artifacts. Public [main Pages](https://14-tr.github.io/zombie-lab/) remains the baseline; this isolated branch does not publish, merge, or combine the parallel initial-position experiment. A PR replay is not automatically the published main replay. Downloaded HTML works without network access; there is no upload, telemetry, or persistence in the replay page.
