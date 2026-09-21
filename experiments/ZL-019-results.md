# ZL-019 results — language-to-state/policy adapter

## Finding

**Jev interpreted19/20 texts exactly versus10/20 for the development-only phrase parser, but made one false action by omitting required evidence clarification.** All60 named-assertion labels and all20 goal policies were correct. The negative clarification result is retained: the pilot supports semantic added value over this particular parser, not autonomous adoption, safety, a learned world model, or superiority to a stronger language model.

The20 authored texts comprise10 scenario groups with two paraphrases each. This is a purposive, same-author pilot, fresh relative to project/development examples only—not a representative sample, independently annotated gold, provider-pretraining holdout, or20 independent scenarios. The parser recognized all10 canonical `a` texts and none of the more varied `b` texts. This deliberately exposes a bounded phrase grammar's generalization limitation; it is not a competitive NLP-parser benchmark. No heldout-driven parser or prompt changes followed evaluation.

## Preregistered task and information boundary

A small Zombie-Lab-themed evacuation scene: Mara is a companion, Ash a zombie, and the player can reach Shelter through East or through Depot and West. Text reports/commands become three named proposition assertions, a bounded goal and a clarification choice. No coordinate inference, arithmetic, learned dynamics, traffic/hydraulics or physical actuation.

Wire labels `known`, `negated`, `suspected_positive`, `suspected_negative`, `conflicting`, `unreported` map to explicit epistemic status plus polarity. A quoted person saying “I saw” remains hearsay to the narrator. Opposing claims conflict even across source strengths; silence, conditionals, unknown-whether and wrong named entities are not negative facts. Six labeled development groups and10 test groups are disjoint, including complete five-field label signatures. Test paraphrases share their group and hidden world. IDs/group/stratum, annotations, gold and hidden world are excluded from model/parser request state.

The same deterministic controller consumes gold, parser or Jev fields. Only the simulator reads hidden world truth. The controller requires verified-negative hazards for a route and verified-positive Mara for collection; it never promotes suspected evidence into known truth. The independently returned clarification field is deliberately consumed unchanged and checked for inconsistency, not repaired after the result. These code-side constraints are not credited as model intelligence. The abstract graph is a new bounded diagnostic scene, not a modification of or claim about historical grid-simulator physics.

## Measured results

| Metric | Gold-input control | Phrase parser | Jev1.13.0 |
|---|---:|---:|---:|
| Exact five-field interpretation |20/20|10/20|19/20|
| Correct wire components |100/100|57/100|99/100|
| Groups with both paraphrases exact |10/10|0/10|9/10|
| Benign exact |10/10|5/10|10/10|
| Ambiguous/conflict exact |10/10|5/10|9/10|
| Gold-trace matches |20/20|15/20|19/20|
| Non-ASK coverage (WAIT included) |10/20|5/20|11/20|
| Useful coverage (non-ASK + correct trace) |10/20|5/20|10/20|
| ASK / abstentions |10/20|15/20|9/20|
| Movements |8|4|9|
| False actions / all rows |0/20|0/20|1/20|
| False actions / movements |0/8|0/4|1/9|
| Unsupported verified assertions |0|1|0|
| Suspected→verified promotions |0|0|0|
| Captured / blocked outcomes |0 /0|0 /0|0 /0|

Per-field Jev: Mara20/20, Ash20/20, West20/20, policy20/20, clarification19/20. Parser:14/20,11/20,11/20,11/20,10/20 respectively. Status and polarity components are separately exported, as are every field's confusion counts and conflict detection. No rows are dropped for service/schema failure; there were none. Gold-input is a privileged reference, not a competitor.

**Coverage is not safety.** Jev's extra movement was forbidden by the preregistered clarification rule despite reaching Shelter successfully. Accordingly the11 physical goal completions versus gold's10 are not a superiority result: one was completed when the reference appropriately asked. Parser's15/20 trace matches include10 ambiguous cases where ASK hides incomplete semantics. Report semantic and downstream metrics together rather than crediting blanket abstention as interpretation success.

## Preserved negative witness: s06a

> I see Mara at the depot. Niko says "I see Ash in the east passage". I checked the west passage is clear. Evacuate with Mara.

Jev correctly labeled Ash `suspected_positive`, Mara `known`, West `negated`, policy `together`, but chose clarification `none` instead of `evidence`. Returned clarification probabilities: none0.80, evidence0.18, goal0.01, both0.01; confidence0.74. Probability and confidence are separate returned fields, not inferred reasoning or calibrated workflow safety.

