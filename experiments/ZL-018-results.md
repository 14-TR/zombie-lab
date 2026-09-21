# ZL-018 — fixed-action dynamics prediction pilot

**Jev did not reliably execute the stated dynamics in this pilot: 0/16 complete future states were correct with the active law supplied, versus16/16 for the same-input symbolic baseline.** The overall0/48 includes deliberately ambiguous hidden-law cases, so it is not a pure rule-identification failure rate. Keep the exact simulator as truth; this is not evidence for a replacement world model or physical-system transfer.

[Offline phone viewer](../dynamics.html) · [Full JSON](../dynamics.json) · [Component CSV](../dynamics.csv) · [State CSV](../states.csv) · [Preregistration](ZL-018-protocol.md)

## Design and information boundary
Four fresh purposive12×9 starts × two laws × three information conditions =24 separate stateless requests, each with14 parallel Choices predicting six coordinates plus absorbing capture at horizons1 and3. Fixed human actions only; no action selection, filtering, safety masks, online correction or model-generated simulator transitions. All coordinates in the full board support plus unknown are always available. No active-law label, future truth, panel label or case ID enters hidden-rule requests.

The paired rule change is zombie tie order NESW→WSEN, otherwise the same old-state Manhattan pursuit. Unchanged refers to transition law, not historical board dimensions. Every starting tuple lies outside prior10×7 coordinate support, including swapped-zombie equivalents. Four evaluation groups /24 trajectory groups are disjoint from8 example groups; development boards are3×3 and5×5. These synthetic cases are not representative and not claimed excluded from provider pretraining.

Observations-only retains known human actions, boundaries, capture/absorption and an explicit four-law family: old NESW, old WSEN, new-human-target NESW, stationary. It does not infer all physics from scratch. Same-input baseline reads only public request state, eliminates laws inconsistent with examples and returns unknown where surviving predictions disagree. Supplied natural-language active rules identify one family member. The exact ceiling has privileged law access in hidden conditions.

## Exact and component results
| Information | Horizon | Law | Jev exact | Components correct | Absolute coordinate error / numeric answers | Unknown | Baseline exact |
|---|---:|---|---:|---:|---:|---:|---:|
| neither | 1 | old_NESW | 0/4 | 12/28 | 0/9 | 15 | 0/4 |
| neither | 1 | old_WSEN | 0/4 | 11/28 | 2/10 | 14 | 0/4 |
| neither | 3 | old_NESW | 0/4 | 5/28 | 3/8 | 20 | 0/4 |
| neither | 3 | old_WSEN | 0/4 | 4/28 | 4/8 | 19 | 0/4 |
| observations | 1 | old_NESW | 0/4 | 15/28 | 31/23 | 1 | 2/4 |
| observations | 1 | old_WSEN | 0/4 | 16/28 | 30/24 | 0 | 2/4 |
| observations | 3 | old_NESW | 0/4 | 7/28 | 35/21 | 3 | 2/4 |
| observations | 3 | old_WSEN | 0/4 | 6/28 | 23/17 | 7 | 2/4 |
| supplied | 1 | old_NESW | 0/4 | 19/28 | 10/24 | 0 | 4/4 |
| supplied | 1 | old_WSEN | 0/4 | 17/28 | 11/24 | 0 | 4/4 |
| supplied | 3 | old_NESW | 0/4 | 10/28 | 27/24 | 0 | 4/4 |
| supplied | 3 | old_WSEN | 0/4 | 8/28 | 27/24 | 0 | 4/4 |

Overall: Jev130/336 components,0/48 exact;79 explicit unknowns and0 missing responses. Same-information baseline222/336 components,24/48 exact,114 unknowns and zero error on its182 numeric predictions. Exact privileged ceiling48/48 complete states and336/336 components. Jev numeric absolute error203 across216 numeric coordinate answers; unknowns are excluded from numeric error, not replaced with fabricated coordinates. Raw distributions and confidence are separate retained fields.

### Identifiability and ambiguity
Cases A/B: the two observations leave exactly the true active law among the four candidate hypotheses. Cases C/D: the shared horizontal observation eliminates stationary but leaves old_NESW,old_WSEN,new_NESW under either true law. Neither leaves all four. This is finite-family identifiability, not unique recovery among all imaginable rules. The true state lies in baseline support on48/48 horizon rows. There are24 uniquely evidence-determined full states (16 supplied plus8 identifying-observation states), all predicted exactly by baseline and0 by Jev. On the24 ambiguous rows, strict truth mismatch can be an appropriate abstention, not a model error. Jev matches the full value-or-unknown evidence target on4/48 rows, all neither/horizon1. Unknown is a valid answer, not a service failure.

