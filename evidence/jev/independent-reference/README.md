# ZL-014 independently frozen reference

This directory is **oracle preparation, not review of the new Jev implementation**. The oracle uses Python's standard library. No paid calls, network calls, packages, solver reruns, or modifications to the legacy repository are needed. The new `/Users/tr/Projects/zombie-lab-jev` implementation and its results were not opened.

## Authority and source identity

- Durable authority: `/Users/tr/Projects/zombie-lab-evidence/ZL-014-goal.md` (hash in `FREEZE.json`).
- Read-only legacy repository: `/Users/tr/Projects/zombie-lab-neural-two-tick`.
- Legacy HEAD: `1bf90b4584fad715dcca2686a9e242b6c2a2195f`.
- Contract origin/main: `7bb12e5b0c84bd2f14c2e90360dfca64c8313d17`.
- Both trees: `03ae34d74ed14e3ab5124f5844c3d8a39e2b8b31`.
- Physics: legacy `two-zombies.js`; original slice enumeration: `scripts/build-two-zombies.cjs` lines 44–55; certificate ID contract: `experiments/ZL-010-protocol.md` line 13.
- Reused certificate: `/Users/tr/Projects/zombie-lab-neural-two-tick/evidence/avoidability/data/avoidability-certificate.json`.
- Certificate SHA-256: `a1f47e74bb5d4f086aedd8d6c01f51edd37e390c74adeb8eae4bc4d0bbc7dfc8`.

The certificate's historical metadata commit is `a64fae29f6498750a4cd0d6ad14ed781e8d72247`, not today's baseline commit. This is not relabeled or regenerated. All four source hashes in its metadata exactly match the legacy baseline files. Every CLI truth/check invocation verifies that byte identity and those source hashes; `verify-certificate` independently checks all mathematical rank laws again.

## Frozen sample contract

Coordinates are zero-based on a 10×7 board. Cell ID is `10*y+x`. A complete ordered-state numeric ID is:

```
stateIndex = ((zombie1Cell * 70 + zombie2Cell) * 70 + humanCell)
```

The original fixed-Z1 slice has `zombie1Cell=42`, i.e. `(2,4)`. Its loop order is zombie2 cell `0..69` outside human cell `0..69`. It excludes **only** human sharing either zombie's cell. Zombie1 and zombie2 may share a cell. Cardinal-adjacent starts were permitted in the original slice but were immediately captured.

The original printable ID is exactly `z2-<zombie2Cell>-h<humanCell>`; it is NOT a decimal state ID and MUST NOT be lexicographically sorted. Ascending numeric complete-state IDs, ascending `70*zombie2Cell+humanCell`, and the original enumeration order coincide on this fixed-Z1 slice.

1. Enumerate the original **4,761** permitted starts.
2. Keep only nonterminal starts: both human–zombie Manhattan distances must exceed one. There are **4,259**.
3. Sort by ascending numeric `stateIndex`.
4. For each `i=0..23`, choose zero-based eligible index `floor(i*(4259-1)/(24-1))`, implemented with integer division. This includes both endpoints, not a `M/24` spacing or rounded index.
5. Keep all in-bounds human actions for each selected state.

`selected-inputs.json` contains the actual 24 selected states, indices and legal actions. This answer-free file is the only reference export suitable as a state-input source for the producer. The original overlap exclusion is a *sampling restriction*, not a restriction on reachable states or the certificate: the oracle accepts all 343,000 ordered states, including contacts and co-located zombies.

## Physics and truth semantics

- Action codes and first-tie order: `0=N`, `1=E`, `2=S`, `3=W`, `4=stay`; only in-bounds destinations are legal. Exact strings `N`, `E`, `S`, `W`, `stay` are accepted as input aliases.
- Each zombie independently minimizes Manhattan distance to the **old human position**, using that action order. It does not react to a proposed human destination or block the other zombie.
- Initial shared/cardinal contact captures before movement. Diagonal adjacency alone does not capture. On initial contact, no action is available and no zombie actually moves.
- Otherwise all three chosen moves occur simultaneously. Shared destination or cardinal adjacency captures. A one-cell position exchange would already have started in cardinal contact, so initial stopping has priority.
- Rank `-1` means the state admits indefinite avoidance under some human strategy. Rank `0` means contact. Positive rank is the maximum number of future moves before forced capture, assuming the human maximizes delay. Clock cutoffs are not part of these positional truths.
- `successorAvoidable` is `successorRank == -1`, **not** merely the negation of immediate capture. The selected human action must be assessed using its actual successor independently of any predicted binary judgment.

## CLI and input schema

Executable: `/Users/tr/Projects/zombie-lab-evidence/ZL-014-reference/oracle.py`.

```sh
REF=/Users/tr/Projects/zombie-lab-evidence/ZL-014-reference
python3 -B "$REF/oracle.py" select
python3 -B "$REF/oracle.py" truth --input "$REF/selected-inputs.json"
python3 -B "$REF/oracle.py" check --input /absolute/path/to/producer-check-records.json
python3 -B "$REF/oracle.py" verify-certificate
python3 -B "$REF/test_oracle.py"
node "$REF/legacy-parity.cjs"
```

