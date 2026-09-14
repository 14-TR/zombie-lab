# ZL-007 · Why starting position changes capture time

## Question and controlled comparison

With the same deterministic agents, board and capture rule, can moving a starting position by one cell change the duration? Yes: with zombie **Z `(2,4)`**, human **H `(1,0)` captures at tick 11**, while **H `(2,0)` captures at tick 73**. Both capture. Position-dependent duration and universal capture in this particular world are compatible findings.

This is an **existence claim about timing dependence**, not a claim that every perturbation matters. The earlier one-cell comparison H `(7,2)` versus H `(6,2)`, again with Z `(2,4)`, captures at **73 in both cases**. No sampling, probabilities, statistical significance, learning or general-human claims are involved.

Control: unchanged `simulation.js`, fixed **10×7** board, one human and one zombie, simultaneous one-cardinal-cell-or-stay moves, Manhattan distance, human maximizes separation, zombie minimizes separation, and **north → east → south → west → stay** tie order. Sharing a cell or cardinal adjacency captures; diagonal proximity alone does not. Production also checks exchanges. Only starting positions vary between conditions; the common experiment safety limit is 10000.

Source baseline: `f492ffd4af091fc88da2352673a5019e849559a6`, with **uncommitted ZL-007 certificate additions** for the receipt below. This is not a claim of a clean committed implementation. Source SHA-256:

- `simulation.js`: `4ee5817ba528b163fca1347c49ad4c48de2dcae226dd800065e5048b5b9bb568`
- unchanged `scripts/build-sweep.cjs`: `8e5ede1d6045c7f2c27d0a4098c79a36b1d4179a26e9606b8b8dfe365636ceb0`

## Finite, exact theorem and its certificate

**Theorem for this exact configuration:** every distinct ordered initial pair of cells captures in at most **77 movement ticks**, under the production movement/capture rules with the experiment's 10000-tick safety limit. The complete state table assigns the exact remaining capture time to every permitted start. This is a **machine-checkable finite certificate plus an elementary descending-rank argument**, not a general analytical theorem for arbitrary pursuit worlds.

Let `s = (human position, zombie position)`. A terminal position has Manhattan distance at most one. Let `F(s)` be the next ordered pair returned by the **actual production `step`**, for a nonterminal position before the safety cutoff. The certificate supplies a nonnegative integer `T(s)` satisfying:

1. Every terminal state has `T(s) = 0` and `successor = null`.
2. Every nonterminal state has a recorded successor `F(s)` in the table.
3. Every nonterminal state obeys **`T(s) = T(F(s)) + 1`**.

The checker validates domain completeness, actual production successors, integer/nonnegative ranks, terminal classification, the local rank equation and the reported summary. It does **not** invoke the certificate generator or its graph/rank construction to replace supplied evidence. It then independently executes the existing `buildSweep` runner and compares each start's rank to that start's capture tick, not just aggregate totals. The checker shares the unchanged production policy and small source/position helpers with the builder; it is independently callable validation, **not** a separately authored policy oracle or a formal proof-assistant kernel.

**Descending-rank argument:** a nonterminal state cannot have rank zero, since its successor's rank is nonnegative. Each move decreases rank by exactly one. Starting from rank `k`, after exactly `k` moves rank is zero and the state must be terminal; it cannot terminate earlier, because terminal states have rank zero. A nonterminal cycle would strictly decrease rank and then return to its original value, a contradiction. The verified maximum initial rank is 77, so all starts capture within that bound. Terminal states have no outgoing edge in this graph; production's idempotent `step` on an already stopped state is not a nonterminal cycle.

### Why positions suffice—and where they do not

For fixed board dimensions, `choose` reads only the current two positions, fixed movement directions/tie order and the fixed flee/chase role. There is no random choice, velocity, stored policy state or dependence on past decisions. Both choices use the old positions. `reason` and `decisions` are reporting fields and do not affect future choices.

Capture at current contact depends only on position. Post-move contact also depends only on position. Although the resolver checks exchanged positions, a legal one-cell exchange requires the agents to have begun cardinal-adjacent; production catches that state **before movement**, so exchange detection adds no hidden history to a reachable nonterminal transition here.

**Positions alone do not encode the full raw application state:** `tick`, `tickLimit` and `status` can stop execution. For one-step graph construction we normalize to `running`, tick 0, limit 10000, and clear only reporting fields. This exposes the production movement map **before cutoff**, rather than treating a clock stop as physics or survival. The rank proof is for that position map; because 77 is below the experiment cutoff, every certified trajectory finishes before the cutoff can intervene. The manual application's unchanged **40-tick default** still stops the 73-tick witness at `limit`, not at capture. That shorter execution is not a counterexample and is not a proof of indefinite survival.

### Domain and terminal closure

Cell ID is `y*10+x`; key is `z<zombieId>-h<humanId>`. All distinct ordered starts are enumerated in zombie-ID order, then human-ID order: 4830 unique rows. Same-cell **starts** are excluded; cardinal-adjacent starts are included and captured at true tick zero.

Every row contains `key`, `humanId`, `zombieId`, explicit `human`/`zombie` positions, `terminal`, `successor` and `rank`. If a production step reaches an overlapping pair not in the distinct-start domain, the builder appends it as a terminal row of rank zero. The checker requires those successor rows and rejects extraneous unreachable overlap rows. In this measured production graph **no overlapping successor is reached**, so there are exactly 4830 state rows. A labeled synthetic test forces legal shared-destination moves through the production resolver to exercise overlap closure; it is not a production finding.

