# ZL-010 — Exact avoidability (preregistered)

Question: Which ZL-009 policy captures are avoidable under the exact frozen two-zombie world?
Base: a7cd186ddb3414de0e20e96e2a3c538bc8dc8103. Preserve all prior source/evidence. No training/dependencies/services.

## Domain and semantics
Solve all 343000 ordered (human,zombie1,zombie2) positions on the10×7 board, including contact terminal states and colocated zombies, to close the graph under motion. Human chooses any in-bounds N/E/S/W/stay destination in that order. Both fixed deterministic zombies choose from the same old state exactly as two-zombies.js; use existing contact/crossing semantics. Full observation, no randomness, zombies not adversarial. Initial-contact rank0.

## Certificate
For every nonterminal position enumerate every legal human action. Terminal states are losing rank0. Repeatedly mark a nonterminal losing when ALL successors are losing; assign rank=1+maximum successor rank. Remaining states are winning; certify each has a noncapturing successor in winning set. Choose first winning successor in N/E/S/W/stay order, or first maximum-rank successor for losing states. These yield safe infinite positional strategies or maximum capture delay respectively. Rank strictly descends under every action in losing set, ruling out all history-dependent escapes as well. A safe cycle is demonstrated by following certified stationary choices to first ordered-position recurrence; no tick cutoff masquerades as a proof.

## Frozen interfaces / artifacts
New CommonJS scripts/build-avoidability.cjs exports buildAvoidability({commit?}) and solveGraph(); CLI --out-dir DIR writes avoidability.json, avoidability-data.js (window.ZL_AVOIDABILITY_DATA), and avoidability-certificate.json. Certificate {schemaVersion:1, ranks:[...]} uses index=((z1*70+z2)*70+h), cell=y*10+x; -1 winning,0 terminal, positive maximum-delay rank. Summary and source hashes/commit accompany certificate and data.
Data {schemaVersion:1,metadata:{commit,sourceHashes},summary,results,witnesses}. Results in ZL009 order have {id,human,zombie1,zombie2,stateIndex,avoidable,maxCaptureTicks,policies:{greedy,depth1,depth2}}; positions are {x,y}, avoidable boolean, maxCaptureTicks=null if winning, policy values retain frozen ZL009 result objects. Witnesses for all30 depth disagreements plus first avoidable failure and first noninitial unavoidable failure if present; unique IDs ordered as results. Each {id,reason,frames,outcome,stopTick,cycleStart,cyclePeriod}; frame {human,zombie1,zombie2,tick}, includes initial/endpoint. outcome capture or cycle; absent cycle values null. Viewer must not assume witness category exists. For all30 also identify first depth1/depth2 action divergence from unchanged trajectories, not merely outcomes.

## Evaluation
First inspect the30 paired disagreements; then report all4761 fixed-Z1 starts partitioned initial-contact, noninitial unavoidable, avoidable. For each legacy policy report avoidable captures and unavoidable capture-delay shortfall (only captured starts vs finite rank). Independent checker independently encodes transitions and verifies every certificate state/action; compare production transitions across all legal nonterminal actions. Reject corrupted ranks/incomplete domains and invalid witnesses. Preserve source-bound receipts and measured wall time/RSS/disk. Target512MB memory30MB artifacts, bounded CPU execution. No outcome tuning; negative findings valid.

## Delivery
Dependency-free explanatory avoidability.html with phone-readable selected replay, scrub/play/reset and full history; links report, protocol and JSON. Existing pages unchanged. Tests, independent review, downloaded PR artifact and live Pages verified before completion. New branch/PR preserves evolution.
