# Zombie Lab · ZL-001

An atomic, deterministic human-versus-zombie experiment. One human, one zombie, one tick per click. No training or learned behavior.

## Launch

Double-click **`index.html`**, or open it directly in a modern browser:

```text
file:///Users/tr/Projects/zombie-lab/index.html
```

On this Mac, `open /Users/tr/Projects/zombie-lab/index.html` uses the default browser. No install, build command, web server, account, or network connection is needed. Keep `index.html`, `simulation.js`, and `app.js` together.

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

Ties keep the first legal action in **north → east → south → west → stay** order. Choices are resolved simultaneously. A **shared destination** or **exchanged positions** counts as caught. Merely moving into a cell the other agent vacated does not count unless the agents swap. Capture takes precedence over reaching the tick limit on that tick. Existing contact is already terminal and does not consume a tick. Capture and tick-limit states cannot advance.

The default trial was observed to reach the 40-tick limit, not capture. This is a transparent local-distance heuristic, not evidence of intelligence or general survival ability. The shared-destination and crossing cases are deliberately covered by small test fixtures; the default flee policy need not naturally produce a crossing.

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

`evidence/` contains actual JSON execution receipts, screenshots, and verification-only scripts. The scripts reuse an existing local Playwright Core and Chromium supplied as arguments; they do not install anything and are not required to use the app. Commands, tool versions, timings, exact source bytes and coverage are recorded in `RECEIPT.md` and the evidence files.

## Resource and verification boundaries

Runtime package dependencies: **0**. Observed app page loads: **3 local files, 0 external network requests**. This count is page-scoped; it is not a measurement of all browser or operating-system traffic.

The recorded benchmark measures warmed pure ticks plus trial resets, excluding Canvas, DOM updates, painting and automation. It is a local microbenchmark, not a frame-rate or cross-machine performance claim. A CDP JavaScript-heap sample is recorded separately; isolated app/process memory, RSS, GPU memory and energy are **unavailable**, not assumed zero. Source size is not the browser's total runtime footprint.

No dependencies were installed for verification. Automated evidence uses an existing headless Chromium opened at `file://`; screenshots were generated by the real browser. Native Safari automation was unavailable in this worker session. Cross-browser testing and assistive-technology testing remain unverified. Independent source review and any local Git checkpoint belong to the lead; this worker leaves files uncommitted and performs no remote publication.

Expansion is intentionally out of scope: no additional agents, infection, resources, training, or deeper brains. See `GOAL.md` for the next decision gates.

## Fixed-start capture/cycle experiment · offline replay

The optional runner executes the **unchanged production `simulation.js`** using Node's built-in VM. It copies `initialState()` and overrides **only `tickLimit: 10000`**, for this experiment only. The start remains H `(7, 2)`, Z `(2, 4)` on the same 10×7 board, with identical simultaneous movement, tie-breaking and capture rules. The base manual app above remains unchanged at 40 ticks; no new controls, population, policy, randomness, memory or dependency are added.

The runner records tick 0 and each actual production `step` result, then stops in this exact order at every frame:

1. **Capture:** production `status === "caught"` wins, including shared destinations and exchanged positions; report the exact capture tick and production reason.
2. **Cycle:** key the ordered pair as the comma-separated integers `Hx,Hy,Zx,Zy`. Remember the first tick for each key, including tick 0. On the first repeated key, report `startTick`, `repeatTick`, `period = repeatTick - startTick`, and `positionKey`. Include the repeated endpoint in every export.
3. **Unresolved:** if neither happened by tick 10000, include that safety endpoint and report unresolved, not survival. Capture beats cycle, and both beat safety even on tick 10000.

**Observed result:** ticks **0–102**, **103 frames**; the first repeated pair starts at tick **88**, repeats at **102**, and has period **14**. All exported frames are compared to independent calls of the real production source configured with the same cap. Movement depends only on the current positions and fixed board/rules, not tick, history, decisions metadata or randomness. Thus the repeated ordered pair proves a motion cycle for this fixed setup under unchanged rules (if allowed to continue without the safety cutoff), not general survival ability. A future time-dependent, randomized or memory-bearing policy would require a different key/proof.

```sh
node scripts/test-preview.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" node scripts/build-preview.cjs preview
```

Use an already-installed Node 22 or newer; no npm install, framework, server, or external assets are needed. The optional first argument selects the output directory, overriding `PREVIEW_OUTPUT_DIR`; otherwise output is `preview/` relative to the working directory. Only these files are generated:

- **`index.html`**: self-contained offline replay with a visibly labeled experiment and exact outcome summary, embedded recorded states, Canvas H/Z positions, Play/Pause, Back/Next, a tick scrubber, and the complete position table. Open it directly from disk after downloading and extracting the artifact. Playback selects recorded frames at four frames per second; it does not rerun the simulation. Playing from the final frame restarts playback; stepping or scrubbing pauses it.
- **`positions.json`**: `{ schemaVersion: 2, metadata: { commit, ref, repository }, experiment: { name: "fixed-start-capture-cycle", safetyTickLimit: 10000 }, outcome, frames: [...] }`. `outcome` is one of `{ type: "capture", tick, reason }`, `{ type: "cycle", startTick, repeatTick, period, positionKey }`, or `{ type: "unresolved", tick, reason: "safety tick limit" }`.
- **`positions.csv`**: one row per captured tick, with `tick,human_x,human_y,zombie_x,zombie_y,status,reason` columns.

Frames remain unmodified production snapshots under the configured cap, including decisions and production status/reason. **Cycle is a runner outcome, not a fabricated production status:** the actual tick-102 frame still says `running` with an empty reason. Read the HTML summary or JSON `outcome` for why recording stopped; CSV intentionally retains the production fields. JSON includes the initial and stopping endpoint, even when that endpoint is not production-terminal.

`PREVIEW_COMMIT` sets the displayed source commit (default `unknown`); optional `PREVIEW_REF` and `PREVIEW_REPOSITORY` add context. Metadata is preserved as text and safely escaped in the embedded HTML data. The generator does not infer or certify that supplied metadata describes a clean checkout; CI must supply the exact checked-out PR head or main commit. The same source and metadata produce the same output bytes.

Builds reject missing/skipped ticks, unknown production statuses (only `running`, `caught`, `limit` are accepted), and a premature production `limit` before tick 10000. They apply a one-second VM timeout to loading, initialization, and each step. Hitting the safety bound is a valid unresolved outcome, not a build error; malformed/nonprogressing sources or timeouts fail before writing output. Tests use temporary directories and compare every recorded frame to an independent run of the real production simulation. Synthetic copied-source fixtures cover capture, all four cycle-key coordinates, tick-zero repeats, unresolved safety endpoints (with either `limit` or `running` production status), and capture/cycle precedence at the safety boundary. No fixture alters runtime source. Metadata escaping, CSV quoting, output-path behavior and standalone playback are retained.

**Delivery:** PR workflows provide downloadable replay artifacts. The repository is now public, so these are not private previews. The public main-branch replay is intended for [https://14-tr.github.io/zombie-lab/](https://14-tr.github.io/zombie-lab/); Pages has been configured, but deployment is not yet verified here. PR artifacts and the main Pages deployment are separate: a PR replay is not automatically the published main replay. Downloaded HTML works without network access and makes no external requests; there is no upload, telemetry, or persistence in the replay page.
