/* ZL-011: positional 6-32-tanh-5 feed-forward inference, no dynamics or oracle. */
(function (root) {
  "use strict";
  const validatedFrozen = new WeakSet();
  function validateModel(model) {
    if (validatedFrozen.has(model)) return model;
    const vector = (v, n) => Array.isArray(v) && v.length === n &&
      Array.from(v).every(x => typeof x === "number" && Number.isFinite(x));
    if (!model || model.schemaVersion !== 1 || !Array.isArray(model.architecture) ||
        model.architecture.length !== 3 || Array.from(model.architecture).some((n, i) => n !== [6, 32, 5][i]) ||
        model.seed !== 17 || ![0, 40].includes(model.epoch) ||
        !Array.isArray(model.W1) || model.W1.length !== 6 || !Array.from(model.W1).every(r => vector(r, 32)) ||
        !vector(model.b1, 32) || !Array.isArray(model.W2) || model.W2.length !== 32 ||
        !Array.from(model.W2).every(r => vector(r, 5)) || !vector(model.b2, 5)) throw new TypeError("Invalid ZL-011 model schema/weights");
    if ([model, model.architecture, model.W1, ...model.W1, model.b1, model.W2, ...model.W2, model.b2]
      .every(Object.isFrozen)) validatedFrozen.add(model);
    return model;
  }
  function validateState(state) {
    if (!state || state.width !== 10 || state.height !== 7 || !Array.isArray(state.zombies) ||
        state.zombies.length !== 2 || [state.human, ...state.zombies].some(p => !p ||
          !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.x > 9 || p.y < 0 || p.y > 6)) {
      throw new TypeError("Invalid ZL-011 state");
    }
  }
  function logits(state, model) {
    validateState(state); validateModel(model);
    const inputs = [state.human.x / 9, state.human.y / 6,
      state.zombies[0].x / 9, state.zombies[0].y / 6,
      state.zombies[1].x / 9, state.zombies[1].y / 6];
    const hidden = new Array(32), output = new Array(5);
    for (let j = 0; j < 32; j++) {
      let value = model.b1[j];
      for (let i = 0; i < 6; i++) value += inputs[i] * model.W1[i][j];
      if (!Number.isFinite(value)) throw new RangeError("Nonfinite model hidden sum");
      hidden[j] = Math.tanh(value);
    }
    for (let k = 0; k < 5; k++) {
      let value = model.b2[k];
      for (let j = 0; j < 32; j++) value += hidden[j] * model.W2[j][k];
      if (!Number.isFinite(value)) throw new RangeError("Nonfinite model logits");
      output[k] = value;
    }
    return output;
  }
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  function chooseHuman(state, model) {
    validateState(state);
    if (state.status && state.status !== "running" || state.zombies.some(z =>
      Math.abs(z.x - state.human.x) + Math.abs(z.y - state.human.y) <= 1)) return { ...state.human };
    const scores = logits(state, model);
    let best = null, score = -Infinity;
    for (let a = 0; a < 5; a++) {
      const x = state.human.x + directions[a][0], y = state.human.y + directions[a][1];
      if (x < 0 || x >= 10 || y < 0 || y >= 7) continue;
      if (scores[a] > score) { best = { x, y }; score = scores[a]; }
    }
    return best;
  }
  const api = Object.freeze({ logits, chooseHuman, validateModel });
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NeuralPolicy = api;
}(globalThis));