## Exact findings

| Certificate check | Result |
| --- | ---: |
| Distinct starts and complete state rows | 4830 |
| Initial terminal/adjacent states, rank 0 | 246 |
| Nonterminal states with checked production edges | 4584 |
| Additional reachable overlapping terminal states | 0 |
| Start ranks matching independently executed sweep rows | 4830 |
| Nonterminal cycles | 0 |
| Maximum rank | 77 |
| Starts attaining that maximum | 67 |

| Witness key | Human | Zombie | Exact capture tick |
| --- | --- | --- | ---: |
| `z42-h1` | `(1,0)` | `(2,4)` | 11 |
| `z42-h2` | `(2,0)` | `(2,4)` | 73 |
| `z42-h26` | `(6,2)` | `(2,4)` | 73 |
| `z42-h27` | `(7,2)` | `(2,4)` | 73 |
| `z60-h0` | `(0,0)` | `(0,6)` | 77 |

The timing-effect witness diverges immediately: from H `(1,0)` the next human position is `(0,0)`; from H `(2,0)` it is `(3,0)`. In both cases the zombie moves to `(2,3)`. The bounded board and fixed tie order select different trajectories; initial separation alone is not an exact capture-time formula. The table certifies their complete durations, not merely their first-step divergence.

## Reproduction and measured resource receipt

No dependencies, packages or frameworks were installed. No simulation, source-viewer or workflow changes were made by the certificate worker. The CLI writes **only `proof.json`**, retaining all existing files in its destination. Its full state table fits below the 2 MB bound; it fails rather than silently omitting states if that bound is exceeded. Metadata defaults to `PREVIEW_COMMIT` (otherwise `unknown`); do not label uncommitted work as a clean commit.

```sh
node --test scripts/test-proof.cjs
node test-node.cjs
node --test scripts/test-sweep.cjs scripts/test-preview.cjs scripts/test-sweep-view.cjs

PREVIEW_COMMIT='f492ffd4af091fc88da2352673a5019e849559a6 + uncommitted ZL-007 proof' \
  /usr/bin/time -lp node scripts/build-proof.cjs /tmp/zl007-proof

# The packaging command; retains other preview artifacts:
PREVIEW_COMMIT="$(git rev-parse HEAD) + uncommitted ZL-007 proof" \
  node scripts/build-proof.cjs preview

# Independently check a serialized artifact against this checkout:
node -e 'const fs=require("node:fs"); const {checkProof}=require("./scripts/build-proof.cjs"); console.log(checkProof(JSON.parse(fs.readFileSync(process.argv[1]))));' \
  /tmp/zl007-proof/proof.json
shasum -a 256 simulation.js scripts/build-sweep.cjs /tmp/zl007-proof/proof.json
```

`buildProof({commit})` returns JSON-ready data without writing. `checkProof(proof)` returns `{valid: true, ...summary}` or throws on invalid evidence, without repairing it. `buildTransitionGraph(simulation)` and `assignRanks(states)` are exported for focused synthetic tests; `assignRanks` fills ranks in the supplied rows. Those test helpers do not make production `buildProof` configurable. CLI output directory precedence is explicit argument, `PREVIEW_OUTPUT_DIR`, then `preview`.

One measured CLI run on installed **Node v26.8.1/macOS**, including building, checking, two complete sweep cross-checks and writing, returned **1.58 s real, 1.62 s user, 0.01 s system**, with maximum resident set size **92372992 bytes**. Its internal measured elapsed time was **1550.360 ms**. Other regression processes were active; this is an execution receipt, not a controlled performance benchmark or an estimate for other machines.

Measured `/tmp/zl007-proof/proof.json`:

- **665650 bytes**, including all 4830 rows and the final newline.
- File SHA-256: `0669c46e2234e57e06a4adcefee7473b474e7336c7d000db00db4bd661b7ac6c`.
- Metadata-independent SHA-256 of Node `JSON.stringify(proof.states)`: `639a145cba69e73eaa4d01171f048f358e5b417b8c958c7c96279dc4ea57d797`.
- Exact commit metadata for that file hash: `f492ffd4af091fc88da2352673a5019e849559a6 + uncommitted ZL-007 proof`.

## Verification and limits

Executed **7/7 proof tests**, **13/13 unchanged production-core tests**, and **34/34 existing sweep/preview/explorer Node tests**. The proof tests reject wrong successors, wrong ranks, missing and duplicate states, inconsistent positions/keys/terminal flags, fractional/negative ranks, wrong source/config/summary, and invalid commit metadata. They verify all starts against the sweep, every initial capture, maximum and timing witnesses, deterministic output, destination preservation, synthetic overlap closure, and rejection of synthetic cycles/missing successors. All 4830 pairs also receive a production comparison with changed pre-cutoff clock/reporting fields; the manual 40-tick cutoff is explicitly preserved.

TDD red failures were observed for the absent builder, absent checker export, missing CLI artifact, missing graph/rank test exports, and absent commit-type validation before their implementation steps. The unchanged-production memorylessness/cutoff checks are regression observations, not newly implemented physics.

This report establishes the certificate component only. **ZL-007 synchronized A/B UI, capture-time and sensitivity-map browser checks, review, packaging, CI, merge and live Pages/source-SHA verification remain parent integration gates; none is claimed verified here.** Existing historical reports/evidence remain untouched. The finite result does not generalize to other dimensions, obstacles, speeds, populations, tie orders, policies, stochastic behavior, learning or humans.
