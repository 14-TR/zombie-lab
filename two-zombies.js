/* ZL-009: two independent pursuers; frozen deterministic experiment. */
(function (root) {
  "use strict";
  function initialState(humanId = 27, zombie2Id = 42) {
    const position = id => ({ x: id % 10, y: Math.floor(id / 10) });
    return { width: 10, height: 7, tick: 0, tickLimit: 10000,
      human: position(humanId), zombies: [position(42), position(zombie2Id)],
      status: "running", reason: "" };
  }
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  function stopped(state) {
    if (state.status !== "running") return state;
    const touching = state.zombies.find(zombie => distance(state.human, zombie) <= 1);
    if (touching) return { ...state, status: "caught",
      reason: same(state.human, touching) ? "already in shared cell" : "already orthogonally adjacent" };
    if (state.tick >= state.tickLimit) return { ...state, status: "limit", reason: "tick limit" };
    return null;
  }
  function resolveTick(state, moves) {
    const terminal = stopped(state);
    if (terminal) return terminal;
    function position(from, to, name) {
      if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y) ||
          to.x < 0 || to.x >= state.width || to.y < 0 || to.y >= state.height || distance(from, to) > 1) {
        throw new RangeError("Illegal " + name + " move");
      }
      return { x: to.x, y: to.y };
    }
    const human = position(state.human, moves.human, "human");
    if (!Array.isArray(moves.zombies) || moves.zombies.length !== 2) throw new RangeError("Illegal zombie moves");
    const zombies = state.zombies.map((old, index) => position(old, moves.zombies[index], "zombie " + index));
    let reason = "";
    for (let index = 0; index < 2; index++) {
      const zombie = zombies[index];
      reason = same(human, zombie) ? "shared destination" :
        same(human, state.zombies[index]) && same(zombie, state.human) ? "exchanged positions" :
          distance(human, zombie) === 1 ? "orthogonally adjacent" : "";
      if (reason) break;
    }
    const tick = state.tick + 1;
    return { ...state, human, zombies, tick,
      status: reason ? "caught" : tick >= state.tickLimit ? "limit" : "running",
      reason: reason || (tick >= state.tickLimit ? "tick limit" : "") };
  }
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  function legalMoves(state, from) {
    return directions.map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy }))
      .filter(to => to.x >= 0 && to.x < state.width && to.y >= 0 && to.y < state.height);
  }
  function nearest(human, zombies) {
    return Math.min(distance(human, zombies[0]), distance(human, zombies[1]));
  }
  function chooseZombies(state) {
    return state.zombies.map(zombie => {
      let best = null, score = Infinity;
      for (const position of legalMoves(state, zombie)) {
        const candidate = distance(position, state.human);
        if (candidate < score) { best = position; score = candidate; }
      }
      return best;
    });
  }
  function requirePolicy(policy) {
    if (!["greedy", "depth1", "depth2"].includes(policy)) throw new RangeError("Unknown human policy: " + policy);
  }
  function chooseHuman(state, policy) {
    requirePolicy(policy);
    let best = null, score = -Infinity;
    if (policy !== "greedy") {
      // Reset only the hypothetical clock. Real execution still enforces its cap.
      const model = { ...state, tick: 0, tickLimit: 10000 };
      const horizon = policy === "depth1" ? 1 : 2;
      let bestSurvived = -1;
      function visit(current, depth, survived, first) {
        if (current.status === "caught" || depth === horizon) {
          const separation = nearest(current.human, current.zombies);
          if (survived > bestSurvived || survived === bestSurvived && separation > score) {
            best = first; bestSurvived = survived; score = separation;
          }
          return;
        }
        // Both predictions read the SAME OLD hypothetical human, not a candidate.
        const zombies = chooseZombies(current);
        for (const human of legalMoves(current, current.human)) {
          const next = resolveTick(current, { human, zombies });
          visit(next, depth + 1, survived + Number(next.status !== "caught"), first || human);
        }
      }
      visit(model, 0, 0, null);
      return { ...(best || state.human) };
    }
    for (const position of legalMoves(state, state.human)) {
      const candidate = nearest(position, state.zombies);
      if (candidate > score) { best = position; score = candidate; }
    }
    return best;
  }
  function step(state, policy) {
    requirePolicy(policy);
    const terminal = stopped(state);
    if (terminal) return terminal;
    return resolveTick(state, { human: chooseHuman(state, policy), zombies: chooseZombies(state) });
  }
  root.ZombiePair = Object.freeze({ initialState, chooseHuman, step, resolveTick });
}(globalThis));
