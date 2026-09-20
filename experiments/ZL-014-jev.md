# ZL-014 — Jev predictive world-model pilot

## Result

**Jev was not a reliable exact world model for this toy domain.** It classified immediate capture correctly for 94/108 legal actions, but indefinite avoidability for only 34/108. Separately, its direct human-action choice preserved a winning successor in 23/24 states. A mostly useful action choice does not establish correct dynamics, long-horizon prediction, or a working closed-loop planner. The simulator, policies and previous experiments remain unchanged.

[Open the prerecorded phone viewer](../jev.html) · [JSON](../jev.json) · [CSV](../jev.csv) · [Preregistration](ZL-014-protocol.md)

## Question, control and intervention

Can a pretrained typed-judgment model predict the unchanged ZL-009 two-zombie world and its exact ZL-010 avoidability labels from natural-language rules and old positions? The control is deterministic production physics plus the independently checked exact certificate. The intervention is **prediction only**, followed by a separate direct action-choice question. Jev outputs are not used to run the simulator, recompute certificate truth, or select a multi-step policy.

The board is 10×7. Zombies minimize Manhattan distance to the old human position, simultaneously, with first ties N/E/S/W/stay. Shared/cardinal contact captures before and after movement; diagonal contact alone does not. Both zombies may overlap. Indefinite avoidance is existence of a human strategy that avoids capture forever, not survival to a time limit.

Baseline `7bb12e5b0c84bd2f14c2e90360dfca64c8313d17`. Preregistration commit `ff1ae8a`; prompt/evaluator source commit `f55100b`; frozen dataset/request commit `8f60c4b`; pre-inference reference/runner commit `ceb4129`. Model pinned and returned as **`jev-1.13.0`**, prompt `ZL-014-v1`. The original certificate remains byte-for-byte historical evidence with its original provenance, not a newly solved or relabeled artifact.

## Fixed sample and information boundary

The original fixed-Z1 slice contains 4,761 permitted starts. Removing initial contacts leaves 4,259 nonterminal starts. Ascending ordered IDs use `((z1*70+z2)*70+h)`, with Z1=42 and cell `10*y+x`. We chose eligible index `floor(i*(4259-1)/23)`, i=0..23, endpoint inclusive. All 24 selected states happen to admit indefinite avoidance. This limits conclusions: no paid starting state tests action quality when capture is unavoidable.

All 108 legal human actions are retained. Each state received one request containing two zombie Choices, capture and successor-avoidability Nouls per legal human action, and one independent human Choice: **288 total questions**. Requests included rules, positions and legal candidates only, never oracle ranks, scores, answers or recommendations. Questions cannot see one another's responses. No generated rationale was requested or recorded.

Independent reference validation checked all 24 states, 108 action transitions, 48 zombie decisions and oracle ranks; its full-domain certificate proof covered 343,000 ordered states and 1,351,892 legal nonterminal actions. The post-run independent CLI also accepted all 2,232 supplied field assertions with zero mismatches. Reference verification is not implementation review. See [pilot parity](../evidence/jev/reference.json), [independent check](../evidence/jev/independent-check.json), [frozen truth](../evidence/jev/reference-truth.json) and [certificate proof](../evidence/jev/reference-certificate.json). Synthetic boundary, initial-contact, co-location and tie controls did not consume paid requests.

## Measured results

All 24 admissions returned HTTP 200 with the pinned model. All 288 answers passed the preregistered schema/probability checks. There were **zero service failures, missing answers, invalid answers, retries, warmups or replacement samples**.

| Judgment | Correct / denominator | Accuracy | Brier score |
|---|---:|---:|---:|
| Z1 next move | 17 / 24 | — | not a binary judgment |
| Z2 next move | 18 / 24 | — | not a binary judgment |
| Both zombies pooled | 35 / 48 | 72.92% | — |
| Both zombie moves correct in a state | 12 / 24 | — | — |
| Immediate capture, each legal action | 94 / 108 | 87.04% | 0.120807 |
| Successor admits indefinite avoidance | 34 / 108 | 31.48% | 0.313215 |

Binary predictions use p≥0.5. Truth labels: 29 capturing versus 79 noncapturing actions; 77 indefinitely avoidable versus 31 losing successors. Immediate-capture confusion counts are TP=28, TN=66, FP=13, FN=1. Avoidability confusion counts are TP=3, TN=31, FP=0, FN=74: Jev mostly failed to recognize winning successors, rather than falsely declaring losing successors winning. Its typed interface did not guarantee true answers.

