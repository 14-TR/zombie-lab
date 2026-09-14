# ZL-005 · Position comparison under adjacency capture

## Scope and source

This is the authorized **combined integration** of main's position comparison and PR4's adjacency rule, not either original one-factor experiment. Question: with the same production adjacency rule applied to both starts, does moving H one cell west change the outcome or timing? This is an integration measurement, not a newly preregistered hypothesis.

Merge parents: PR4 `32c5213c439c036aca5411560b3567924ed997a3` and main `2c1719aa314405a31d0b4dd6b402ca16783ec095`. Results below were executed on their **uncommitted resolved merge**. Production `simulation.js` is unchanged from PR4, SHA-256 `4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568`.

Settings: bounded 10×7 board; control H `(7, 2)`, treatment H `(6, 2)`; Z `(2, 4)` in both. Only initial `human.x` differs between current conditions. Separate VM contexts, common replay cap 10000; manual defaults retain H `(7, 2)` and cap 40. Simultaneous cardinal/stay movement maximizes/minimizes distance to old positions; ties north→east→south→west→stay. Capture: shared cell or Manhattan distance 1, not diagonal; checked before movement and after simultaneous moves, retaining crossing compatibility. Runner priority: capture, first repeated ordered position pair, unresolved safety cutoff.

## Recomputed results

| Condition | Outcome | Endpoint H / Z | Complete frames |
| --- | --- | --- | --- |
| Control H `(7, 2)` | Capture **73**, `orthogonally adjacent` | `(0, 6)` / `(1, 6)` | **74**, ticks 0–73 |
| Treatment H `(6, 2)` | Capture **73**, `orthogonally adjacent` | `(0, 6)` / `(1, 6)` | **74**, ticks 0–73 |

Both outcomes were independently executed from production, not assumed equal. No earlier capture or repeated pair occurs. Position trajectories coincide from tick 11 through capture; incoming decision metadata differs at tick 11. SHA-256 of Node `JSON.stringify(frames)`:

- Control: `f2b90c2f4e5ecb0b2764695b96a9220aba94666aff0710d6c6ca1a581dbf8c49`
- Treatment: `24df0952e0e16a83556f78915da97bc6fa029a3855f5c2ff122c5b7e47f283e5`

Interpretation: the transient differs, but capture outcome/timing does not for these two starts under this rule. One deterministic run per condition; verification repetitions are not independent samples, probabilities or statistical significance. No claims about other starts, intelligence, general survival or resource performance follow.

## Reproduce without installing

From the integrated checkout, with installed Node 22+ (`/Users/tr/.hermes/node/bin/node` on this Mac):

```sh
node test-node.cjs
node scripts/test-preview.cjs
OUT="$(mktemp -d)"
PREVIEW_COMMIT="$(git rev-parse HEAD) + uncommitted integration with $(git rev-parse MERGE_HEAD)" \
PREVIEW_REF="$(git branch --show-current)" \
PREVIEW_REPOSITORY=14-TR/zombie-lab \
node scripts/build-preview.cjs "$OUT"
node -e 'const r=require(process.argv[1]); for (const [name,run,frames] of [["control",r.control,r.control.frames],["treatment",r.treatment,r.frames]]) console.log(name,run.initialState.human,run.outcome,frames.length,frames.at(-1));' "$OUT/positions.json"
```

After the reviewed merge is committed, replace the `PREVIEW_COMMIT` expression with `$(git rev-parse HEAD)`; `MERGE_HEAD` exists only during the merge. Open `$OUT/index.html`: both starts/outcomes are labeled; playback/table/CSV/top-level JSON show treatment, while JSON also contains every control frame. Schema version 2, metadata fields, output filenames, outcome shapes and CI workflows are preserved; experiment metadata now names the combined comparison and capture rule.

## Verification and historical evidence

Executed core **13/13**, preview **16/16**. TDD: combined metadata assertion failed on the old position-only name/missing capture rule, then passed after integration; the new visible-summary assertion failed on the old heading before its fix. One transient regression assertion mistakenly checked the zombie rather than human at tick 10; real execution exposed it and the assertion was corrected. Retained exhaustive small-board core coverage, security/CSV/determinism checks, complete independent trajectories, malformed-source rejection, VM timeout and capture/cycle/unresolved safety-boundary fixtures.

Local generated replay and verification-only browser script/receipt are at `/tmp/zombie-lab-zl005-32c5213-2c1719a/`; these temporary files are not portable or committed evidence. Cached Chromium **153.0.8010.12** passed browser core/Canvas/DOM **15/15**, all **74** treatment row/Canvas-label/scrubber checks, comparison summaries, keyboard endpoints, playback stop/restart/pause and 390px layout; zero page errors, failed requests or external page requests. The browser suite retained **16** board shapes, **900** paired starts and **12600** transitions. No tools were installed. Open `tests.html` to rerun the browser suite. CI, Pages deployment, Safari/Firefox and assistive technology are outside this local verification.

[ZL-003](ZL-003-position.md) / `evidence/position/` and [ZL-004](ZL-004-adjacent-capture.md) / `evidence/adjacent/` remain **byte-unchanged historical source-bound snapshots**, verified against main and PR4 respectively. Their original numbers and reproduction instructions apply to those sources, not this integrated checkout. Do not overwrite either directory with current outputs. No commit, push, dependency install or remote write was performed during this integration; the merge is left for parent review and commit.
