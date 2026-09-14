# ZL-004 — Adjacent capture

## Question and hypothesis

Does changing only the capture radius end the original fixed-start trajectory before its baseline cycle? The hypothesis was that allowing orthogonal adjacency would produce capture without changing either agent’s movement policy.

## Single changed rule

Capture at a shared cell **or Manhattan distance 1** (north/east/south/west neighbors), **not diagonal neighbors**. Check before movement, including tick 0, and after simultaneous moves. Pre-step capture consumes no tick. Preserve exchanged-position capture; a legal one-cell swap necessarily starts adjacent, so the new pre-check catches it before that swap. Capture wins over cycle detection and the tick/safety limit. Terminal states remain inert.

Unchanged control settings: H **(7, 2)**, Z **(2, 4)**; bounded **10×7** grid; human maximizes and zombie minimizes Manhattan distance to the same old state; ties **north → east → south → west → stay**; at most one cardinal cell per tick. No west-shift, speed, policy, randomness, history, or population change. Manual cap **40**; the existing fixed-start replay overrides only the cap to **10000**. Playback remains four recorded frames per second.

## Executed outcomes

| Source / rule | Exact result | Complete trajectory |
| --- | --- | --- |
| Original baseline `6a690bd8801db120957dd77fc5d84da680f7bd06`, same-cell/crossing | Cycle starts **88**, repeats **102**, period **14**; ordered pair `9,0,8,0`; **103 frames** | [Control receipt](../evidence/adjacent/control-baseline.json) |
| This adjacent-capture worktree | **Capture at tick 73**, reason **`orthogonally adjacent`**; H **(0, 6)**, Z **(1, 6)**; **74 frames**, ticks 0–73 inclusive | [JSON](../evidence/adjacent/replay/positions.json), [CSV](../evidence/adjacent/replay/positions.csv), [offline replay](../evidence/adjacent/replay/index.html) |

The manual app still reaches its tick-40 limit at H (0, 2), Z (5, 1); its shorter cap does not demonstrate the later capture. The original control was actually re-executed from the pinned Git blob in an isolated VM, not simulated by changing current runtime output. Full states match through tick 72; positions and decisions match through tick 73. Only the new capture classification stops that trajectory there. No earlier captured or repeated pair occurs.

## Interpretation and limits

The result supports the hypothesis **for this one deterministic starting configuration**. It changes the stopping condition, not the chase decisions or evidence of intelligence. Repeating tests checks reproducibility and export consistency; it does **not** create independent experimental samples, a capture probability, or statistical significance. The baseline cycle is specific to the original capture rule. Neither result establishes behavior for all grids, starts, or policies.

Crossing compatibility is tested as pre-step capture, not claimed as an observed post-move swap under the broader radius. Browser evidence uses cached headless Chromium only; Safari/Firefox, assistive technology, and new performance/resource benchmarks are not verified. Public main Pages remains baseline. No commit, push, merge, or deployment is part of this worker’s result; independent parent review remains required.

## Verification and evidence

- Core **13/13**, replay/export **15/15**, browser core/Canvas/DOM **15/15**; browser integration **6/6**, no page errors, failed loads, or external page requests: [final execution](../evidence/adjacent/verification.json), [browser receipt](../evidence/adjacent/browser.json).
- Core covers initial/pre-step cardinal adjacency (tick 0 and later, at and before cap), four cardinal post-move adjacencies, diagonal noncapture, overlap, crossing compatibility, shared destination, cap precedence, purity, exact default start, and determinism. Exhaustive regression: 16 board shapes, 900 paired starts, 12600 transition checks plus repeats—not separate scientific trials.
- Replay preserves capture-before-cycle-before-safety checks including tick 10000, exact complete JSON/CSV/HTML states, deterministic bytes, metadata escaping, and malformed-source/time-limit failures.
- Strict TDD: [initial RED](../evidence/adjacent/red-initial.json) → [GREEN](../evidence/adjacent/green-initial.json); [post-move RED](../evidence/adjacent/red-post.json) → [GREEN](../evidence/adjacent/green-post.json); [rule-label/metadata RED](../evidence/adjacent/red-labels.json) → [GREEN](../evidence/adjacent/green-labels.json). Later exact-outcome and diagonal checks are regression assertions, not claimed as new failing implementation slices.
- Existing test changes are semantic: adjacent same-old-state and shared-destination fixtures moved apart to retain their original purpose; swap/following fixtures now correctly terminate before movement; overlap reason now explicitly says shared cell. Unaffected safety, invalid-move, drawing, controls, and export tests remain.
- [Source/evidence SHA-256 manifest](../evidence/adjacent/hashes.json); [control verifier](../evidence/adjacent/verify-control.cjs) checks unchanged initial state, grid, policy/tie order, step wiring, manual controls, fixed-start runner and playback speed against baseline bytes.
- Real screenshots: [manual initial](../evidence/adjacent/manual-initial.png), [capture](../evidence/adjacent/replay-capture.png), [390px replay](../evidence/adjacent/replay-narrow.png), [browser suite](../evidence/adjacent/tests.png).

## Reproduce without installing

From this worktree, with the existing Node on this Mac:

```sh
NODE=/Users/tr/.hermes/node/bin/node
$NODE test-node.cjs
$NODE scripts/test-preview.cjs
PREVIEW_COMMIT='6a690bd8801db120957dd77fc5d84da680f7bd06 + uncommitted adjacent-capture experiment' \
PREVIEW_REF=experiment/adjacent-capture \
$NODE scripts/build-preview.cjs evidence/adjacent/replay
$NODE evidence/adjacent/verify-control.cjs
$NODE evidence/adjacent/browser-check.cjs \
  /Users/tr/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core \
  '/Users/tr/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
```

The verification commands overwrite this experiment’s generated receipts/screenshots. The artifact metadata explicitly identifies an uncommitted worktree based on the pinned baseline; it does not pretend these changes already belong to that commit. Hashes bind the actual source and evidence bytes at handoff. CI should supply the eventual reviewed PR head commit when building its artifact.
