# ZL-006 · Every distinct ordered starting pair

## Question, control and scope

Under the unchanged production adjacency-capture policy, does any distinct start on the 10×7 board avoid capture, and how long does each condition last? This exhaustive deterministic enumeration broadens only the starting positions; it does not change policy, board, movement, tie-breaking, population or the manual application's 40-tick default.

Source baseline: `b01cbbfcf8aa3776ffe3893af135862363e34ac1`. These measurements used **uncommitted ZL-006 engine additions** on that baseline, not a claimed clean engine commit. Production `simulation.js` remained byte-identical, SHA-256 `4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568`. Earlier reports and evidence are historical snapshots and were not rewritten.

The retained controls are Z `(2,4)` with H `(7,2)` and H `(6,2)`, the two starts from ZL-005. The sweep executes every ordered pair of different cells: 70 zombie starts × 69 human starts = **4830 conditions**. Cell ID is `y*10+x`; row ID is `z<zombieId>-h<humanId>`. Ordering is zombie ID ascending, then human ID ascending. Same-cell starts are excluded, not counted as surviving or unresolved. Initially cardinal-adjacent starts are included.

## Method

- Load the unchanged `simulation.js` in an isolated Node VM. Execute the whole sweep within one bounded VM call, avoiding per-tick VM compilation/timeouts. Every condition independently calls production `step`; no cross-condition outcome shortcuts or inferred results.
- Use north→east→south→west→stay tie order; simultaneous moves use old positions and Manhattan distance. Production captures shared cells, cardinal adjacency and exchanged positions; diagonal contact alone is not capture.
- Override only the experiment tick limit to **10000**, common to all starts. Check initial distance explicitly because `initialState()` reports `running` even for adjacent starts. This captures those conditions at true tick **0**, without discarding a moving frame.
- Stop at capture, otherwise the **first repeated ordered position pair**, otherwise the inclusive safety endpoint. A cycle records its first-seen tick and period; unresolved is not a claim of indefinite survival.
- Keep only the current production state and a per-condition position-key → first-tick map. Bulk exports contain outcome rows, **not trajectories**. A selected-run viewer may replay one condition separately. A 30-second sweep VM watchdog fails rather than publishing fabricated results; this is separate from the 10000-tick simulation bound.

## Measured findings

| Outcome | Exact conditions |
| --- | ---: |
| Capture | **4830** |
| Of those, initial capture at tick 0 | **246** |
| Of those, capture after movement | **4584** |
| Proven cycle | **0** |
| Unresolved at the safety cutoff | **0** |

Both control rows, `z42-h27` and `z42-h26`, capture at **tick 73**. The minimum stopping tick is **0**; the maximum is **77**, attained by **67 conditions**: Z starts at `(0,6)` (ID 60), with any nonadjacent, nonoverlapping human start. The sum of all stopping ticks is **252572**, equal to the production movement steps executed in one full sweep.

Thus every allowed starting pair in this exact finite world captures within 77 ticks. These are complete condition counts, not a random sample, probabilities, significance tests or independent statistical replicates. Deterministic reruns verify reproducibility only. The finding does not extend to other board sizes, obstacles, policies, tie orders, speeds, populations, stochastic behavior, learning or human behavior.

## Runtime, storage and reproducibility

One measured final CLI execution using installed **Node v26.8.1 on macOS** returned `/usr/bin/time -lp`: **0.78 s real, 0.79 s user, 0.00 s system**, maximum resident set size **71467008 bytes**. Other verification processes were active; this is an execution receipt, not a controlled performance benchmark or a guarantee for other machines. No packages, framework, runtime dependencies, network service or hosting backend were added or installed.

Generated files in `/tmp/zl006-engine`:

| File | Measured bytes | SHA-256 |
| --- | ---: | --- |
| `sweep.json` | 528471 | `da7d74eba9e97403a45a5cd76954d4d3537482b7592e9752b3d530bf3fce0327` |
| `sweep-data.js` | 528501 | `643a21c8220f728bcf46a94f619afa133411da658146130315d4b97891adc934` |

Total output: **1056972 bytes**. The JS file assigns `globalThis.ZombieSweepData` to the same JSON, escaping `<`, `>`, `&`, U+2028 and U+2029. Existing replay files in the output directory are preserved. The generator writes only these two files; copying viewer assets is a separate integration step.

The metadata value for these exact file hashes is `b01cbbfcf8aa3776ffe3893af135862363e34ac1 + uncommitted ZL-006 engine`. Different metadata changes file hashes but not outcomes. Metadata-independent SHA-256 of Node `JSON.stringify(sweep.results)` is `e8718e300d2a4b1bbbbf8f842ac8d5abd1031d49ece86c1e82378fe949547543`.

From the checkout, using an already installed Node:

```sh
NODE=/Users/tr/.hermes/node/bin/node # or NODE=node on another machine
"$NODE" --test scripts/test-sweep.cjs
"$NODE" test-node.cjs
"$NODE" scripts/test-preview.cjs
PREVIEW_COMMIT='b01cbbfcf8aa3776ffe3893af135862363e34ac1 + uncommitted ZL-006 engine' \
  /usr/bin/time -lp "$NODE" scripts/build-sweep.cjs /tmp/zl006-engine
"$NODE" -e 'const fs=require("node:fs"); const s=JSON.parse(fs.readFileSync(process.argv[1])); console.log(s.summary); console.log("distinct IDs",new Set(s.results.map(r=>r.id)).size); console.log("maximum tick",Math.max(...s.results.map(r=>r.stopTick)));' /tmp/zl006-engine/sweep.json
shasum -a 256 simulation.js /tmp/zl006-engine/sweep.json /tmp/zl006-engine/sweep-data.js
```

For a clean committed checkout use `PREVIEW_COMMIT="$(git rev-parse HEAD)"` instead of the dirty-source receipt above. The optional CLI directory defaults to `PREVIEW_OUTPUT_DIR`, then `./preview`; an explicit directory takes precedence. Importing `buildSweep({commit})` returns the frozen-schema dataset without writing files. `classifyStart(simulation, initial)` is also exported for focused runner boundary tests; the production sweep configuration itself is not adjustable through options.

## Verification and remaining integration gate

Executed **10/10 sweep tests**, unchanged production core **13/13**, and existing two-start preview **16/16**. Sweep assertions cover complete ordered unique coverage, self-pair exclusion, aggregate reconciliation, exact schema/no bulk trajectories, both baseline outcomes, every tick-zero adjacency, frozen inputs/source preservation, byte-repeatable artifacts, hostile metadata escaping, CLI destination preservation/precedence, first occurrence including a nonzero cycle start, malformed-source state rejection, and capture→cycle→unresolved priority at tick 10000.

TDD failures were observed before the engine existed, before CLI artifacts existed, before extracting the single-start adjudicator, and before adding safety-cap/metadata validation; the resulting suite is green. Synthetic sequences and an enlarged synthetic board exercise otherwise unobserved cycle/cutoff branches **only in tests**; none contributes to the 4830 production findings. Production source hashes were checked again after generation.

Parent integration verified exact equality of all 4830 ordered result rows and summary against an independently implemented Python oracle, not merely matching aggregate totals. Node viewer tests passed 8/8. Cached Chromium verified the actual sweep artifact, 70 zombie choices, 69 human choices per zombie, the baseline's 74-frame replay and exact endpoint, and readable 320px layout without overflow or external requests. See [preserved evidence](../evidence/all-starts/): `oracle.py`, `oracle.json`, `sweep.json`, `comparison.json`, `browser.json`, and `mobile.png`. Browser receipts record the local verification path, not a published URL. CI and live deployment are separate publication gates.
