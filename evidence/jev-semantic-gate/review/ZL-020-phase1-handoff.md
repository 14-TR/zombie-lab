# ZL-020 phase-1 handoff

## Frozen candidate — ready for parent-owned phase 2

- Worktree: `/Users/tr/Projects/zombie-lab-jev-semantic-gate`
- Branch: `experiment/jev-semantic-gate`
- Clean immutable base: `e87d88b7335d556d8c0ed5ac240ac8ddbd24aeb0`
- **Source/protocol/parser/development freeze: `073da696555a7370ac292f665446695dbd20560f`**, committed 2026-09-21T05:01:16Z, before any new heldout access.
- Tree: `3b70ce3455c797760a9e6e7fe5a55001ae98b59a`.
- Manifest: `evidence/jev-semantic-gate/source-freeze.json`; SHA-256 `c5a01c4c450567df341e68a56f7e547f821c4ad399eea68db07b92335bd3fa6c`.
- Clean status freshly verified. 17 additions, zero inherited edits. All 1,081 inherited tracked files verified byte/mode identical to base in BOTH old and new worktrees.
- **Zero paid calls; no new heldout paths/files opened; no prepared requests or recording directory exists.** No push/merge/publication/install/skill/notes writes. This is an unreviewed preregistration commit, not release approval.

Block start 04:53Z; phase-1 requested checkpoint 05:04Z; implementation cutoff 05:38Z; verification checkpoint 05:53Z, all 2026-09-21 UTC and lead-enforced. Parent owns remaining deadline enforcement.

## Implemented and verified offline

Deterministic constraint derives required clarification from interpreted fact/policy labels, keeps raw interpretation/clarification untouched, and only adds ASK (never erases a raw ASK). Gate metadata separates raw versus code authority. Invalid labels fail closed. Exhaustive 3,456 closed-label states passed. Fact/policy extraction errors can still bypass the gate; an explicit wrong-Ash extraction reaches simulated capture in a passing negative-control test. NOT a safety guarantee.

New simulator wrapper fixes secondary solo completion when erroneous together interpretation actually collects Mara. Old simulator/evidence unchanged. New decoder rejects duplicate JSON keys at all depths and requires reported argmax (ties allowed), retaining only bounded distribution-sum rounding tolerance.

Transparent clause grammar handles questions, conditional/unknown evidence, negated goals, source scope, wider synonym/word-order patterns; matched and skipped clauses/policies are exported. Development 18/18 passes. Reused OLD ZL019 diagnostic: 13/20 exact versus original published parser 10/20; not fresh evaluation, not strong-NLP superiority. Grammar limitations remain explicit.

Separate runner uses new fixed ledger, pinned jev-1.13.0, env-only key, max 24 total admissions including failures, no retries/warmups, permanent run marker, fsynced pre-network admissions, 30s/call timeout and stop after transport/HTTP failure. Inherited bounded transport/campaign helpers are imported immutably. Worst configured byte-plus-overhead estimate is **$0.04128768**, below $0.05 at observed $0.042/M input tokens; estimate is not a provider-enforced dollar ceiling. Live price is checked before admission. Actual CLI CI refusal exercised with both docs and HTTPS transports set to fail if touched; no network touched.

Fresh OFFLINE unit/development regression: **18 tests passed (8 new + 10 inherited), zero failures/errors/skips**. Viewer JavaScript parsed with installed Node; responsive source/export fixture verified, **not browser/phone interaction verified**. No fresh heldout performance or useful-demo claim.

## Exact phase-2 interfaces

New source files:
- `scripts/semantic_gate.py`: `adapt(raw_five_field_dict)` returns raw interpretation, raw clarification, required clarification, raw/gated decisions, reasons, gate_changed. `simulate(decision, world, authorized_goal)` fixes only the secondary completion predicate.
- `scripts/semantic_gate_io.py`: `loads(raw)` duplicate-rejecting JSON; `decode(raw_response, request)` returns unchanged five Choices.
- `scripts/semantic_gate_parser.py`: `parse({'state': {'text': text}})` returns interpretation and transparent grammar evidence.
- `scripts/freeze_semantic_gate.py`: `verify_source()`, `prepare(directory,cases,source_commit,spec,development)`, `verify_prepared()`.
- `scripts/run_semantic_gate.py`: new bounded single-use CLI; never invoke old runner.
- `scripts/build_semantic_gate.py`: `record(case,target,request,raw_body,receipt)`, `evaluate`, `summary`, `collect`, `export`; pure offline export plus phase-2 CLI.
- `scripts/semantic_gate.html`: recorded-case request/report selector, interpreter and raw/gated selectors, simulator play/pause/reset/scrub, complete frames, raw JSON, parser explanation and JSON/CSV downloads. CSP disables connections; no free-text inference or credential path.

Frozen protocol: `experiments/ZL-020-protocol.md`. Frozen new development/spec: `evidence/jev-semantic-gate/{development,spec}.json`. Six new test files named `scripts/test_semantic_gate*.py`.

Parent chooses NEW input/gold locations after independent author release. Inputs JSON: list of `{id,text,group?,stratum?}`; unique ID regex `[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, 1–24 rows. Gold JSON: exact ID-keyed object of `{interpretation:{mara_at_depot,ash_in_east,west_blocked,policy,clarification},world:{mara_at_depot:boolean,ash_in_east:boolean,west_blocked:boolean},...optional annotation}`. No gold/world/group/ID enters request state; only text, frozen rules and development examples. Parent independently validates gold/controller agreement.

Only AFTER explicit phase-2 release, from new worktree:

```sh
python3 -B scripts/freeze_semantic_gate.py --phase2-authorized --inputs /PARENT/APPROVED/inputs.json
# Parent commits prepared manifest, request/parser files and independently checked truth snapshot BEFORE paid admission.
# verify_prepared() requires the prepared manifest AND every covered file committed and unchanged.
python3 -B scripts/run_semantic_gate.py --phase2-authorized --live-authorized
python3 -B scripts/build_semantic_gate.py --phase2-authorized --inputs /PARENT/APPROVED/inputs.json --gold /PARENT/APPROVED/gold.json --out /NEW/OFFLINE/EXPORT
```

First command creates only `evidence/jev-semantic-gate/prepared/{manifest.json,requests/*.json,parser/*.json}`. Second uses only `evidence/jev-semantic-gate/recording/` and must never be rerun/refilled. Third outputs `index.html`, `recorded-cases.json`, `metrics.csv`, `ZL-020-protocol.md`. Existing output directories fail rather than overwrite. Parent owns independently authored heldout integration/validation, blind comparator, candidate-bound independent review, fresh performance evaluation and conditional browser/320px demo checks.

## External evidence / known issue

- Durable contract: `/Users/tr/Projects/zombie-lab-evidence/ZL-020-goal.md`.
- Audit script: `ZL-020-phase1-verify.py`.
- Receipts: `ZL-020-phase1-assets/{verification.json,unit-tests-v2.txt,inherited-sha256.json}`.
- Historical-only working export: `ZL-020-phase1-assets/development-site/index.html` (OLD s06a, original prompt/response; raw MOVE becomes gated ASK; not new inference or browser-verified demo).
- Initial audit harness replaced socket before ssl import, causing six harness import errors; corrected by importing ssl first. Preserved initial `unit-tests.txt`; successful rerun is `unit-tests-v2.txt`. No production fix or hidden failing test suppression.

Remaining acceptance: independent source review; heldout truth/request freeze and actual bounded campaign; blind comparison; performance-based demo decision; real browser/phone interaction checks. No scientific claim beyond offline gate consistency and historical development diagnostic is made now.
