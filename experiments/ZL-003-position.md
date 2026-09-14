# ZL-003 · Human one cell west

## Question and intervention

**Question:** does moving the human one cell west change capture versus recurrence or cycle timing? **Hypothesis stated before the run:** the shifted start also reaches a non-capturing cycle; the same period or orbit was not required. Timing and trajectory differences are exploratory measurements.

Baseline: `6a690bd8801db120957dd77fc5d84da680f7bd06`; branch: `experiment/human-one-cell-west`, uncommitted pending parent review/PR.

Both conditions copy production `initialState()` in separate Node VM contexts and share experiment-only `tickLimit: 10000`. Control starts H `(7, 2)`, Z `(2, 4)`; treatment changes **only `human.x: 7 → 6`**, leaving H y=2, Z `(2, 4)` and every other initial-state field equal. Board, movement, tie-breaking and capture rules are unchanged. Manual defaults remain H `(7, 2)` and 40 ticks.

Production `simulation.js` is byte-identical to baseline: SHA-256 `d40bf395b47a04d487a455d3841d28243f924f620beedec848696f68856cfa65`.

## Actual executed results

| Condition | Outcome | Cycle start → repeat | Period | Frames | Repeated pair |
| --- | --- | --- | --- | --- | --- |
| Control | Cycle; no capture through endpoint | 88 → 102 | 14 | 103, ticks 0–102 | `9,0,8,0` |
| Treatment | Cycle; no capture through endpoint | 88 → 102 | 14 | 103, ticks 0–102 | `9,0,8,0` |

Position trajectories differ initially, then coincide from **tick 11** through the endpoint, joining at H `(9, 6)`, Z `(9, 0)`. Incoming decision metadata at tick 11 still differs. Both endpoint snapshots remain production `running` with empty reason: cycle is a separate runner outcome.

**Interpretation:** the transient changes, but outcome, cycle timing, period and repeated pair do not. The stated non-capture-cycle hypothesis is supported for this one neighboring start; equal timing was an observed result, not a required outcome.

**Limits:** one deterministic run per condition, not an ensemble. Test/build repetitions check repeatability, not independent samples; there is no statistical confidence claim. Recurrence proves motion cycling only for this fixed deterministic, memoryless policy if allowed to continue without the cutoff. No general survival, intelligence, other-start or group-behavior claim follows. Synthetic capture/cycle/unresolved fixtures are regression checks, not scientific treatment runs. No capture-rule intervention is included.

## Reproduce

From this branch using an installed Node 22+:

```sh
node test-node.cjs
node scripts/test-preview.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)" \
PREVIEW_REF="$(git branch --show-current)" \
PREVIEW_REPOSITORY="14-TR/zombie-lab" \
node scripts/build-preview.cjs preview
```

Open `preview/index.html`. The summary compares both conditions; playback, table, CSV and top-level JSON frames/outcome show treatment. JSON also retains both labeled starts/outcomes and every control frame. Existing CI metadata fields/workflows are unchanged. Use a reviewed commit after committing; saved local evidence explicitly labels the base plus uncommitted position changes.

Cached browser verification, reading the saved replay without another trial:

```sh
/Users/tr/.hermes/node/bin/node evidence/position/browser-check.cjs \
  /Users/tr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
  '/Users/tr/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
```

## Evidence

Under [`evidence/position/`](../evidence/position/):

- `replay/index.html`, `replay/positions.json`, `replay/positions.csv`: actual generated artifacts; `findings.json`: machine-derived outcomes and trajectory comparison.
- `red-data.tap` → `green-data.tap`: missing comparison contract failed before implementation. `red-summary.tap` → `green-summary.tap`: missing side-by-side summary failed before rendering; **15/15 replay tests passed**. `core-tests.txt`: **9/9 passed**, including unchanged capture rules.
- `browser.json`: cached Chromium **153.0.8010.12** passed all **103** Canvas-position/table-row checks, comparison labels/outcomes, keyboard endpoints, playback stop/restart, 390px layout and hostile metadata; zero external page requests/errors. Actual `replay-desktop.png` and `replay-mobile.png` were visually inspected.
- `browser-harness-red.json`: first harness reused a page and redeclared top-level constants; a fresh hostile-metadata page fixed verification without application changes.
- `source-hashes.json`: exact source/evidence SHA-256s and byte sizes.

No installs, commit, push, main changes or Pages deployment. Safari/Firefox, assistive technology, hosted CI and public deployment remain unverified here. Parent reviews and publishes a separate position-only PR; no automatic merge with another experiment.
