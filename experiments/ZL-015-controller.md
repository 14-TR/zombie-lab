# ZL-015 — Jev predicts the zombies and controls the human

**This is now a real closed-loop controller, not just a one-step prediction exercise.** Jev chose the human's actual move at every executed tick. The unchanged simulator—not Jev—chose both zombies' actual moves and checked capture.

[Open the paired phone replay](../jev-controller.html) · [JSON](../jev-controller.json) · [CSV](../jev-controller.csv) · [Preregistration](ZL-015-protocol.md)

## What happened

| Starting state | Jev-controlled human | Existing greedy human | Existing depth-2 human |
|---|---|---|---|
| 205802: H(2,0), Z1(2,4), Z2(0,0) | Not captured through tick 12; unresolved cutoff | Not captured through tick 12; unresolved cutoff | Not captured through tick 12; unresolved cutoff |
| 210697: H(7,6), Z1(2,4), Z2(9,6) | Captured at tick 7 | Captured at tick 7 | Not captured through tick 12; unresolved cutoff |

**Jev controlled the human successfully as software, but this bounded test shows no survival advantage over the simple greedy policy.** The existing depth-2 planner did better on the second start. Reaching the 12-tick cap does not prove survival forever. These are two deterministic, previously observed starting configurations, not statistical or heldout evidence.

Jev and greedy had identical complete frames in the second run. Their first runs differed at tick 12, despite having the same bounded outcome. Equal outcome totals do not imply identical decisions.

## Fixed design and information boundary

TR authorized this follow-up in Discord message `1551360601064734891`, after clarifying: **predict the zombies; control only the human**. ZL-014 remains a separate, unchanged prediction pilot with its original exhausted 24-request ledger and negative results.

The two starts are the endpoint samples `sample-01` and `sample-24` from ZL-014, selected by the preregistered endpoint rule before ZL-015 inference. Maximum 12 actual decisions per start, ending early on capture. At most 24 new requests including failures; no unused budget reallocation or post-result reruns. Both starts initially admit indefinite avoidance according to the independent exact certificate.

At every tick a single request asks three independent Choice questions: each zombie's next move and the human's move. The question text is inherited verbatim from the corresponding ZL-014 questions. State contains only unchanged rules, actual old positions and all legal candidates. No ranks, recommended moves, oracle scores or other question responses are sent. The human question prefers indefinite avoidance, otherwise maximum delay, first ties N/E/S/W/stay. The model is **`jev-1.13.0`**.

The simulator executes the human Choice but obtains zombie endpoints exclusively from unchanged production physics. All agents move simultaneously from the old positions. **Jev's explicit zombie predictions are diagnostics, not commands or inputs to the human question.** There is no safety filter, fallback policy, training, learned dynamics substitution, prompt tuning or behavioral memory. A malformed human choice stops rather than inventing a move.

Comparators use the unchanged greedy and depth2 implementations from the same positions with the same real 12-tick cap. The planner's hypothetical clock remains its original clock-independent one. No live-model recurrence is labeled a proven cycle; the hosted model is not assumed to return identical choices on repeated states.

## Measured decisions and prediction quality

- **19 real requests**, all HTTP 200 with the pinned model. Run 1 used 12; run 2 used 7 before capture. All 57 Choice answers were valid. No failures, missing answers, retries, warmups or replacements.
- Zombie predictions: **34/38 correct** on the actually visited states.
- Human choices: **18/19 immediately noncapturing**, and **18/19 preserve a successor from which some future strategy can avoid capture indefinitely**.
- First loss of exact avoidability: none in run 1's observed window; tick 7 in run 2, coinciding with immediate capture.
- The five unspent admissions are **not** used to repair or extend the result.

Before each paid request, an independently authored frozen Python oracle validated every legal action's production successor, actual zombie moves, capture and exact rank for the actual current state. These checks are evaluator-only and were never included in API state. The offline exporter replays every recorded human action through the production simulator and checks all raw request/response hashes, trajectory frames and source identities again.

### Concrete failure, without invented reasoning

Before run 2 tick 7, H=(7,0), Z1=(5,1), Z2=(8,1). Jev predicted Z1 would move E, but the fixed first-tie rule makes its actual move N. It correctly predicted Z2's N move. Independently, Jev chose human W with probability 0.54.

The actual successor is H=(6,0), Z1=(5,0), Z2=(8,0): cardinal adjacency to Z1 captures the human. Human S was a winning alternative. The prediction error and bad action co-occurred; because the questions were independent, this is **not** evidence that the explicit prediction answer caused the action. No rationale was generated.

## Cost, latency and provenance

- Preregistration commit: `e413e98`.
- Controller/runner implementation commit: `df1d106`.
- Committed two-start/source freeze before inference: `70626f6`.
- Batch elapsed time: **7,571.482 ms**, including bridge/oracle checks and local file work.
- Per-request end-to-end latency: minimum **183.705 ms**, median **238.677 ms**, mean **251.808 ms**, maximum **413.054 ms**, n=19; no warmup. This is not pure model latency.
- Provider usage: **25,226 input tokens; 2,734 output tokens**.
- Official price checked before calls: **$0.042/M input tokens, output free**.
- Usage-derived estimate: **$0.001059492**, not an invoice or provider-enforced cap.
- Largest actual request: **2,948 bytes**, three questions. Bounds: 16 KiB request, 64 KiB response, 30-second absolute request timeout, 15-minute run limit, concurrency one, 24 maximum admissions.

The fixed HTTPS client has no redirect/retry path. Each exact dynamically reached request is written and hashed before a durable fsynced admission. Future request states could not be frozen in advance because they depend on preceding real model choices; their construction rules, initial states and source bytes were committed before inference. Both experiments have separate single-use ledgers. Credentials/headers are never recorded; the browser and CI contain no paid-call path.

[Source/start freeze](../evidence/jev-controller/frozen/manifest.json) · [Run identity](../evidence/jev-controller/recording/run.json) · [Admission ledger](../evidence/jev-controller/recording/admission.jsonl) · [Completion](../evidence/jev-controller/recording/complete.json). Individual request/response/receipt files and the full trajectories are in the same recording directory.

## Reproduce offline

```sh
node --test scripts/test-jev-controller.cjs scripts/test-jev-controller-release.cjs scripts/test-jev-controller-view.cjs
python3 -B scripts/test-jev-controller-runner.py
node scripts/build-jev-controller.cjs preview
```

Open `preview/jev-controller.html`. The read-only viewer synchronizes Jev, greedy and depth2 on a shared timeline, labels local ticks, holds each captured endpoint, exposes every original frame, and compares per-tick zombie predictions with actual simulator moves. There is no live API connection. Original ZL-014 files remain unchanged in this isolated follow-up worktree except additive offline workflow integration.

## What this is useful for

The experiment separates three questions: can the integration execute Jev's decisions safely as code; does Jev anticipate the zombies correctly; and does its human policy actually avoid capture? The first worked, while the latter two have measurable errors. It provides a reproducible controller testbed, **not evidence that Jev is needed or superior in this exact-solver toy world**. Larger samples, longer horizons, a safety-filter condition or changed prompts would be separate preregistered work, not a retroactive improvement to these results. Independent review, PR/CI and live publication are separate release gates.
