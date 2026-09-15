# ZL-011 — Tiny feed-forward imitation

## Result: learned behavior, but a failed planner-replacement test

**The real frozen-model evaluation completed. The network improved on its untrained initialization, but failed the preregistered comparison against both planners.** On the 4,761-start original slice it made **336 avoidable captures**, versus **24** for each planner, and introduced **317 depth-1 regressions / 328 depth-2 regressions**. It was also slower than both planners in the measured warmed decision benchmark. Negative outcomes are retained; no retraining, checkpoint selection, tuning, or model changes followed evaluation.

This is one fixed-seed imitation experiment in a deterministic toy world—not evidence about human intelligence, independent discovery, reinforcement learning, or statistical confidence. The [protocol](ZL-011-protocol.md) remains unchanged at commit `875c75ec5bc8c0b39179202ff570b6a5d4e10fbd`, on base `b22cf4990f10a694998e4a571b534ece8d46cd43`. Evidence is bound to the **dirty worktree** and explicit source hashes, not a clean release commit. Nothing was committed, pushed, merged, or published by this evaluation.

## Frozen intervention and provenance

- Inputs `[hx/9,hy/6,z1x/9,z1y/6,z2x/9,z2y/6]`; float64 **6–32 tanh–5**, 389 parameters; input-major `W1[6][32]`, `W2[32][5]`.
- Illegal actions are masked; first maximum in **N/E/S/W/stay** order. Initial contact terminates before inference. Runtime contains no dynamics model, solver, shield, search, or policy-action cache. The evaluator's caches do not change policy behavior.
- Actual seed-17 initialization and final epoch-40 model were reused. Trainer receipt records the single completed 40-epoch, batch-512 Adam run, 18,560 updates, 6.7093 seconds training-process wall time and 71,729,152 bytes peak RSS. These are **trainer-reported costs**, separate from the evaluation measured below. This evaluator did not run or modify the trainer.
- `/tmp/zl011-training/model-freeze.json` was durable before evaluation. Repo and training copies, including the classic wrapper, matched its raw SHA-256 values before and after evaluation:

| File | SHA-256 |
|---|---|
| `models/feed-forward.json` | `c2c007bcb27c68e7f52d61d8e21c3d2003c7331ccb16b84aa46adef87de48275` |
| `models/feed-forward-initial.json` | `2b977ed115c41ed2db8256ec25829e2bd4bb11b8484d899a80f4edf7a31b83ef` |
| `models/feed-forward.js` | `d995296cb49c23ed69fb9f330c15bcbc2d05209e302e0a3e3774013cfabdec13` |

The trainer receipt states that only manifest/train/validation were read during training and no test file was opened. The evaluator verified the freeze and unchanged dataset digests rather than retraining to reproduce that claim.

## Complete-domain and numerical verification

**22 inference/evaluation and unchanged physics tests passed**, with zero failures or skips. The real builder exited 0 with `fixture:false` and performed:

- All **343,000** exact-rank/contact checks and **1,351,892** legal production-successor rank-equation checks.
- **4,761 original paired rows**, each with greedy, depth1, depth2, actual initialization, and final network; **14,283** unchanged legacy scalar comparisons.
- **37,730 held-out paired rows**, each with actual initialization and final network, including contacts.
- **99,265 complete trajectories**, every one compared with uncached production replay; **1,438,294 frame-index comparisons**, including initial and stopping endpoints. Capture precedes first ordered `(human,zombie1,zombie2)` recurrence, which precedes unresolved cutoff 10,000.
- Independent Python reconciliation of every serialized row, domain order, split/contact membership digest, raw outcome count, finite-rank delay, paired cross-tab, and aggregate frame total. All 188 preflight-protected repo files and four dataset files were unchanged.

Both models were compared with independent NumPy inference over **all 300,212 nonterminal ordered states**. A second JS check consumed the trainer's hash-bound label-free export (`<I5dB5dB`, 86 bytes per row) and obtained the same bounds:

| Model | Logits compared | Maximum absolute error | Action disagreements | Legal top-two near ties ≤1e-10 | Minimum JS margin |
|---|---:|---:|---:|---:|---:|
| Final epoch 40 | 1,501,060 | 3.3861802251067274e-15 | 0 | 0 | 1.0800765853358207e-6 |
| Actual initialization | 1,501,060 | 1.1102230246251565e-15 | 0 | 0 | 5.646946081239168e-6 |

