# ZL-001 execution receipt

## Clock and ownership

- Live start observed with `date -u`: **2026-09-14T04:39:48Z** (recorded before implementation).
- Implementation target: **2026-09-14T05:04:48Z** (25 minutes).
- Worker hard stop: **2026-09-14T05:09:48Z** (30 minutes maximum).
- Implementation/verification complete; handoff receipt generated: **2026-09-14T04:58:54.195542+00:00**.
- Worker elapsed at handoff: **1146.2 seconds**, below the 30-minute ceiling; at least the requested 10-minute independent review/checkpoint reserve remains within the goal's 45-minute block.
- Owned only implementation/evidence files in `/Users/tr/Projects/zombie-lab`. `GOAL.md` was read, not edited. No vault, Hermes configuration/skills, or other profile was modified. No delegation, install, application server, model, training, publication, or commit.
- Initial `git status` exited 128: not a Git repository. No Git initialization/staging/commit was done. **Independent source review and local checkpoint remain the lead's responsibility.**

## Deliverable and decisions

Runtime files: `index.html`, `simulation.js`, `app.js`. Direct `file://`, classic JS, Canvas 2D, inline CSS. Exactly one human and one zombie on a 10×7 grid. Default start H(7,2), Z(2,4); 40-tick cap. Human maximizes old-state Manhattan distance; zombie minimizes it; ties north/east/south/west/stay. `step` is pure and delegates legal simultaneous movement to `resolveTick`; crossing is tested independently of default policy. Capture overrides a tick limit reached on the same tick. Drawing never steps state. No automatic tick, added agents, settings, storage, assets or dependency scaffolding.

The observed default run reaches **tick 40 / limit**, rather than capture. This is a deterministic heuristic demonstration, not a trained policy or a survival claim. Custom malformed state objects are outside the documented API contract; explicit moves are validated. Terminal calls may return the unchanged input object.

## Actual tests and execution

Existing tools: Node **v26.8.1**; cached Playwright Core and Chromium **153.0.8010.12**. Host checked with `sw_vers` / `uname -m`: macOS **26.6.2**, build **25G83**, **arm64**. Nothing installed.

- `node test-node.cjs`: exit **0**, actual final output **`9/9 passed`** (`evidence/node-tests.json`). Node covers core rules only, not DOM/Canvas.
- Real headless Chromium loaded `file:///Users/tr/Projects/zombie-lab/tests.html`: **11/11 passed**, **0 failed**, no page errors or failed loads. Timestamp **2026-09-14T04:55:45.206Z** (`evidence/browser-tests.json`).
- Exhaustive regression fixture: **16 board shapes**, **900 paired starting configurations**, **12600 per-trajectory step evaluations** (plus identical independent repeat evaluations). Includes one-cell/narrow boards, bounds, four-neighbor/stay movement, input immutability, deterministic repeatability, terminal inertness and cap.
- Other named coverage: same-old-state decision witness; deterministic tie; shared destination; crossing/exchanged positions; capture/limit precedence; initial overlap; zero tick limit; invalid explicit moves; legal following without false capture; real Canvas drawing independence; DOM Step/Reset exactness and snapshot isolation.
- Real `index.html` integration: **8/8 checks passed**, exit **0**. Initial Canvas visible; actual Step click exactly once; 150 ms idle unchanged; terminal disabled plus forced event inert; exact visible reset; keyboard Enter; 390px no horizontal overflow; no external requests/failed loads/page errors (`evidence/app-verification.json`). Integration interval **2026-09-14T04:53:07.731Z → 2026-09-14T04:53:15.542Z**.
- `node --check` passed with no output for six JS/CJS source/harness files (`evidence/syntax-checks.json`). Limited static scan found no runtime JS use of fetch/XHR/WebSocket, eval/new Function, automatic tick loops or secret assignment patterns. This is not the independent review.

### Test-first record

Observed failing tests before each corresponding implementation slice: missing initialState (0/1), missing step (1/2), missing resolver (2/3), crossing incorrectly running (3/4), limit incorrectly running (4/5), pre-existing contact consuming a tick (5/6), out-of-bounds explicit move accepted (6/7). Each then went green. Later exhaustive/following tests added regression coverage to those already-implemented rules.

