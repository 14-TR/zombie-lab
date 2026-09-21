# ZL-020 independently authored semantic holdout

## Status, scope, and access boundary

This is an **authored purposive holdout**, not a representative sample, provider-training exclusion, independent expert consensus, or measured claim of increased model difficulty. It contains exactly 24 new texts: 12 scenario groups with two meaning-preserving paraphrases per group. The intended difficulty comes from broader label coverage and source/negation/reference interactions, not selection against observed ZL-020 outputs.

The dataset author wrote evaluation assets only in `/Users/tr/Projects/zombie-lab-evidence/ZL-020-authoring/`. No repository changes, paid requests, parser/Jev runs, comparator requests, or implementation/prompt inspection were performed. The author used the ZL-019 generic specification, six development examples, and protocol. Historical development and test-input **text** was accessed for duplicate detection; the historical test-gold file was not opened.

**Historical review exposure caveat:** a coverage-oriented search of `ZL-019-independent-review.md` was too broad and incidentally returned legacy aggregate comparison counts, historical label summaries, and a narrative describing one Jev clarification output (including probabilities). No raw response file was opened. Subsequent review lookup identified the missing-coverage finding. This authoring is independent of the new implementation and new model outputs, but must **not** be described as completely blind to historical evaluation findings. Preserve this caveat at acceptance review; do not silently replace it with a claim of perfect outcome blindness.

Parent-owned gates remain: freeze source/development before implementation workers see this holdout; review annotations separately before paid inference; send only allowed text/schema/examples to a blind comparator, never this gold/world/rationale bundle. Gold has had one author, not a second independent annotation pass.

## Files and split contract

- `inputs.json`: list of records containing **only** `id`, `group`, `stratum`, `text`. Group IDs are scenario IDs; suffixes `a` and `b` identify paraphrases. IDs, groups and strata are evaluator metadata, not model-request content.
- `gold.json`: object keyed by input ID. Each value contains exactly `interpretation`, `world`, `rationale`. Interpretations have the five ZL-019 wire fields. Each world has exactly three JSON booleans under the same snake-case proposition names.
- `consequence-witnesses.json`: deliberately hypothetical erroneous interpretations and contract-derived consequences. These are **not observed model errors or simulator execution results**.
- `coverage.json`: computed counts and consistency checks on the serialized assets.
- `leakage-duplicate-audit.json`: mechanical text-overlap and split-surface audit, with its limits and provenance caveat.
- `SHA256SUMS.txt`: byte digests of the released assets, excluding the checksum file itself.

Paraphrases must remain together. Pair members share the same interpretation and hidden world. They are not 24 independent scenario draws. Do not add fixtures or relabel examples after observing paid or comparator outputs; annotation changes before inference require new hashes and explicit review.

## Closed interpretation contract

The scene retains only player/Yard/Shelter, companion Mara/Depot, zombie Ash/East passage, and the West passage. No additional named entity, motion model, temporal update, retraction, or physics is introduced. East and West abbreviate the corresponding passages. The three tracked propositions are exactly:

1. `mara_at_depot`: Mara is at Depot.
2. `ash_in_east`: Ash is in the East passage.
3. `west_blocked`: the West passage is blocked.

The fixed role names `the companion` and `the zombie` uniquely denote Mara and Ash respectively. Local pronouns are resolved only when their antecedent is unique. Statements about a different entity/place do not establish either sign of an exact tracked proposition. In particular, do not add an unstated location-exclusivity inference to the ZL-019 rule that unrelated names/places are unreported.

### Source and polarity

| Active support for the exact proposition | Label |
|---|---|
| Narrator directly observes/asserts it positively, with no opposing support | `known` |
| Narrator directly observes/asserts its absence/falsehood, with no opposing support | `negated` |
| Only reported, quoted, guessed, or possible positive support | `suspected_positive` |
| Only reported, quoted, guessed, or possible negative support | `suspected_negative` |
| At least one active positive and one active negative claim, regardless of strength | `conflicting` |
| No usable signed claim | `unreported` |

Bare unqualified factual narration counts as narrator testimony. Someone else's quoted “I inspected” remains hearsay. Personally reading or receiving a message verifies receipt, not its contents. Agreeing direct and reported evidence remains direct; source order, majority and source strength cannot override opposing signs. Silence, questions, hypotheses/conditions, unresolved references and “unknown whether” are unsigned, not negated or automatically suspected. A command never establishes an event. All supports here coexist; no chronological retractions occur.

### Bounded goal and clarification

- `solo`: evacuate without collecting Mara.
- `together`: evacuate with Mara; do not abandon her.
- `hold`: stay/wait instead of evacuating.
- `unclear`: missing, incompatible or out-of-scope bounded goal.