The specified tolerance is **1e-10**. Python also had zero near/exact ties. Binary state IDs were checked against the complete ascending nonterminal domain, not merely a record count. The trainer's model wrapper was executed and its payload matched the final JSON.

## One-step action accuracy by frozen split

The grouped split holds out unordered zombie configurations, not complete trajectories. All 343,000 memberships were independently recomputed and matched the frozen manifest; swapping zombie identities cannot cross a split.

| Split | Unordered groups | Ordered states | Initial contacts | Scored nonterminal examples |
|---|---:|---:|---:|---:|
| Train | 1,967 | 271,040 | 33,898 | 237,142 |
| Validation | 245 | 34,230 | 4,251 | 29,979 |
| Test | 273 | 37,730 | 4,639 | 33,091 |

“Optimal” means **any** legal successor preserving exact avoidability, or maximizing finite capture delay on an unavoidable state. “Canonical” means the first tied optimal action. These are different metrics.

| Model | Split | Optimal actions / examples | Optimal accuracy | Canonical agreement | Soft-target cross-entropy |
|---|---|---:|---:|---:|---:|
| Final | Train | 234,136 / 237,142 | 98.7324% | 35.4374% | 1.457804 |
| Final | Validation | 29,639 / 29,979 | 98.8659% | 35.8384% | 1.459477 |
| Final | Test | 32,689 / 33,091 | 98.7852% | 36.1488% | 1.459807 |
| Untrained | Train | 206,381 / 237,142 | 87.0284% | 3.4338% | 1.600210 |
| Untrained | Validation | 26,115 / 29,979 | 87.1110% | 3.2790% | 1.603478 |
| Untrained | Test | 28,959 / 33,091 | 87.5132% | 3.5569% | 1.605789 |

High one-step agreement did **not** imply comparable closed-loop survival. Even the untrained control scored 87.5132% on test one-step optimality while eventually capturing from every evaluated held-out start.

## Original slice: 4,761 starts, not wholly held out

This legacy regression slice contains **502 initial contacts**, **42 noninitial unavoidable starts**, and **4,217 avoidable starts**. Initial contacts do not measure decision quality.

| Policy | Captures | Proven cycles | Avoidable captures | Unresolved |
|---|---:|---:|---:|---:|
| Greedy | 4,761 | 0 | 4,217 | 0 |
| Depth 1 | 568 | 4,193 | 24 | 0 |
| Depth 2 | 568 | 4,193 | 24 | 0 |
| Actual initialization | 4,761 | 0 | 4,217 | 0 |
| Final network | **880** | **3,881** | **336** | **0** |

The network captured on **7.9677% of exactly avoidable original starts**. The preregistered success condition required fewer than 24 avoidable captures and no new capture/unresolved result on each planner's 4,193 cyclic starts. It failed both conditions for both planners.

| Comparator | Recovered avoidable captures → cycles | New cycles → captures | Unchanged cycles | Unresolved on comparator cycles | Success |
|---|---:|---:|---:|---:|---|
| Depth 1 | 5 | 317 | 3,876 | 0 | **No** |
| Depth 2 | 16 | 328 | 3,865 | 0 | **No** |

Equal planner totals do not mean the same starts succeed. Full paired cross-tabs are in `evaluation.json`. For starts where both policies captured **after tick 0**, the network was later/earlier/same on **0/26/35** starts versus depth1 (61 pairs; total delta −34 ticks), and **0/14/36** versus depth2 (50 pairs; total delta −21). Cycle-detection ticks are never subtracted as capture-time effects.

### Original results separated by starting split

Each policy cell is **avoidable captures / proven cycles**; all unresolved counts are zero. Full policy/contact/delay summaries are in `original-split-summary.json`.

| Starting split | Total | Initial contact | Noninitial unavoidable | Avoidable | Greedy | Depth1 | Depth2 | Untrained | Final |
|---|---:|---:|---:|---:|---|---|---|---|---|
| Train | 3,809 | 402 | 32 | 3,375 | 3,375 / 0 | 9 / 3,366 | 11 / 3,364 | 3,375 / 0 | 269 / 3,106 |
| Validation | 612 | 62 | 5 | 545 | 545 / 0 | 13 / 532 | 3 / 542 | 545 / 0 | 57 / 488 |
| Test | 340 | 38 | 5 | 297 | 297 / 0 | 2 / 295 | 10 / 287 | 297 / 0 | 10 / 287 |

