# ZL-017 TDD / source freeze notes

Observed RED before implementation:
- Candidate-only controller missing (`test-jev-safe.cjs`, assertion `safe candidate controller exists`). GREEN after minimal mask implementation.
- Singleton returned a request instead of null; raw decision function absent. GREEN after forced zero-call branch and restricted-set validation. The delayed-trap synthetic response initially lacked required `type: choice`; corrected the fixture rather than loosening production validation.
- Distinct runner absent: malformed admission, forced tick-cap and CI refusal all RED; GREEN after single-use campaign implementation.
- Exact planner selector/control absent: both tests RED before implementation.
- Forced-frame checker absent: RED before independent oracle adapter implementation.

All-unsafe behavior and subsequent service/oracle-disagreement probes are additional regression tests, not claimed as separate observed RED cycles. Independent fixtures come from the preserved Python oracle, not the new production controller: state90 singleton S leads rank4; state91 safe W leads losing rank5 while E/S retain rank-1; state1612 all actions immediately capture. The witness is synthetic relative to the two-run campaign, clearly separate from actual paid results.

Live docs were fetched through direct HTTPS and preserved. API/Choice specify max255 but do not explicitly specify singleton support; no singleton probe/call is made. Forced singleton behavior is preregistered regardless of API support.
