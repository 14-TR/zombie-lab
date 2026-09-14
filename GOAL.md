# ZL-001 — Atomic simulation

> Historical baseline document. For this branch’s changed capture rule and current execution evidence, see [ZL-004 adjacent capture](experiments/ZL-004-adjacent-capture.md).

Build and verify a browser-only human-versus-zombie experiment in /Users/tr/Projects/zombie-lab. Deliver working files, not merely project setup.

## Scope
Plain HTML, classic JavaScript, Canvas; direct file:// opening; no install, framework, server, database, API, model, training, assets or cloud deployment. One human, one zombie, bounded rectangular grid, four-neighbor movement or stay, deterministic tie-breaking, one tick per Step, Reset, readable state and decision explanation. Both decide from the same old state. Contact at shared destination or exchanged positions counts as caught. Stop on capture or explicit tick limit. Rendering never changes simulation state. No infection, extra agents, resources or learned brains yet.

## Acceptance
- Real browser opens index.html from local disk and visibly renders the grid and two labeled agents.
- Step advances exactly once, boundaries hold, collision and crossing tests pass, terminal states stop.
- Identical initial conditions produce identical trajectories; reset restores initial state; inputs are not mutated by step.
- Browser-runnable tests pass, including edge cases and drawing independence. Record actual execution and visual evidence outside runtime files.
- README describes rules and launch; measure source bytes, runtime dependencies, network requests, and tick timing; report unavailable memory measures rather than inventing them.
- Independent source review before a local git checkpoint. No remote publication without a separately scoped release decision.

## Execution policy
Medium priority; event-driven, no recurring job. One implementation worker, then one independent reviewer, never concurrent writers. First work block at most 45 minutes including a 10-minute verification/checkpoint reserve; checkpoint and pause on budget or blocker, no automatic budget replenishment. Session goal uses normal 20-turn continuation ceiling, not a prediction of effort. Earlier estimate 5–7 work turns is only a planning estimate. No training or heavy jobs; source target under 1 MB excluding git/evidence; evidence target under 10 MB. Do not install dependencies to satisfy optional tooling. Use existing tools or report the narrow blocker.

## Expansion gates
After ZL-001 review: consider one additional human. Later deepen individual behavior and broaden environment separately. Every dependency needs a demonstrated consumer. No group-behavior or stack expansion inside this goal.
