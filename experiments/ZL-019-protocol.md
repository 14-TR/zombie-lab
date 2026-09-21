# ZL-019 preregistration: language-to-epistemic-state and policy

## Question and scope
Can pinned Jev1.13.0 interpret modestly varied operational language better than a development-only deterministic phrase parser, and does that change observable decisions in a fixed toy evacuation scene? This is the recommended semantic boundary, NOT a learned numerical world model. No arithmetic, coordinate prediction, physical-domain extension, training, or real-world actuation.

Authored purposive pilot:20 heldout texts in10 scenario groups, two paraphrases per group, and6 labeled development groups. Development and heldout groups disjoint; paraphrases stay together. Fresh relative to this project/development only. The same author defines protocol/gold; gold is not independent expert annotation or provider-pretraining holdout. No significance/generalization/calibration claim. Parser is fixed on development before test authoring; Jev receives permitted development examples, the identical scene/schema/options and each test text. IDs/group/stratum/hidden world/gold are evaluator-only.

## Closed semantics (read these literally)
Player starts at Yard. Mara is a companion; Ash is a zombie. Track exactly these propositions: `mara_at_depot`, `ash_in_east`, `west_blocked`. West refers to the west passage, East to the east passage. Other named entities and places do not substitute for these.

Each proposition selects exactly one of six wire values: `known`, `negated`, `suspected_positive`, `suspected_negative`, `conflicting`, `unreported`. In the structured assertion output, the two suspected values both have epistemic status `suspected`, with explicit positive/negative polarity; `known` is positive and `negated` negative; conflicting/unreported have no single polarity. These are evidence labels, not simulator truth.

A current explicit firsthand observation/inspection by the report's narrator supports known/negated. Bare unqualified factual narration is also narrator testimony. A hearsay/report/rumor, quoted other person's observation, guess, or possibility supports only suspected of the stated sign—even if the quoted speaker says “I saw”. Any active positive AND negative evidence for a proposition is conflicting, regardless of source strength. A matching direct claim plus report is known/negated; no majority voting or source override. No chronological updates/retractions occur in this benchmark. Silence, questions, hypothetical/conditional clauses, uncertain pronouns with no unique referent, and “I do not know whether” are unreported, not negative. Commands are not evidence of events.

Bounded policy: `solo` = explicitly evacuate player without collecting Mara; `together` = evacuate with Mara / do not abandon her; `hold` = explicitly stay/wait rather than evacuate; `unclear` = missing, incompatible, or out-of-scope goal. The test is interpretation, not permission to obey arbitrary text.

Clarification selects `none`, `goal`, `evidence`, `both`. `goal` iff policy is unclear. `evidence` iff ANY tracked proposition has suspected-positive/negative or conflicting evidence. This intentionally conservative clarification rule asks even for irrelevant uncertain claims. Silence alone is not a request for clarification; the controller separately refuses an unverified route/companion. The independent clarification question must interpret the text directly; parallel questions cannot see each other's output. Cross-field inconsistencies are measured, not repaired.

## Deterministic downstream contract
A short abstract graph, not a change to historical Zombie Lab grid physics: Yard→East→Shelter or Yard→Depot→West→Shelter. World truth is evaluator-only (Mara at Depot, Ash East, West blocked). No other zombie motion or new domain dynamics.

Controller consumes only interpreted fields, never hidden truth. Malformed response, unclear goal, or non-none clarification: ASK at Yard. Hold: WAIT. Solo: choose East only with `ash_in_east=negated`; otherwise West only with `west_blocked=negated`; otherwise ASK. Together: require `mara_at_depot=known` AND `west_blocked=negated`; otherwise ASK; then collect via Depot and West. Known safety cannot be created from suspected/unreported input. Same frozen controller for parser, Jev and gold-input. No confidence threshold or post-test repair. Simulator executes chosen route against hidden world: Ash at East captures; blocked West stops; collect Mara only if actually at Depot; reaching Shelter marks evacuation. Full initial/intermediate/stopping frames retained. No safety guarantee claimed: a wrongly interpreted “negated” hazard can still cause a bad action.

## Comparisons and primary outcomes
Gold-input is a privileged ceiling, not a competitor. Parser and Jev get identical request JSON; parser ignores unsupported constructions rather than consulting hidden labels. Retain raw parser output with matched spans and raw Jev HTTP body, probabilities/confidence, errors and usage.

Primary descriptive outcome: exact five-field wire interpretation (three assertion labels, policy, clarification), all20 attempted/planned rows. Also report per-field components, explicit status/polarity components, whole-scenario-group all-paraphrase correctness, benign versus ambiguous/conflict strata, confusion counts, contradiction and clarification detection.

Unsupported assertions: predicted known/negated whose gold is not that exact verified label (including wrong sign). Also count guessed claims where gold unreported, and suspected→verified promotion separately. False-action: controller moves when gold controller does not, OR takes a different route/policy than the gold controller (report counts and conditional-on-movement rate). Observable consequences: capture, blocked route, companion collected, shelter reached, goal-completion, gold trace agreement. Distinguish semantic errors hidden by guardrails from genuine adapter success.

Abstention: ASK; coverage: non-ASK decisions (explicit WAIT included), plus movement coverage separately. Useful coverage = non-ASK and gold trace match. Missing/service/schema failures count as incorrect exact/components and abstention, never silently dropped. No optimizing confidence on test.

Adoption stays pending: evidence of semantic added value vs this weak parser is not superiority to general LMs; separate blind other-model comparison and independent review remain gates. Agent-assisted comparator sees same text/instructions/examples/options but has different harness/latency scope, NOT matched API timing.

## Freeze, cost, and execution
Pin jev-1.13.0.20 planned admissions; hard ceiling24 including failures; concurrency1; no retries, replacement cases, warmups or paid dev. Single-use run marker and fsynced append-only admission before network I/O; separate ZL019 campaign and ledger. Failures consume admission; first network failure stops further admissions and unattempted rows remain failures. Pre-inference commit freezes source, instructions, input, evaluator gold, answer supports, protocol, requests, source receipts and byte digests. Existing old tracked files and prior external evidence are preserved byte-for-byte.

Official docs source receipts in `evidence/jev-semantics/sources.json`: live models says input$0.042/M tokens, output free. Immediately recheck before inference. Conservative estimate uses `(wire_bytes + 8192) * price / 1e6` per request; reject aggregate>$0.05. Estimate not invoice/provider hard cap. Maximum wire32KiB, response128KiB, absolute30s per request, campaign900s. CI/GITHUB_ACTIONS and absent explicit live flag refuse before key/transport. Environment key never logged. Offline tests/build run keyless.

## Test and artifact gates
TDD receipts: real failing tests before implementations of each behavior slice. Required split/input whitelist leakage tests; direct vs reported polarity/conflict/clarification; strict missing/malformed/out-of-set/probability response validation; deterministic paths; metric denominators; durable admission failure/cap/restart/CI; frozen and historical byte corruption. Offline self-contained phone HTML with per-case full raw/structured facts and synchronized gold/parser/Jev traces, selection, play/pause/scrub and exports. Actual cached Chromium at320/390/1200; no install or publication. Local incremental commits only.

Start2026-09-21T04:14:04Z; implementation cutoff04:59:04Z; verification checkpoint05:14:04Z. Parent owns blind comparator/review/canonical notes. No independent review claimed by implementation author.
