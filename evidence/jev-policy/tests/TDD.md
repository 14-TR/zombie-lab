# ZL-016 test-first development notes

These are observations from executed RED/GREEN tool calls, not invented test output. Full regression output is retained separately.

| Slice | RED command and observed missing behavior | GREEN |
|---|---|---|
| Prompt-only request | `node --test scripts/test-jev-policy.cjs`: expected function, actual undefined for `request` | Same test + inherited controller tests passed after wrapper was added |
| Raw unsafe action / malformed Choice | Same command: expected function, actual undefined for `decision` | Raw original unsafe W was executed and captured; missing each Choice was rejected |
| New campaign admission | `python3 -B scripts/test-jev-policy-runner.py`: separate policy runner absent | Real independent oracle ran before fake transport, durable ledger already had 1 row, malformed zombie stopped without moving/retry |
| Executed-frame parity | Same command: postrun checker absent | Accepted historical 19 decisions, rejected a mutated actual final human position |
| Real offline comparison | `node --test scripts/test-jev-policy-release.cjs`: policy comparison builder absent | Retained original 12/7 and new 12/4 endpoints, 19/16 admissions and actual token counts |
| Shared replay | `node --test scripts/test-jev-policy-view.cjs`: policy viewer absent | Original endpoint held at 7, policy at 4, no invented decisions after endpoints |
| Export packaging | Release test: build was undefined | Packaged raw arms/report/JSON/CSV and network-disabled HTML |
| Offline workflows | Release test: pages.yml missing policy builder | Both workflows contain only offline policy tests/checks/builds |

Later regression coverage adds HTTP503, malformed JSON, wrong model, oracle disagreement and actual CI refusal while preserving the real ledger. Inherited transport tests cover timeout/redirect/oversize/single-use and exhausted 24-admission rejection. Offline failure fixtures never contact the API.

Implementation commits: `d263e814d228381d24901c2fd99cace12bc55407`, `019bb8f105fbd9c6f4298305bd4392e86b5056ad`, `333346441f6502f3f0eb3fc51f354be819139417`, `241124b9e2f728d5a65eaea93ec9c6788ae07891`. Preregistration `0e3fbe374a81c93a0df5f0cfcb7e2c560d45124c`; source freeze `1a4d9c2bfa239ea5269389dbf43cefd0e870e43e` before all inference. No production code/source changed after observing policy outcomes except new offline builder/viewer/test/workflow files.
