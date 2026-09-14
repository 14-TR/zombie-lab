/* ZL-007: scalar-map analysis and selected A/B production replay. */
(function (root) {
  "use strict";
  function indexData(data) {
    function requireValue(ok, detail) { if (!ok) throw new Error("Invalid sweep data: " + detail); }
    requireValue(data && data.schemaVersion === 1 && data.config && data.metadata && typeof data.metadata.commit === "string", "schema / source metadata");
    const config = data.config, size = config.width * config.height;
    requireValue(Number.isInteger(config.width) && config.width > 0 && Number.isInteger(config.height) && config.height > 0 && size <= 10000, "dimensions");
    requireValue(Number.isInteger(config.safetyTickLimit) && config.safetyTickLimit >= 0 && config.safetyTickLimit <= 10000 && config.captureRule === "orthogonal-adjacency" && config.excluded === "same-cell starts", "rules / safety limit");
    requireValue(Array.isArray(data.results) && data.results.length === size * (size - 1), "missing rows / count mismatch");
    const byZombie = Array.from({ length: size }, () => Array(size).fill(null));
    let initialCapture = 0;
    for (const row of data.results) {
      requireValue(row && [row.humanId, row.zombieId].every(id => Number.isInteger(id) && id >= 0 && id < size) && row.humanId !== row.zombieId, "start IDs");
      requireValue(row.id === "z" + row.zombieId + "-h" + row.humanId && !byZombie[row.zombieId][row.humanId], "row ID / duplicate");
      requireValue(row.outcome === "capture" && Number.isInteger(row.stopTick) && row.stopTick >= 0 && row.stopTick <= config.safetyTickLimit && row.cycleStart === null && row.period === null, "expected frozen capture row / tick / cycle fields");
      byZombie[row.zombieId][row.humanId] = row;
      if (row.stopTick === 0) initialCapture++;
    }
    const expected = { total: data.results.length, capture: data.results.length, cycle: 0, unresolved: 0, initialCapture };
    requireValue(data.summary && Object.keys(expected).every(key => data.summary[key] === expected[key]), "summary mismatch");
    return { data, config, byZombie };
  }
  function point(id, width) { return { x: id % width, y: Math.floor(id / width) }; }
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function slice(model, zombieId) {
    if (!Number.isInteger(zombieId) || !model.byZombie[zombieId]) throw new Error("Invalid zombie ID");
    const { width, height } = model.config;
    const rows = model.byZombie[zombieId];
    const cells = rows.map(row => {
      if (!row) return null;
      const p = point(row.humanId, width), candidates = [];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const id = y * width + x;
        if (rows[id]) candidates.push({ id, delta: Math.abs(row.stopTick - rows[id].stopTick) });
      }
      candidates.sort((a, b) => b.delta - a.delta || a.id - b.id);
      return { humanId: row.humanId, stopTick: row.stopTick, sensitivity: candidates.length ? candidates[0].delta : null, witnessId: candidates.length ? candidates[0].id : null };
    });
    return { cells, maxTick: Math.max(0, ...cells.filter(Boolean).map(c => c.stopTick)), maxSensitivity: Math.max(0, ...cells.filter(Boolean).map(c => c.sensitivity || 0)) };
  }
  // sweep-view.js mounts unconditionally when document exists. Keep this page
  // independent; this bounded runner follows its API/terminal precedence and
  // calls unchanged production policy for only the two selected trajectories.
  function replayRow(row, config, production) {
    let state = Object.assign({}, production.initialState(), {
      width: config.width, height: config.height, tick: 0, tickLimit: config.safetyTickLimit,
      human: point(row.humanId, config.width), zombie: point(row.zombieId, config.width)
    });
    if (distance(state.human, state.zombie) <= 1) state = production.step(state);
    const frames = [], seen = new Map();
    let outcome, cycleStart = null, period = null;
    for (;;) {
      if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown production status");
      if (state.status === "limit" && state.tick < config.safetyTickLimit) throw new Error("Premature production limit");
      frames.push(state);
      const key = [state.human.x, state.human.y, state.zombie.x, state.zombie.y].join(",");
      if (state.status === "caught") { outcome = "capture"; break; }
      if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); period = state.tick - cycleStart; break; }
      seen.set(key, state.tick);
      if (state.tick >= config.safetyTickLimit) { outcome = "unresolved"; break; }
      const next = production.step(state);
      if (next.tick !== state.tick + 1) throw new Error("Production made no consecutive tick progress");
      state = next;
    }
    const run = { frames, outcome, stopTick: state.tick, cycleStart, period };
    for (const field of ["outcome", "stopTick", "cycleStart", "period"]) {
      if (row[field] !== run[field]) throw new Error("Replay mismatch for " + row.id + ": " + field + " expected " + row[field] + ", actual " + run[field]);
    }
    return run;
  }
  function compare(model, zombieId, humanA, humanB, production) {
    if (!production || typeof production.initialState !== "function" || typeof production.step !== "function") throw new Error("Missing production simulation.js");
    if (![zombieId, humanA, humanB].every(id => Number.isInteger(id) && id >= 0 && id < model.byZombie.length) || !model.byZombie[zombieId][humanA] || !model.byZombie[zombieId][humanB]) throw new Error("Invalid comparison start IDs");
    const a = replayRow(model.byZombie[zombieId][humanA], model.config, production);
    const b = replayRow(model.byZombie[zombieId][humanB], model.config, production);
    return { a, b, maxTick: Math.max(a.stopTick, b.stopTick) };
  }
  function atTick(pair, tick) {
    if (!Number.isInteger(tick)) throw new Error("Invalid tick");
    const sharedTick = Math.max(0, Math.min(pair.maxTick, tick));
    function local(run) {
      const localTick = Math.min(sharedTick, run.stopTick), frame = run.frames[localTick];
      return { frame, localTick, frozen: sharedTick > run.stopTick, separation: distance(frame.human, frame.zombie) };
    }
    return { sharedTick, a: local(pair.a), b: local(pair.b) };
  }
  function mount(document, data, production) {
    const byId = id => document.getElementById(id);
    let timer = null, pair = null, tick = 0, model, map, zombieId = 42, humanA = 1, humanB = 2, inspected = 1;
    const slider = byId("scrubber");
    function element(tag, text) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; return node; }
    function coords(p) { return "(" + p.x + ", " + p.y + ")"; }
    function stop() { if (timer !== null) root.clearInterval(timer); timer = null; }
    function fail(error) {
      stop(); pair = null;
      byId("error").hidden = false; byId("error").textContent = error.message + ". Playback disabled; reload after resolving the source error.";
      byId("match").hidden = true;
      byId("timeline").textContent = "Replay unavailable"; slider.value = 0; slider.max = 0;
      for (const name of ["a", "b"]) {
        byId("world-" + name).replaceChildren(); byId("world-" + name).setAttribute("aria-label", "Replay unavailable");
        byId("history-" + name).replaceChildren(); byId("readout-" + name).textContent = "Replay unavailable";
      }
      for (const node of document.querySelectorAll("button,select,input")) node.disabled = true;
    }
    function svgNode(tag, attributes) {
      const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const key of Object.keys(attributes)) node.setAttribute(key, attributes[key]);
      return node;
    }
    function drawBoard(name, local) {
      const svg = byId("world-" + name), run = pair[name], { width, height } = model.config;
      svg.replaceChildren(); svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) svg.appendChild(svgNode("rect", { x, y, width: 1, height: 1, fill: "none", stroke: "#c4cecf", "stroke-width": .025 }));
      for (const [agent, color] of [["human", "#006ba1"], ["zombie", "#a42e32"]]) {
        svg.appendChild(svgNode("polyline", { points: run.frames.map(f => (f[agent].x + .5) + "," + (f[agent].y + .5)).join(" "), fill: "none", stroke: color, "stroke-width": .12, "stroke-opacity": .28, "stroke-dasharray": agent === "zombie" ? ".2 .12" : "none" }));
      }
      for (const [agent, letter, color] of [["human", "H", "#006ba1"], ["zombie", "Z", "#a42e32"]]) {
        const p = local.frame[agent], shared = distance(local.frame.human, local.frame.zombie) === 0;
        const x = p.x + .5 + (shared ? (agent === "human" ? -.23 : .23) : 0), y = p.y + .5, r = shared ? .23 : .35;
        svg.appendChild(svgNode(agent === "human" ? "circle" : "rect", agent === "human" ? { cx: x, cy: y, r, fill: color } : { x: x-r, y: y-r, width: r*2, height: r*2, fill: color }));
        const text = svgNode("text", { x, y: y + .17, "text-anchor": "middle", fill: "white", "font-size": .5, "font-weight": 700 }); text.textContent = letter; svg.appendChild(text);
      }
      svg.setAttribute("aria-label", name.toUpperCase() + " local tick " + local.localTick + ": H " + coords(local.frame.human) + "; Z " + coords(local.frame.zombie) + "; Manhattan separation " + local.separation);
    }
    function render() {
      if (!pair) return;
      const view = atTick(pair, tick); tick = view.sharedTick; slider.value = tick;
      byId("timeline").textContent = "Shared tick " + tick + " / " + pair.maxTick;
      for (const name of ["a", "b"]) {
        const local = view[name], run = pair[name]; drawBoard(name, local);
        const output = byId("readout-" + name); output.classList.toggle("frozen", local.frozen);
        output.textContent = name.toUpperCase() + " · local tick " + local.localTick + (local.frozen ? " — frozen at capture endpoint" : local.localTick === run.stopTick ? " — captured" : " — running") + " · shared tick " + tick + ". H " + coords(local.frame.human) + " · Z " + coords(local.frame.zombie) + " · Manhattan separation " + local.separation + ". Capture / termination: tick " + run.stopTick + ".";
        for (const row of byId("history-" + name).children) row.setAttribute("aria-current", String(Number(row.dataset.tick) === local.localTick));
      }
      byId("play").disabled = timer !== null || pair.maxTick === 0;
      byId("pause").disabled = timer === null;
      byId("next").disabled = tick === pair.maxTick;
      byId("reset").disabled = false; slider.disabled = pair.maxTick === 0;
    }
    function history(name) {
      const body = byId("history-" + name); body.replaceChildren();
      const fragment = document.createDocumentFragment();
      for (const frame of pair[name].frames) {
        const row = element("tr"); row.dataset.tick = frame.tick;
        for (const value of [frame.tick, coords(frame.human), coords(frame.zombie), distance(frame.human, frame.zombie), frame.status]) row.appendChild(element("td", value));
        fragment.appendChild(row);
      }
      body.appendChild(fragment);
    }
    function witness() {
      const cell = map.cells[inspected];
      byId("use-witness").disabled = !cell || cell.witnessId === null;
      byId("witness").textContent = !cell || cell.witnessId === null ? "No permitted neighboring edge at this cell." :
        "Chosen edge: H " + coords(point(inspected, model.config.width)) + " (ID " + inspected + ", " + cell.stopTick + " ticks) ↔ H " + coords(point(cell.witnessId, model.config.width)) + " (ID " + cell.witnessId + ", " + map.cells[cell.witnessId].stopTick + " ticks). Maximum absolute difference: " + cell.sensitivity + " ticks; shared Z " + coords(point(zombieId, model.config.width)) + ".";
    }
    function drawMaps() {
      for (const [id, metric, max, hue] of [["capture-map", "stopTick", map.maxTick, 190], ["sensitivity-map", "sensitivity", map.maxSensitivity, 35]]) {
        const grid = byId(id); grid.replaceChildren(); grid.style.gridTemplateColumns = "repeat(" + model.config.width + ",minmax(0,1fr))";
        map.cells.forEach((cell, humanId) => {
          const button = element("button", cell ? (cell[metric] === null ? "—" : cell[metric]) : "Z");
          button.type = "button"; button.dataset.human = humanId; button.disabled = !cell;
          if (cell) {
            button.style.background = "hsl(" + hue + " " + (hue === 190 ? 60 : 70) + "% " + (96 - (max ? cell[metric] / max : 0) * 38) + "%)";
            button.classList.toggle("selected-a", humanId === humanA); button.classList.toggle("selected-b", humanId === humanB);
            if (id === "sensitivity-map") button.classList.toggle("inspected", humanId === inspected);
          }
          const label = cell ? "Human " + coords(point(humanId, model.config.width)) + " ID " + humanId + ": " + (metric === "stopTick" ? "capture time " : "one-cell sensitivity ") + (cell[metric] === null ? "undefined (no permitted neighbor)" : cell[metric] + " ticks") : "Zombie cell: same-cell human start excluded";
          button.setAttribute("aria-label", label); button.title = label;
          button.addEventListener("click", () => {
            if (!cell || !pair) return;
            inspected = humanId;
            if (id === "capture-map") { byId("human-" + byId("map-target").value).value = humanId; chooseHumans(); }
            else { drawMaps(); witness(); }
          }); grid.appendChild(button);
        });
      }
      byId("capture-legend").textContent = "0 → " + map.maxTick + " capture ticks (light → dark)";
      byId("sensitivity-legend").textContent = "0 → " + map.maxSensitivity + " ticks difference (light → dark)";
      witness();
    }
    function chooseHumans() {
      stop();
      try {
        humanA = Number(byId("human-a").value); humanB = Number(byId("human-b").value);
        pair = compare(model, zombieId, humanA, humanB, production); tick = 0;
        byId("error").hidden = true; byId("match").hidden = false;
        byId("match").textContent = "Verified both selected rows: outcome, stopping tick, cycle start and period. Endpoint coordinates are recomputed by production.";
        byId("comparison").textContent = "A captures at tick " + pair.a.stopTick + "; B captures at tick " + pair.b.stopTick + ". Absolute timing difference: " + Math.abs(pair.a.stopTick - pair.b.stopTick) + " ticks. Outcome unchanged: both capture.";
        slider.max = pair.maxTick; history("a"); history("b"); drawMaps(); render();
      } catch (error) { fail(error); }
    }
    function chooseZombie() {
      stop();
      try {
        zombieId = Number(byId("zombie-start").value); map = slice(model, zombieId);
        const available = model.byZombie[zombieId].filter(Boolean);
        for (const [name, selected] of [["a", humanA], ["b", humanB]]) {
          const select = byId("human-" + name); select.replaceChildren();
          for (const row of available) { const option = element("option", "H " + coords(point(row.humanId, model.config.width)) + " · ID " + row.humanId + " · " + row.stopTick + " ticks"); option.value = row.humanId; select.appendChild(option); }
          select.value = available.some(r => r.humanId === selected) ? selected : available[0].humanId;
        }
        if (!map.cells[inspected]) inspected = available[0].humanId;
        byId("slice-summary").textContent = "Fixed Z " + coords(point(zombieId, model.config.width)) + " (ID " + zombieId + ") · " + available.length + " permitted human starts · all capture.";
        chooseHumans();
      } catch (error) { fail(error); }
    }
    try {
      if (!data) throw new Error("Missing sweep-data.js: open the generated comparison preview");
      model = indexData(data);
      const size = model.byZombie.length;
      if (size < 2) throw new Error("Invalid sweep data: no permitted start pairs");
      zombieId = Math.min(zombieId, size - 1);
      byId("summary").textContent = "Outcome is always capture across all " + data.summary.total + " permitted ordered starts in this frozen " + model.config.width + " × " + model.config.height + " board. Starting position changes capture time, not the eventual outcome.";
      byId("metadata").textContent = "Frozen source metadata (verbatim): " + data.metadata.commit + " · schema " + data.schemaVersion + " · " + data.results.length + " scalar rows · capture rule: " + model.config.captureRule + " · excluded: " + model.config.excluded + " · safety limit " + model.config.safetyTickLimit + " ticks. Historical source: evidence/all-starts/sweep.json.";
      for (let id = 0; id < size; id++) { const option = element("option", "Z " + coords(point(id, model.config.width)) + " · ID " + id); option.value = id; byId("zombie-start").appendChild(option); }
      byId("zombie-start").value = zombieId;
      for (const id of ["zombie-start", "human-a", "human-b"]) byId(id).disabled = false;
      byId("zombie-start").addEventListener("change", chooseZombie);
      for (const id of ["human-a", "human-b"]) byId(id).addEventListener("change", chooseHumans);
      function select(value) { if (!pair) return; stop(); tick = value; render(); }
      slider.addEventListener("input", () => select(Number(slider.value)));
      byId("next").addEventListener("click", () => select(tick + 1));
      byId("reset").addEventListener("click", () => select(0));
      byId("pause").addEventListener("click", () => { stop(); render(); });
      byId("play").addEventListener("click", () => {
        if (!pair || !pair.maxTick || timer !== null) return;
        if (tick === pair.maxTick) tick = 0;
        timer = root.setInterval(() => { tick++; if (tick >= pair.maxTick) stop(); render(); }, 250); render();
      });
      byId("use-witness").addEventListener("click", () => {
        const cell = map.cells[inspected]; if (!pair || !cell || cell.witnessId === null) return;
        byId("human-a").value = inspected; byId("human-b").value = cell.witnessId; chooseHumans();
      });
      chooseZombie();
    } catch (error) { byId("summary").textContent = "Frozen sweep unavailable; no outcome claim can be verified."; fail(error); }
  }
  root.ZombieCompare = Object.freeze({ indexData, slice, compare, atTick, mount });
  if (root.document && root.document.getElementById("compare-app")) mount(root.document, root.ZombieSweepData, root.ZombieLab);
}(globalThis));