`--input` defaults to stdin; `--out FILE` writes JSON instead of stdout. Do not point output at a frozen reference file. Input accepts one record, a nonempty record array, or an object containing a nonempty `records` array. `--jsonl` instead reads one record per nonblank line. Input is bounded at 16 MiB. The producer can send either:

```json
{"stateIndex":205802,"action":"E"}
```

or:

```json
{"human":{"x":2,"y":0},"zombie1":{"x":2,"y":4},"zombie2":{"x":0,"y":0},"action":1}
```

Positions and stateIndex, when supplied together, must agree. Optional original-slice `id` must exactly match canonical spelling and positions; leading-zero repairs are not performed. Optional `legalActions` must match the complete legal list. `selectionIndex` and `eligibleIndex` are accepted transport metadata, not checker assertions; put any facts to validate in `expected`. Unknown record fields are rejected. Integers exclude booleans and floats.

Omitting `action` returns the complete state truth plus an `actions` array in legal action order. Providing it returns one action's fields directly alongside state truth. Terminal states have `actions:[]`, `legalActions:[]`, `zombieMoves:null`; an explicitly supplied well-encoded action on a terminal state returns the unchanged state, `captured:true`, `elapsedTicks:0`, even if that direction would leave the board. Malformed action encodings are still rejected by the CLI schema.

State truth fields:

- `stateIndex`, `human`, `zombie1`, `zombie2`: original state.
- `terminal`, `rank`, `avoidable`: original state classification.
- `legalActions`: all executable human action codes, empty on contact.
- `zombieMoves`: two ordered `{zombie:1|2, action, actionName, from:{x,y}, to:{x,y}}` records, or null for initial contact.
- `id`: preserved when supplied.

Action truth fields:

- `action`, `actionName`, `humanDestination`, `elapsedTicks`.
- `successorIndex` and `successor:{human:{x,y},zombie1:{x,y},zombie2:{x,y}}`.
- `captured`, `successorRank`, `successorAvoidable`.

The `truth` envelope has `schemaVersion:1`, `kind:"ZL014-evaluation-only-truth"`, certificate hash, and `records`.

### Producer assertion/check interface

Add a **nonempty** `expected` object to every record. Its keys address returned truth fields. Nested objects compare only supplied keys; arrays must have the same length and order. Types are strict (`0` does not equal `false`). Missing/unknown expected keys fail rather than being ignored.

```json
[
  {
    "stateIndex":205802,
    "action":"E",
    "expected":{
      "captured":false,
      "successorAvoidable":true,
      "successor":{"zombie1":{"x":2,"y":3}}
    }
  }
]
```

`check` reports `ok`, `recordCount`, `fieldChecks`, `mismatchCount`, and localized `mismatches`. Exit status is **0** on success, **1** on a truth mismatch, **2** on malformed input or identity failure. This checks only fields provided: a successful partial assertion is not a complete producer audit. For full parity, send each of the 24 states with complete zombie decisions and every action's full successor/capture/avoidability fields, then independently verify the state/action counts and exact selected IDs.

## Artifacts and evidence

- `reference.json`: evaluator-only truth for all pilot states/actions; **NEVER include in API inputs**.
- `edge-inputs.json`, `edge-reference.json`: nine explicitly synthetic offline controls, not additional paid pilot states.
- `certificate-verification.json`: rechecked complete existing certificate, counts, rank/transition digests, runtime/RSS; no all-state graph exported.
- `legacy-parity.cjs`, `legacy-parity.json`: real unchanged-production comparison for all pilot actions and synthetic controls. This is **not** a review of the new Jev implementation.
- `test_oracle.py`, `tests.txt`, `red-*.txt`: actual stdlib tests and retained expected-failure stages. Tests include endpoint selection, ties/simultaneity, bounds, co-location, contacts, malformed inputs, CLI good/bad expectations, synthetic full rank fixture, and rank/domain/identity corruption.
- `artifact-summary.json`: programmatically reconciled pilot counts and retained storage.
- `FREEZE.json`, `SHA256SUMS`: timestamped source/contract/proof/artifact binding. The freeze precedes this worker's access to any new Jev implementation/results; this worker has no such access. The parent must use the freeze as the admission gate before live inference.

Transition digest serialization is compatible with the legacy exact-check format: ASCII `ZL010-TRANSITIONS-v1` plus LF; ascending state IDs `0..342999`; each state header is little-endian `<IBB` (uint32 ID, uint8 terminal, uint8 degree), followed by each legal nonterminal action in tie order as `<BIB` (uint8 action, uint32 successor ID, uint8 captured). Terminal degree is zero. There is no padding or footer. Per-zombie1 partition hashes omit the magic. Rank digest uses signed int32 little-endian in ascending state ID with no header.

## Reusable isolation procedure

Keep reference ownership disjoint from the producer; read only the approved legacy physics, original enumeration and historical exact certificate. Establish literal edge fixtures first, then derive the sample with integer arithmetic and verify it against original numeric ordering. Recheck certificate source identity and rank laws without rerunning a solver or retaining a graph. Test the record interface on both matching and deliberately false assertions. Compare only to unchanged legacy production. Freeze source, truth bytes, tests and protocol hashes before opening new implementation outputs; later review must report its own distinct evidence rather than overwrite this snapshot.