Saved browser RED→GREEN receipts: renderer **7/8 → 8/8** (`browser-red-canvas.json`, `browser-green-canvas.json`); controls **8/9 → 9/9** (`browser-red-controls.json`, `browser-green-controls.json`). Main launch failed with `Local index.html launch page is missing` before creating the HTML (`app-red-launch.json`), then the real integration passed. Final browser suite includes the added core regression coverage, hence 11 tests.

## Visual evidence and gaps

Real Chromium screenshots are separate from runtime files:

- `evidence/initial.png`: visually inspected. Bounded grid, separate readable H circle/Z square, controls and state panel visible/unclipped.
- `evidence/narrow.png`: visually inspected at 390px. Agent labels, controls and text readable; normal vertical scrolling, no horizontal clipping.
- `evidence/terminal.png`: visually inspected. Tick 40/40, visually disabled Step, available Reset, both agents and decision text visible.
- `evidence/step.png`, `evidence/tests.png`: captured by successful automated runs; not separately visually inspected.

**Precise gaps:** headless Chromium evidence is not native Safari/Firefox validation; no assistive-technology or touch-device testing. The default run visually verifies a tick-limit terminal state; capture/crossing are verified in core/browser tests, but a captured/shared-cell screenshot and capture-specific UI readout were not visually inspected.

Browser-helper blocker/recovery: `browser_exec` refused because the real-profile default browser is not a supported Chromium browser. A background Safari open command returned success, but native capture returned no window/elements and a read-only AppleScript probe timed out after 30 seconds. No browser preference, permission or Hermes setting was changed. Recovered by reusing pre-existing cached Chromium with pre-existing Playwright Core. A Safari test tab may remain from that unverified attempt; no personal tab was closed. Every worker-launched headless test browser is closed in the driver `finally` block.

## Resource measurements

Measured **2026-09-14T04:57:12.355761+00:00**. Exact per-file bytes, SHA-256s and modification timestamps: `evidence/source-measurements.json`.

| Measure | Actual result |
| --- | ---: |
| `index.html` | 4,072 bytes |
| `simulation.js` | 3,426 bytes |
| `app.js` | 3,888 bytes |
| Runtime source total | **11,386 bytes** |
| Browser/Node test source | **12,655 bytes** |
| Implementation + test source | **24,041 bytes** |
| Above + README | **30,119 bytes** |
| Evidence directory at handoff (17 files) | **436,355 bytes** |
| App package/runtime-library dependencies | **0** (modern browser itself required) |
| App page resource requests | **3 local file requests; 0 external** |

Source totals exclude `GOAL.md`, this receipt, evidence and nonexistent Git metadata. Evidence is below 10 MB; source is below 1 MB. The measurement JSON's earlier evidence subtotal excludes that JSON itself; the handoff total above includes it.

Recorded tick benchmark: **50,000 ticks**, five batches of **10,000**, warm-up first. Batch milliseconds: **[6, 2.699999988079071, 2.5, 2, 1.800000011920929]**. Mean **0.3 µs/tick**. Includes pure transitions and trial resets; excludes drawing, DOM, paint and automation. A short local microbenchmark, not a frame-latency guarantee.

CDP JS heap sample after benchmark: **4,361,756 used bytes**, **9,043,968 total heap bytes**. This is the browser page's sampled JS heap including verification allocations, not clean steady-state or isolated app memory. **Process/RSS, GPU memory, energy and whole-browser/system network traffic are unavailable/unmeasured.** Do not treat these as zero. No app server or recurring process was created.

## Reproduce automated browser receipts with existing tools

```sh
node evidence/browser-check.cjs \
  /Users/tr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
  '/Users/tr/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  browser-tests.json
node evidence/verify-app.cjs \
  /Users/tr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
  '/Users/tr/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
  app-verification.json
```

These verification-only commands overwrite their named receipts/screenshots; use fresh output names or copy evidence for a review run. The app itself and `tests.html` require none of this tooling. No local Git checkpoint until independent source review; no remote publication without a separately scoped release decision.