The final network and depth2 have equal totals on the 340-row test subset, **not equivalent outcomes**: the network recovered nine depth2 captures but introduced nine captures on depth2 cycles; 278 starts remained cyclic and 44 remained captured. Split-specific paired cross-tabs are retained in `original-split-summary.json`.

## All held-out configurations: 37,730 starts

The resumed evaluator retains the readiness handoff's explicitly bounded **exact-avoidability-only** scope for this expanded cohort: final network and initialization were evaluated; expanded greedy/depth1/depth2 trajectories were **not** run. No all-held-out planner-superiority claim is made. This is a scope limitation, not an observed planner runtime failure.

The cohort contains **4,639 initial contacts**, **180 noninitial unavoidable starts**, and **32,911 exactly avoidable starts**.

| Model | Captures | Proven cycles | Avoidable captures | Unresolved |
|---|---:|---:|---:|---:|
| Actual initialization | 37,730 | 0 | 32,911 | 0 |
| Final network | **7,687** | **30,043** | **2,868** | **0** |

The network's exact-avoidability gap is **2,868 / 32,911 = 8.7144% captured**; the remaining 30,043 have proven recurrence. This improvement over initialization does not overturn the negative original-slice planner comparison.

### Finite-rank maximum-delay shortfall

Only unavoidable starts have a finite maximum capture time. Initial contacts have zero shortfall and are excluded from the decision-relevant means below. Full histograms, including contacts, remain in the JSON.

| Cohort | Policy | Noninitial finite starts | Positive shortfalls | Total lost ticks | Largest shortfall | Mean shortfall per noninitial finite start |
|---|---|---:|---:|---:|---:|---:|
| Original | Greedy | 42 | 10 | 21 | 4 | 0.500000 |
| Original | Depth1 | 42 | 1 | 1 | 1 | 0.023810 |
| Original | Depth2 | 42 | 1 | 2 | 2 | 0.047619 |
| Original | Untrained | 42 | 39 | 121 | 7 | 2.880952 |
| Original | Final | 42 | 11 | 18 | 5 | 0.428571 |
| Held-out | Untrained | 180 | 152 | 439 | 7 | 2.438889 |
| Held-out | Final | 180 | 45 | 72 | 4 | 0.400000 |

### Visited split overlap: starts are held out, trajectories are not

All serialized frames include initial and capture/repeated endpoints. Group memberships do not imply that every visited terminal state was a training example. Split-visit counts overlap; a trajectory can encounter more than one split.

| Model | Metric | Train groups | Validation groups | Test groups |
|---|---|---:|---:|---:|
| Final | Trajectories encountering split | 32,930 | 22,818 | 37,730 |
| Final | Frame visits | 573,813 | 57,244 | 129,237 |
| Final | Distinct ordered states | 40,039 | 5,200 | 37,730 |
| Final | Distinct unordered zombie groups | 1,708 | 213 | 273 |
| Untrained | Trajectories encountering split | 31,902 | 12,251 | 37,730 |
| Untrained | Frame visits | 130,970 | 17,009 | 60,889 |
| Untrained | Distinct ordered states | 47,030 | 6,256 | 37,730 |
| Untrained | Distinct unordered zombie groups | 1,703 | 213 | 273 |

## Actual warmed decision cost: no speed advantage

Measured on **Apple M4, macOS arm64, Node v26.8.1**, in the same JS realm: 256 fixed evenly spaced nonterminal states, three warm-up batches and 11 measured batches per policy, rotating policy order. Calls are uncached. Timings include input validation/normalization and loop/call/result-checksum overhead; overhead is measured, **not subtracted**. Loading, simulation, exact solving, and training are excluded.

| Decision | Minimum μs | Median μs | Maximum μs |
|---|---:|---:|---:|
| Final network | 2.5874 | **2.7420** | 2.8400 |
| Depth1 | 0.3934 | **0.4354** | 0.4920 |
| Depth2 | 1.8392 | **1.9761** | 2.5562 |
| No-decision loop/call overhead | 0.0107 | 0.0116 | 0.0129 |

The network was **6.298× slower than depth1** and **1.388× slower than depth2** by the observed medians. This is a bounded same-machine measurement, not a universal hardware or architecture result. All raw batch durations and state IDs are retained.

