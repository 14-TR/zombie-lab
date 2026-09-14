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
