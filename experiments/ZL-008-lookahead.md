# ZL-008 — two-tick model-based human planning

## Result

The preregistered planner avoids capture indefinitely in the uncapped deterministic
position dynamics from **all 4,584 nonterminal permitted starts**. Each run reaches
an exact period-two ordered-position cycle. The other **246 starts already satisfy
cardinal-adjacency capture at tick 0**; neither policy gets to move in those cases.
The unchanged greedy baseline captures in all 4,830 cases, matching the frozen
original outcome, stopping tick, cycle start, and period **row for row**.

| Paired category | Starts |
| --- | ---: |
| Later capture, both captured | 0 |
| Earlier capture, both captured (regression) | 0 |
| Same capture time | 246 |
| Escape: baseline capture, treatment proven cycle | 4,584 |
| Unresolved | 0 |
| **Total** | **4,830** |

| Policy | Capture | Cycle | Unresolved |
| --- | ---: | ---: | ---: |
| Frozen greedy baseline | 4,830 | 0 | 0 |
| Two-tick model-based human | 246 | 4,584 | 0 |

Thus 94.91% of the entire permitted start domain changes from capture to a proven
noncapturing cycle; the remaining 5.09% are initial terminals, not moving-policy
ties. There are no observed outcome regressions in this domain. No moving runs
capture under both policies, so there is no finite capture-delay effect to average.
A cycle's repeat tick is **not** its capture time or an infinite elapsed time.

## Frozen question and settings

Question: does **this specified model-based two-tick policy** improve avoidance
relative to greedy fleeing? The algorithm was frozen before outcome execution in
[`ZL-008-protocol.md`](ZL-008-protocol.md), commit
`7d311337c3ff1b4929840603ac79871e05f1f179`, based on
`a87211fcac93c53c5614ffb6107bb886d96dca13`.

- Board: 10 × 7; one human and one zombie; cardinal one-cell moves or staying.
- Enumeration: zombie ID 0–69, then human ID 0–69, row-major coordinates; exclude
  same-cell starts, retain initially adjacent starts. Exactly 4,830 ordered pairs.
- Tie order: north, east, south, west, stay, at each search depth.
- Zombie: unchanged nearest-Manhattan action against the **old** human position.
  Human and zombie moves resolve simultaneously using unchanged
  `ZombieLab.resolveTick`. No reactive zombie move toward a proposed destination.
- Capture: shared cell or cardinal adjacency before movement and after resolution;
  crossing compatibility is retained. A legal one-cell exchange already begins
  adjacent and therefore stops before movement under the current capture rule.
- Only treatment human policy changes: enumerate legal action sequences to exactly
  two transitions, stop a branch at capture, maximize lexicographically completed
  **noncapturing** transitions, then actual endpoint Manhattan distance. An exact
  tie retains the first traversed sequence. Execute only its first action, replan.
- Hypothetical clock: copied tick 0 and limit 10,000. Real execution retains the
  actual tick and cap. Terminal normalization follows baseline and consumes no
  step. Search reads no clock, memory, random source, training, or future outcomes.
- Runner: stop at capture, first repeated ordered positions, or safety tick 10,000,
  in that priority order. Repeat endpoints are included. A cycle is a runner
  outcome; it does not rewrite production status or reason into a fake capture.

The baseline source and previous evidence are unchanged. No algorithm, horizon,
scoring, tie order, or stopping rule was tuned after observing these outcomes.

## Why the cycles certify avoidance

Before the artificial clock cutoff, the fixed board, simultaneous transition,
known zombie model, and human rule determine a unique successor from the ordered
pair `(zombie position, human position)`. There are 4,584 noncontact ordered
position states on this board. The planner's copied hypothetical clock ensures
that real tick, remaining real budget, and previous decision metadata cannot
change its choice. Computational memoization does not add behavioral memory.

For each start, the runner stores the **first tick** for each ordered pair. A
repeated pair after a wholly noncapturing path must repeat the same successor and
therefore the same noncapturing cycle forever in the **uncapped position model**.
This is an exhaustive finite-state computational result for these exact rules,
not just “nothing caught within 10,000 ticks.” The actual capped application would
still stop at its configured limit if run past the detected recurrence.

Every observed cycle has period 2. Cycle entry ticks range from 0 to 26; first
repeat endpoints range from tick 2 to 28. No production run reached an unresolved
cutoff. Synthetic enlarged-board sequences test cutoff priority separately; they
are boundary tests, not production findings.

## Concrete replays

| Start ID | Initial zombie / human | Baseline | Treatment |
| --- | --- | --- | --- |
| `z0-h2` | Z (0,0), H (2,0) | capture 71 | cycle entry 20, repeat 22, period 2 |
| `z42-h27` | Z (2,4), H (7,2) | capture 73 | cycle entry 22, repeat 24, period 2 |
| `z0-h1` | Z (0,0), H (1,0) | capture 0 | capture 0 |

The first escape by frozen enumeration is `z0-h2`, the protocol's default viewer
selection criterion. Its endpoint positions are:

| Tick | Human | Zombie | Production status |
| --- | --- | --- | --- |
| 20 | (8,0) | (9,1) | running |
| 21 | (8,1) | (9,0) | running |
| 22 | (8,0) | (9,1) | running |

Diagonal separation is not contact. Both agents are distinct at every endpoint;
the ordered pair at tick 22 exactly repeats tick 20.

## Implementation and verification

New classic-script `planner.js` exports frozen `globalThis.ZombiePlanner`:

- `chooseHuman(state) -> {x, y}` for a nonterminal running state.
- `step(state) -> state`: baseline-compatible normalization and real resolution.

