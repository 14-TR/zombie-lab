/* ZL-008 experimental human policy; production simulation stays unchanged. */
(function (root) {
  "use strict";
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  function chooseHuman(state) {
    const model = { ...state, tick: 0, tickLimit: 10000 };
    let best = null;
    function visit(current, depth, survived, first) {
      if (current.status === "caught" || depth === 2) {
        const separation = distance(current.human, current.zombie);
        if (!best || survived > best.survived || (survived === best.survived && separation > best.separation)) {
          best = { human: first, survived, separation };
        }
        return;
      }
      // Prediction reads the OLD simulated state, never a candidate human move.
      const zombie = root.ZombieLab.step(current).zombie;
      for (const [dx, dy] of directions) {
        const human = { x: current.human.x + dx, y: current.human.y + dy };
        if (human.x < 0 || human.x >= current.width || human.y < 0 || human.y >= current.height) continue;
        const next = root.ZombieLab.resolveTick(current, { human, zombie });
        visit(next, depth + 1, survived + (next.status === "caught" ? 0 : 1), first || human);
      }
    }
    visit(model, 0, 0, null);
    return { ...best.human };
  }
  function step(state) {
    const baseline = root.ZombieLab.step(state);
    // Baseline normalization has precedence over planning, even at tick zero.
    if (baseline.tick === state.tick) return baseline;
    return root.ZombieLab.resolveTick(state, {
      human: chooseHuman(state), zombie: baseline.zombie
    });
  }
  root.ZombiePlanner = Object.freeze({ chooseHuman, step });
}(globalThis));
