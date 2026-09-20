# ZL-014 evidence

This directory contains **real prerecorded** `jev-1.13.0` requests/responses, not synthetic output. The 24-request authorization is exhausted; do not rerun paid inference.

- `frozen/`: dataset, manifest, and all 24 exact request bodies committed before inference. Oracle labels exist only in the dataset/evaluator, never in request state.
- `recording/`: fsynced pre-network admissions, untouched bounded response bodies, per-attempt receipts, run identity/checked-price hash and completion receipt. No credentials or authorization headers.
- `reference*.json`: independently authored truth/certificate/legacy parity snapshots copied, compared against every pilot state/action, then committed before paid admission. These are the actual admission evidence and must not be overwritten.
- `independent-reference/`: the reference worker's later final frozen bundle, including its full proof, edge tests and source. Its formal freeze is timestamped **after** the paid batch; it is not relabeled as the earlier admission gate. That worker did not read the new implementation or results before freezing. The pre-admission truth and certificate hashes match the final bundle; the legacy parity receipt was later expanded and both versions are retained.
- `producer-check.json`, `independent-check.json`: post-run additional assertion input generated from our frozen dataset, checked by the independent worker's real `oracle.py check` interface: 24 state records, 2,232 assertions, zero mismatches.
- `tests/`, `browser/`: actual test/browser receipts, with candidate identities. Synthetic API fixtures are isolated tests, never substituted for the paid recording.

The report is `experiments/ZL-014-jev.md`. `scripts/build-jev.cjs` verifies hashes and production/reference parity, evaluates the recordings offline, and emits `jev.json`, classic-script `jev-data.js`, `jev.csv`, reports and evidence to the normal site build. Browser execution does not call TypeSafe. CSV `truth` for the human Choice is the complete optimal-action set separated by `|`, consistent with its correctness flag; the separate canonical action is retained in JSON and viewer.

Frozen API and simulator results do not change when a release is rebuilt. Build commit/source hashes and build resource receipts describe that build, not the original inference source or provider latency. A local browser check is not downloaded-PR-artifact or live-Pages verification. Independent truth verification is not implementation review.