Under the frozen rule, any suspected/conflicting tracked claim requires evidence clarification even when irrelevant to the selected route. Gold stayed at Yard and asked. Jev executed Yard→Depot→West→Shelter, collected Mara, and completed the physical evacuation. Ash was absent from East in the hidden world. This is one **false-action / clarification-policy violation**, not an observed capture or blocked path. There was no post-hoc confidence cutoff, deterministic clarification repair, prompt tuning, replacement case or extra inference.

A future architecture could derive the redundant clarification gate from returned epistemic labels in code, but that is a proposed later intervention, not this experiment's measured result.

## Cost, timing and execution

- Exactly20 admissions,20 HTTP200 responses,100 valid Choices. Zero retries, warmups, paid development, replacement cases, service failures or schema failures. The campaign is permanently single-use; unused capacity under the24-request ceiling is not permission to rerun.
- Source/input/gold/request freeze: `e8e69d486e6a42adcb2abd725b59dd468c1286a7`. First raw campaign commit: `3e2ef09` (full identity in JSON). Source, evaluator, parser, protocol, requests and gold remain frozen.
- Official live Models page confirmed jev-1.13.0 at$0.042/M input tokens with free output immediately before admission. Source snapshots and retrieval hashes include the jaggedness, API, Choice, construction guide, function-calling cookbook and confidence docs.
- Conservative preregistered estimated ceiling$0.012976488 (<$0.05). Returned input usage44,905 tokens; usage-based estimate$0.001886010. Neither number is an invoice or provider-enforced billing cap.
- Actual campaign wall4,935.296334ms; per-request client/network-inclusive median236.4604165ms, concurrency1, fresh HTTPS connection, no warmups/retries. Full min/mean/max and token/output/body counts are in JSON. This is not server-only latency. Client peak RSS24,674,304bytes; hosted server CPU/RAM unmeasured.
- Finished inference2026-09-21T04:24:34.849814Z, before the04:59:04Z implementation cutoff. Start04:14:04Z, verification checkpoint05:14:04Z. Lead-enforced bounds, not OS quotas.

## Reproduce without paying

```sh
python3 -B -m unittest discover -s scripts -p 'test_semantics*.py'
CI=true GITHUB_ACTIONS=true env -u TYPESAFE_API_KEY python3 -B scripts/build_semantics.py /path/to/new/local/export
```

The build checks the committed pre-inference freeze, all84 frozen source/input files, all916 historical tracked files, and raw admission/request/response hashes; recomputes parser outputs, control decisions, scoring and traces; and exports self-contained `semantics.html`, complete `semantics.json`, and `semantics.csv`, with copied frozen/raw evidence and source documents. Existing differing evidence copies are refused, not overwritten. Local Git ancestry is required for provenance verification; the resulting HTML/JSON/CSV are offline and require no Git or server. Shallow/squash publication would require a later reviewed portable inclusion-proof change or preserved history.

Cached-browser verification uses `scripts/check-semantics-browser.cjs` and the existing Playwright-core/Chromium paths. Its receipt is a local-artifact gate, not independent review, physical iPhone/Safari, downloaded-artifact verification or publication. No dependencies or browser binaries are installed.

## Pending gates and blind comparator

Separate blind bundle: `/Users/tr/Projects/zombie-lab-evidence/ZL-019-blind-input`. Only five files: test texts/IDs, complete shared instructions/options, permitted development labels, exact output schema and readme. No heldout gold, parser predictions, Jev response, report, outcome or result-dependent hint. Bundle files are hash-bound to the pre-inference freeze. Parent owns dispatch and scoring of the other-model response; **pending, not run or fabricated here**.

Comparator output: `{"predictions":[{"id":"<test id>","interpretation":{"mara_at_depot":"<wire option>","ash_in_east":"<wire option>","west_blocked":"<wire option>","policy":"<option>","clarification":"<option>"}}]}`, exactly one entry per20 IDs. See `output-schema.json` for identical closed options. An agent-assisted other-model comparison has a different harness/latency scope; it cannot establish a direct matched-API speed advantage.

Independent scientific/implementation review, any subsequent remote CI/PR/publication, canonical project notes and shared procedural memory remain parent-owned. All commits are local; no push, merge or publication occurred. This author does not claim independent review.