Brier is the mean squared probability error. Valid-only and full-denominator missingness-penalized Brier coincide here because every answer was valid. The evaluator retains missing/invalid responses in full-denominator accuracy as failures and assigns them loss 1 in an explicitly labeled missingness-penalized Brier; it also reports valid-only Brier with coverage. Such missingness is separated from model mistakes. These 24 purposively selected states do **not** establish probability calibration.

### Human action choice, evaluated separately

| Metric | Result |
|---|---:|
| Valid legal choice | 24 / 24 |
| Immediate noncapture | 23 / 24 |
| Successor preserves possible indefinite avoidance | 23 / 24 (95.83%) |
| Oracle-objective optimal (any equally good move) | 23 / 24 |
| First-tied canonical oracle agreement | 8 / 24 |
| Oracle-winning starting states | 24 / 24 |
| Oracle-losing starting states | 0 / 24 |

Preserving a winning successor means a good future strategy **exists**. It does not mean Jev would choose that strategy on later ticks. We did not combine its risk probabilities into a planner, run a learned closed-loop trajectory, or measure Jev's actual indefinite survival. Canonical disagreement among winning actions need not be harmful.

The one failed direct action is retained: `sample-03`, state `206223`, H=(3,0), Z1=(2,4), Z2=(6,0). Jev chose E to (4,0). The true simultaneous zombie endpoints are (2,3) and (5,0), making the human cardinal-adjacent to Z2 and immediately captured. S, W and stay are winning alternatives. Jev correctly predicted both zombie moves here, but assigned capture probability 0.33 to E and chose it independently. This is an observed typed output error, not an invented explanation of its reasoning.

## Usage, timing and bounds

Real run started **2026-09-20T22:24:43.600111Z**. Admission-to-completion wall time was **6,682.848 ms**. Per-request end-to-end latency (including connection/response recording work, not pure model execution): minimum **210.449 ms**, median **255.719 ms**, mean **276.790 ms**, maximum **528.188 ms**, n=24. No warmup or latency tuning.

Provider usage totals: **52,984 input tokens and 7,354 output tokens**. Current official price checked before admission: **$0.042/M input tokens, output free**. Usage-derived estimated cost: **$0.002225328**, **not an invoice**. Conservative frozen preflight estimate was **$0.015372084**, treating each actual request byte plus 8,192 overhead units as input tokens. Neither estimate is a provider-enforced billing cap.

Maximum actual request body was **7,570 bytes**, below the 16 KiB contract; at most 13 questions per request, below the hard limit 18. The fixed-host standard-library client follows no redirects, retries no requests, admits at concurrency one, fsyncs each admission before transport, enforces 30-second request / 15-minute run deadlines and bounds responses at 64 KiB. Failures consume admission; rerunning the live batch is refused. All paid capacity for this pilot is exhausted.

[Run identity and checked-price hash](../evidence/jev/recording/run.json), [admission ledger](../evidence/jev/recording/admission.jsonl), [completion receipt](../evidence/jev/recording/complete.json), [frozen request/source hashes](../evidence/jev/frozen/manifest.json). Every response and per-attempt receipt is retained with SHA-256; no credentials or authorization headers are present.

## Reproduce offline — no key or paid calls

```sh
node --test scripts/test-jev.cjs scripts/test-jev-view.cjs scripts/test-jev-release.cjs
python3 -B scripts/test-jev-runner.py
node scripts/verify-jev-reference.cjs
node scripts/build-jev.cjs preview
```

Open `preview/jev.html` locally. The normal PR and Pages pipelines execute this offline build and package JSON, CSV, reports and frozen recordings. The public viewer has `connect-src 'none'` and no inference client or secret. `scripts/run-jev.py` is an explicitly authorized local-only tool, not part of the build; CI is rejected even if live consent is passed. **Do not run it again for this pilot.**

Browser verification uses the existing cached Playwright/Chromium installation; no packages or browser downloads are required. The browser receipt and release/build resource receipts are separate from the immutable first-run API measurements. Public deployment, downloaded-PR-artifact checks and independent exact-source implementation review are parent-owned release gates, not implied by local tests.

## Interpretation and limitations

This pilot supports keeping the exact simulator and certificate as truth. It does not support replacing their physics or long-horizon avoidability with these Jev predictions. The direct choice result is more favorable than the indefinite-avoidability judgments, but 23/24 one-step choices in an all-winning, purposive sample cannot establish a safe policy. Repeating the run, tuning prompts or adding samples would be a new preregistered experiment with new authorization, not a repair of these negative results.

No randomness, fresh heldout population, calibration study, multi-step learned planning, training or general-intelligence test is claimed. The richer typed questions test this particular English formulation and frozen model version. Prior reports and evidence remain historical snapshots.