### Paired contrasts (descriptive only)
Every strict full-state contrast ties at zero: supplied-minus-observations0/16 net, observations-minus-neither0/16, supplied-minus-neither0/16; changed-minus-unchanged0/24. Component counts differ despite those exact ties: supplied54/112, observations44/112, neither32/112. These paired deltas are descriptive, not significance or population estimates. Fixed service order (neither→observations→supplied within case/law), repeated horizons and four shared starts are limitations; repeated identical neither prompts across laws are not distinct information conditions.

### Retained concrete error, not an inferred rationale
First rules-supplied requestq03 (caseA, unchanged law), tick1: true Z1=(8,5),Z2=(0,7), but Jev returns Z1=(7,5),Z2=(0,8). Its Z1-x Choice7 has probability0.39 and confidence0.32; the correct8 has probability0.08. Its Z2-y Choice8 has probability0.51 and confidence0.46; correct7 has probability0.28. Human(9,7) is correct. At tick3, real capture at tick2 freezes H=(9,6); Jev returns H=(7,6) and caught=no. These are observed structured-output errors, not evidence about internal reasoning. [Exact request](../evidence/jev-dynamics/frozen/requests/q03.json) · [Raw response](../evidence/jev-dynamics/recording/q03.response.json).

## Boundaries and limitations
- All frozen cases are uncaught at horizon1 and caught by horizon3. Capture labels are imbalanced within each horizon; the multistep test includes absorbing endpoints rather than three active moves for every case. Starts were frozen before model inference and were not replaced after that limitation was visible.
- Coordinate questions are answered independently and cannot enforce joint physical consistency. This protocol tests this exact English/JSON decomposition, not every possible prompting representation. No prompt retuning or replacement calls followed the negative result.
- No survival/control advantage, learned weights, intelligence, calibration, confidence interval, representative generalization, or traffic/hydraulic competence is established.

## Actual admission, provenance and cost
Pre-inference committed source/request/input/truth freeze: `b3477ebc0bb353a547aa42ac112d3486b3b73aaa`. Clean historical base `1c68578d18908ad146a6e8f1b22c96d380aa1566`. Authorization message1551433908577501254, thread1551351642509803581. Raw recording commit `567fe2e`.

All24 admissions returned HTTP200, pinned jev-1.13.0 and336 valid Choices.0 service/schema failures,0 retries,0 warmups. Exactly one single-use campaign; all capacity exhausted. Live command `python3 -B scripts/run_dynamics.py --live-authorized` MUST NOT be rerun. Durable fsynced ledger precedes transport, whole campaign refuses restart; raw receipts are read-only locally and committed. CI refuses before price/API network, and offline builders contain no inference path.

Official Models docs checked live before admission: input$0.042/M, output free. Actual usage **98576 input /30588 output tokens; estimated$0.004140192** (not invoice). Conservative frozen estimated ceiling$0.019403916, authorized ceiling$0.05.24 requests at concurrency1,16KiB body/64KiB response,30s absolute request deadline,900s campaign deadline. Recorded wall time5983.998ms; client/network-inclusive latency min214.357, median245.619, mean247.987, max297.550ms. Request bytes265390; response bytes61845, excluding HTTP/TLS overhead. Client peak RSS21839872 bytes; server resources unmeasured.

Independent coordinate-sign reference (no primary transition import) matches312,500 exhaustive5×5 transitions over four laws/five actions, plus204 frozen truth/example/baseline comparisons. Unchanged historical production matches all12 prescribed evaluation transitions. The two implementations share an author; this is algorithmic independence, not blind independent review.765 historical tracked files are hash-preserved. Frozen manifests and raw request/response hashes are checked on every build.

## Offline reproduction and gates
```sh
python3 -B -m unittest discover -s scripts -p 'test_dynamics*.py'
python3 -B scripts/build_dynamics.py /absolute/path/to/export
node scripts/check-dynamics-browser.cjs /absolute/path/to/export /existing/playwright-core /existing/chromium /absolute/path/to/browser-receipts
```

Browser testing is mandatory on the actual exported files at320/390/1200 with cached Playwright/Chromium, not an install/skip substitute. External detailed goal/implementation handoff records exact candidate, browser/tests/resources hashes and commands. Parent-owned unresolved gates: independent candidate review; any separately authorized remote CI/PR/download/merge/deploy/live-publication; canonical notes. No push, merge or publication in this task.