Real evaluation elapsed **11.406 seconds** inside the builder (outer process **11.586 seconds**) with maximum RSS **284.359 MiB**, below the 512 MiB target. Each launched process had an independent 900-second timeout; the builder had its 840-second watchdog. NumPy subprocesses used one BLAS thread. No installs or services were required.

The three emitted result artifacts total **15,045,364 bytes**, below the evaluator's 30 MB output cap. The trainer's pre-existing **25,818,232-byte** parity binary remains separately outside the repo and was not duplicated. **Combined retained evaluation plus training evidence exceeds a literal 30 MB total-artifact target**; preserving that verification evidence is disclosed rather than silently deleting it. Full dataset files also remain outside the repo, as preregistered.

## Deterministic witnesses and artifacts

Witness selection is first occurrence in original result order, deduplicated by ID; these examples are not representative samples. Missing categories would be omitted, not invented.

| ID | Reasons | Neural result | Stop tick | Stored frames |
|---|---|---|---:|---:|
| `z2-0-h2` | First neural cycle | Cycle | 38 | 39 |
| `z2-0-h11` | First regression to each planner; first avoidable neural capture | Capture | 1 | 2 |
| `z2-0-h30` | First noninitial unavoidable start | Capture | 4 | 5 |
| `z2-5-h3` | First recovery against each planner | Cycle | 16 | 17 |

Evidence directory: **`/tmp/zl011-eval/`**.

- `neural.json` / `neural-data.js`: all 4,761 original rows, summaries, and complete witness frames; emitted classic payload was read back and matched JSON.
- `neural-heldout.json`: all 37,730 paired expanded outcomes and exact-gap/overlap summaries.
- `evaluation.json`: source/model/artifact hashes, verification totals, one-step scores, paired outcomes, raw latency batches, resources.
- `verified-real.json`: independent serialized-artifact/count/split/hash reconciliation; `original-split-summary.json`: original benchmark by split.
- `frozen-export-parity.json`: second real all-state JS/trainer-export parity and model-wrapper verification.
- `preflight-real.json`, `frozen-models.json`: before-evaluation immutable identities and protected-file digests.
- `execution-real.json`, `verification-execution.json`: actual process commands, exit codes and watchdogs; matching `*.stdout.txt` / `*.stderr.txt` preserve execution output.
- `real-model-tests.stdout.txt`: 22 passing tests. The earlier `full-fixture-verification.json` and fixture logs remain unchanged, explicitly **not** learning results.

Training evidence stays in `/tmp/zl011-training/training.json`, `model-freeze.json`, `python-parity.json`, and `python-parity.bin`; dataset provenance remains `/tmp/zl011-dataset/manifest.json`.

## Reproduction and completion scope

From `/Users/tr/Projects/zombie-lab-neural`, using the existing NumPy interpreter (never invoking the trainer):

```sh
ZL_NEURAL_TEST_PYTHON="$HOME/.hermes/hermes-agent/venv/bin/python" \
  node --max-old-space-size=384 --test \
  scripts/test-neural.cjs scripts/test-two-zombies.cjs

# Use a fresh evidence directory; preserve the first real run.
PREVIEW_COMMIT="worktree-$(git rev-parse HEAD)" \
  node --max-old-space-size=384 scripts/build-neural.cjs \
  --model-dir models --out-dir /tmp/zl011-eval-verification-rerun \
  --python "$HOME/.hermes/hermes-agent/venv/bin/python"

node --max-old-space-size=384 /tmp/zl011-eval/verify-frozen-export.cjs
"$HOME/.hermes/hermes-agent/venv/bin/python" /tmp/zl011-eval/verify-real-artifacts.py
```

The builder's optional Python implementation is self-contained and compatible with these model JSONs; it does not import or adapt the frozen trainer. The separate export verifier uses the trainer's actual 86-byte record layout. Thus **no inference, builder, tests, trainer, dataset, model, physics, or protocol change was needed to resume the real run**; only this report and evaluation-directory evidence were added/updated.

**Completed:** actual model evaluation, complete required original/held-out domains, both all-state parity paths, counts/hash verification, negative-result report. **Not claimed:** expanded held-out planner comparisons, an artifact-budget pass over all external evidence combined, independent review completion, browser/phone verification, CI/downloaded-artifact checks, merge, or live publication. There is no blocker to the scoped evaluation result; publication was neither requested nor attempted.
