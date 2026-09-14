/* Zombie Lab — deterministic simulation, independent of DOM and Canvas. */
(function (root) {
  "use strict";
  function initialState() {
    return {
      width: 10, height: 7, tick: 0, tickLimit: 40,
      human: { x: 7, y: 2 }, zombie: { x: 2, y: 4 },
      status: "running", reason: "", decisions: null
    };
  }
  // Iteration order is the tie-break order. Screen north is y - 1.
  const directions = [
    { direction: "north", x: 0, y: -1 },
    { direction: "east", x: 1, y: 0 },
    { direction: "south", x: 0, y: 1 },
    { direction: "west", x: -1, y: 0 },
    { direction: "stay", x: 0, y: 0 }
  ];
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function choose(state, from, target, flee) {
    let best = null;
    for (const move of directions) {
      const position = { x: from.x + move.x, y: from.y + move.y };
      if (position.x < 0 || position.x >= state.width || position.y < 0 || position.y >= state.height) continue;
      const score = distance(position, target);
      if (!best || (flee ? score > best.distance : score < best.distance)) {
        best = { position, direction: move.direction, distance: score };
      }
    }
    return best;
  }
  function same(a, b) { return a.x === b.x && a.y === b.y; }
  function decision(from, to, target) {
    const move = directions.find(function (entry) { return from.x + entry.x === to.x && from.y + entry.y === to.y; });
    return { direction: move.direction, distance: distance(to, target) };
  }
  function stopped(state) {
    if (state.status !== "running") return state;
    if (same(state.human, state.zombie)) return Object.assign({}, state, { status: "caught", reason: "already in contact" });
    if (state.tick >= state.tickLimit) return Object.assign({}, state, { status: "limit", reason: "tick limit" });
    return null;
  }
  // Separate resolution lets tests exercise contact independently of policy.
  function resolveTick(state, moves) {
    const terminal = stopped(state);
    if (terminal) return terminal;
    for (const name of ["human", "zombie"]) {
      const to = moves[name];
      if (!to || !Number.isInteger(to.x) || !Number.isInteger(to.y) ||
          to.x < 0 || to.x >= state.width || to.y < 0 || to.y >= state.height ||
          distance(state[name], to) > 1) throw new RangeError("Illegal " + name + " move");
    }
    const human = { x: moves.human.x, y: moves.human.y };
    const zombie = { x: moves.zombie.x, y: moves.zombie.y };
    const reason = same(human, zombie) ? "shared destination" :
      (same(human, state.zombie) && same(zombie, state.human) ? "exchanged positions" : "");
    return Object.assign({}, state, {
      tick: state.tick + 1, human, zombie,
      status: reason ? "caught" : (state.tick + 1 >= state.tickLimit ? "limit" : "running"),
      reason: reason || (state.tick + 1 >= state.tickLimit ? "tick limit" : ""),
      decisions: {
        human: decision(state.human, human, state.zombie),
        zombie: decision(state.zombie, zombie, state.human)
      }
    });
  }
  function step(state) {
    const terminal = stopped(state);
    if (terminal) return terminal;
    return resolveTick(state, {
      human: choose(state, state.human, state.zombie, true).position,
      zombie: choose(state, state.zombie, state.human, false).position
    });
  }
  root.ZombieLab = Object.freeze({ initialState, step, resolveTick });
}(globalThis));