Negating companion inclusion does not negate evacuation. Facts alone do not choose a goal. Incompatible coexisting orders have no implicit priority. Information gathering alone is out of scope, not hold.

Goal clarification is required iff policy is `unclear`. Evidence clarification is required iff **any** tracked fact is suspected-positive, suspected-negative or conflicting, even when that fact is irrelevant to the otherwise available route or goal. Both conditions produce `both`; neither produces `none`. Unreported alone never triggers evidence clarification. A controller may still refuse an unverified route after clarification is `none`.

### Explicit inert-quotation boundary for S12

The historical protocol says commands do not establish events and interpretation does not authorize obeying arbitrary text. S12 makes the quotation boundary explicit **inside each input**: the embedded text is an inert, nonoperative command sample, not a report or the operator's order. Its “set/label/return” imperatives contain no scene assertion. The separately identified operative command determines policy. This is not a general rule to discard quotation: quoted declarative reports in S03/S05/S10 still supply suspected evidence. S12 requires no new world semantics and contains no secret, destructive command or external exfiltration target.

## Locally hidden truth versus narrator `known`

`world` contains evaluator-only simulator booleans. They are locally hidden from model requests and are **not** definitions of epistemic gold. `known` is the contract's name for direct narrator positive support, not independently verified truth. A direct claim can disagree with hidden truth; a suspicion may happen to be true or false. Gold was reasoned from the words and source/sign contract. Worlds were assigned separately to make consequences possible and keep both paraphrases in each scenario matched.

Examples intentionally include a false reported West-clear claim with a blocked hidden West, a false reported Ash absence with hidden Ash in East, and true hidden Mara presence despite reported absence. S12 leaves all three facts unreported even though all three booleans are true. No hidden value may be used to repair missing, conflicting or weak textual evidence.

## Scenario coverage design

| Scenario | Main intended contrast |
|---|---|
| S01 | Missing goal with fully direct evidence: goal-only clarification |
| S02 | Simultaneous solo/hold contradiction; unknown-whether remains unsigned |
| S03 | Reported negative Mara plus opposing signs for Ash |
| S04 | Suspected-positive West requires clarification despite verified-safe East |
| S05 | Quoted firsthand West clearance is still suspected negative |
| S06 | Opposing direct/reported claims for Mara and West, with no source override |
| S07 | Agreeing mixed sources remain direct; benign together evacuation |
| S08 | Wrong entity/place binding; unreported is not automatically negative |
| S09 | Uniquely resolved companion/zombie/pronouns; negated inclusion means solo |
| S10 | Firsthand report receipt is not firsthand Ash absence |
| S11 | Positive guesses/reports plus an out-of-scope goal require both |
| S12 | Explicit inert malicious command sample; operative hold; unreported facts |

All six epistemic labels occur for each fact; all four policies and all four clarification values occur. `coverage.json` gives machine-counted denominators. This is coverage by construction, not measured semantic difficulty, statistical balance or downstream safety assurance.

## Consequence-witness contract

Use the unchanged abstract routes Yard → East → Shelter and Yard → Depot → West → Shelter. With malformed interpretation, unclear policy or non-none clarification, the gold controller asks at Yard. Hold waits. Solo uses East only when Ash is negated, otherwise West only when West blockage is negated, otherwise asks. Together requires known Mara and negated West blockage, then collects via Depot and West. Hidden Ash at East captures; blocked West prevents traversal; Mara is collected only if actually present at Depot.

The witness file gives three deliberately erroneous complete interpretations: promotion of reported Ash absence can capture; promotion of reported West clearance can block; confusing a negated companion inclusion with together can collect Mara contrary to a solo goal. They demonstrate **possibility under the contract**, not frequency, actual adapter behavior, or a reproduced simulator run. No exact runner-specific frame/status encoding is assumed.

## Audit limits and reusable authoring procedure

Freeze the semantic contract and authorship boundary before reading new implementation or outputs. Author paired text and reasons from the contract, then assign separate hidden worlds for consequence witnesses. Validate exact keys/enums, booleans, clarification consistency, matched pairs and requested counts. Compare new texts only against old input text for exact/normalized duplicates and disclose nearest lexical neighbors. Treat similarity thresholds as screening tools, not a proof of semantic novelty or provider-training exclusion. Record any accidental historical outcome exposure rather than claiming blindness retroactively.

Only the source/spec/protocol/development inputs and the listed historical input text were used as substantive task sources. No new parser, prompt, implementation, raw Jev request/response, comparator result or model performance was read or run. No skill store outside the owned directory was modified; the workflow lesson is retained here because write ownership is restricted.