`scripts/build-planning.cjs` exports `buildPlanning({commit?})` and
`classifyRun(policy, initialState)`. The latter reuses the unchanged
`scripts/build-sweep.cjs` adjudicator; initial tick is 0. The builder verifies
frozen source/evidence SHA-256 and compares every reproduced baseline row before
returning data. The CLI creates **only** `planning.json` and `planning-data.js`,
never cleans neighboring files, and safely escapes script/HTML-sensitive metadata.
`PREVIEW_COMMIT` supplies source metadata. JSON follows the preregistered schema
and contains scalar outcomes, not bulk trajectories.

Strict test-first implementation used observed red→green slices for terminal
normalization, choice scoring, real simultaneous step, runner, exhaustive paired
build, and CLI. Six focused engine tests pass. Coverage includes exact sequence
ties, two-transition versus one-transition witnesses, survival-before-distance,
old-state zombie prediction, immutable inputs, copied-clock invariance, real cap,
all 4,830 IDs and frozen baseline fields, all 246 initial terminals, synthetic
first recurrence and inclusive capture→cycle→cutoff priority, safe metadata,
unchanged neighboring files, and byte-identical repeated exports. Small-board
survival and horizon fixtures are explicitly synthetic settings, not sweep rows.

An additional **uncached** execution of `ZombiePlanner.step` reproduces every one
of the 4,830 treatment rows over 66,131 actual transitions. All 4,584 nonterminal
initial choices agree at tick 0, tick 9,999, and a real cap of one transition.
This exhausts the nonterminal position domain. An exported `decisions.json`
supplies all choices for the independent worker's comparison; the checks in this
report are engine-side validation, not a claim that an independent oracle was
already reviewed. Existing core tests pass 13/13; existing sweep/proof suites
pass 17/17. Viewer/browser and independent-oracle review are separate integration
checks, not claimed here.

## Measured cost and evidence

Measured locally using the requested
`/Users/tr/.hermes/node/bin/node`, which reports **v26.8.1** on this host (not a
claim of an executed Node 22 run). No installs, added dependencies, services,
training, GPU work, commits, or pushes were needed for this engine task.

| Measurement | Observed |
| --- | ---: |
| Paired build, including source/evidence checks and two writes | 1,234.886416 ms |
| Build process peak RSS (`resourceUsage().maxRSS`) | 80,144 KiB |
| Build process current RSS at receipt | 82,083,840 bytes |
| `planning.json` | 1,047,793 bytes |
| `planning-data.js` | 1,047,826 bytes |
| Combined publishable data | 2,095,619 bytes (about 2.00 MiB) |
| Uncached all-treatment-row plus all-choice clock verification | 3,728.078208 ms |
| Uncached verification process peak RSS | 78,704 KiB |

These are local observed process measurements, not performance guarantees or
estimates. RSS covers the process, not isolated planner allocations. The build
runs one VM sweep under a 30-second wall watchdog, memoizing position-only human
choices across starts. At most 4,584 nonterminal choices are needed. Each run
retains only a position-to-first-tick map; complete trajectories are computed only
for selected replays. The uncached verification has a separate 60-second watchdog.

Worker artifacts are in `/tmp/zl008-engine/`: the two data files,
`build-metrics.json`, `verification.json`, `decisions.json`, `selected-replays.json`,
`verify.cjs`, `red-cli.tap`, and `green.tap`. Earlier red/green slices are in the
execution transcript; `red-cli.tap` is specifically the CLI preimplementation
failure, not a fabricated receipt of earlier tests. The local dataset metadata is
`7d311337c3ff1b4929840603ac79871e05f1f179+engine-working-tree`, not a clean new commit.
Publication can regenerate the deterministic rows with its own actual source SHA.

SHA-256 bindings:

| Artifact | SHA-256 |
| --- | --- |
| unchanged `simulation.js` | `4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568` |
| frozen prior `evidence/all-starts/sweep.json` | `da7d74eba9e97403a45a5cd76954d4d3537482b7592e9752b3d530bf3fce0327` |
| `planner.js` | `ea535e5a564ca133cdcf1cfa339c359d967d7d89a64640f3e9e8bc977000cb6a` |
| local `planning.json` | `8b6a5b72e2a2f68ab3a11d39b4036f99d7488d929339abd70f197399d75035ff` |
| local `planning-data.js` | `c269bffe4696fce6517de48286534c33ad99eef1108d35bffdff9b6e48579b2a` |

## Interpretation and limits

This result favors **this planner against this known deterministic zombie** on
this exact finite board and start domain. It adds model-based prediction and a
new scoring objective, not merely “more intelligence.” The human has perfect
knowledge of the fixed zombie dynamics; the baseline does not exploit that model.
Depth, model access, and scoring are bundled, so this experiment does not isolate
the causal contribution of two-tick depth. A separately preregistered one-tick
model-based ablation could address that question.

There is no learning, adaptation to unknown dynamics, noise robustness, human
behavior claim, generic intelligence claim, or statistical sample/uncertainty
estimate. The recurrence proof depends on fixed deterministic position-only
rules; altered tie order, stochastic moves, other boards, obstacles, partial
information, or another zombie policy require a new experiment. Initial captures
remain losses and must not be silently excluded from headline totals.

## Reproduce

From this worktree, with no install:

```sh
NODE=/Users/tr/.hermes/node/bin/node
"$NODE" --test scripts/test-planning.cjs
PREVIEW_COMMIT="$(git rev-parse HEAD)+engine-working-tree" \
  "$NODE" scripts/build-planning.cjs /tmp/zl008-reproduction
"$NODE" test-node.cjs
"$NODE" --test scripts/test-sweep.cjs scripts/test-proof.cjs
```

For the selected same-start paired replay, use the integrated
[planning viewer](../planning.html); earlier [comparison](../compare.html) and
[start sweep](../sweep.html) remain separate unchanged experiments.
