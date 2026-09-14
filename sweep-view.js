/* ZL-006: classic-script, dependency-free selected-run explorer. */
(function (root) {
  "use strict";
  function point(id, width) { return { x: id % width, y: Math.floor(id / width) }; }
  function replayRow(row, config, production) {
    let state = Object.assign({}, production.initialState(), {
      width: config.width, height: config.height, tick: 0, tickLimit: config.safetyTickLimit,
      human: point(row.humanId, config.width), zombie: point(row.zombieId, config.width)
    });
    // Production checks contact before movement. Only normalize an initial
    // orthogonal contact here: calling step unconditionally would lose tick 0.
    if (Math.abs(state.human.x - state.zombie.x) + Math.abs(state.human.y - state.zombie.y) <= 1) {
      state = production.step(state);
    }
    const frames = [], seen = new Map();
    let outcome, cycleStart = null, period = null;
    for (;;) {
      if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown production status: " + state.status);
      if (state.status === "limit" && state.tick < config.safetyTickLimit) throw new Error("Premature production limit");
      frames.push(state);
      const key = [state.human.x, state.human.y, state.zombie.x, state.zombie.y].join(",");
      if (state.status === "caught") { outcome = "capture"; break; }
      if (seen.has(key)) {
        outcome = "cycle"; cycleStart = seen.get(key); period = state.tick - cycleStart; break;
      }
      seen.set(key, state.tick);
      if (state.tick >= config.safetyTickLimit) { outcome = "unresolved"; break; }
      const next = production.step(state);
      if (next.tick !== state.tick + 1) throw new Error("Production made no consecutive tick progress");
      state = next;
    }
    const result = { frames, outcome, stopTick: state.tick, cycleStart, period };
    for (const field of ["outcome", "stopTick", "cycleStart", "period"]) {
      if (result[field] !== row[field]) {
        throw new Error("Replay mismatch for " + row.id + ": " + field + " expected " + row[field] + ", actual " + result[field]);
      }
    }
    return result;
  }
  function indexData(data) {
    function requireValue(ok, detail) { if (!ok) throw new Error("Invalid sweep data: " + detail); }
    requireValue(data && data.schemaVersion === 1 && data.config && data.metadata && typeof data.metadata.commit === "string", "schema / source metadata");
    const config = data.config, size = config.width * config.height;
    requireValue(Number.isInteger(config.width) && config.width > 0 && Number.isInteger(config.height) && config.height > 0 && size <= 10000, "board dimensions");
    requireValue(Number.isInteger(config.safetyTickLimit) && config.safetyTickLimit >= 0 && config.safetyTickLimit <= 10000 && config.captureRule === "orthogonal-adjacency" && config.excluded === "same-cell starts", "rules / safety limit");
    requireValue(Array.isArray(data.results) && data.results.length === size * (size - 1), "result count mismatch");
    const byZombie = Array.from({ length: size }, () => Array(size).fill(null));
    const counts = { total: data.results.length, capture: 0, cycle: 0, unresolved: 0, initialCapture: 0 };
    for (const row of data.results) {
      requireValue(row && [row.humanId, row.zombieId].every(id => Number.isInteger(id) && id >= 0 && id < size) && row.humanId !== row.zombieId, "start IDs / exclusion");
      requireValue(row.id === "z" + row.zombieId + "-h" + row.humanId, "row ID");
      requireValue(!byZombie[row.zombieId][row.humanId], "duplicate row " + row.id);
      requireValue(["capture", "cycle", "unresolved"].includes(row.outcome) && Number.isInteger(row.stopTick) && row.stopTick >= 0 && row.stopTick <= config.safetyTickLimit, "outcome / stopping tick");
      requireValue(row.outcome === "cycle" ? Number.isInteger(row.cycleStart) && row.cycleStart >= 0 && row.cycleStart < row.stopTick && row.period === row.stopTick - row.cycleStart : row.cycleStart === null && row.period === null, "cycle metadata");
      byZombie[row.zombieId][row.humanId] = row;
      counts[row.outcome]++;
      if (row.outcome === "capture" && row.stopTick === 0) counts.initialCapture++;
    }
    requireValue(data.summary && Object.keys(counts).every(key => data.summary[key] === counts[key]), "summary count mismatch");
    return { data, config, byZombie };
  }
  function mount(document, data, production) {
    const byId = id => document.getElementById(id);
    let timer = null, frames = [], tableRows = [], selected = 0, zombieId = 0, humanId = 1;
    const heatmap = byId("heatmap"), world = byId("world"), slider = byId("scrubber");
    const zSelect = byId("zombie-start"), hSelect = byId("human-start");
    function stop() { if (timer !== null) root.clearInterval(timer); timer = null; byId("play").disabled = frames.length < 2; byId("pause").disabled = true; }
    function fail(error) {
      stop(); frames = []; tableRows = []; byId("positions").replaceChildren();
      byId("error").hidden = false; byId("error").textContent = error.message;
      byId("match").hidden = true; byId("readout").textContent = "Replay unavailable — resolve the error above.";
      for (const id of ["play", "pause", "back", "next", "scrubber"]) byId(id).disabled = true;
      world.getContext("2d").clearRect(0, 0, world.width, world.height);
    }
    try {
      if (!production) throw new Error("Missing production simulation.js");
      if (!data) throw new Error("Missing sweep-data.js. Open the generated preview/sweep.html, not the source-root page.");
      const model = indexData(data), config = model.config, size = config.width * config.height;
      const summary = data.summary;
      byId("summary").textContent = "Global: " + summary.total + " runs · " + summary.capture + " capture · " + summary.cycle + " cycle · " + summary.unresolved + " unresolved · " + summary.initialCapture + " initial captures (tick 0).";
      byId("metadata").textContent = "Source commit: " + data.metadata.commit + " · Baseline: b01cbbfcf8aa3776ffe3893af135862363e34ac1 · " + config.width + " × " + config.height + " · safety limit " + config.safetyTickLimit + " ticks.";
      for (const canvas of [heatmap, world]) canvas.height = canvas.width * config.height / config.width;
      function coordinates(id) { const p = point(id, config.width); return "(" + p.x + ", " + p.y + ") · ID " + id; }
      function option(value, text) { const element = document.createElement("option"); element.value = value; element.textContent = text; return element; }
      for (let id = 0; id < size; id++) zSelect.appendChild(option(id, "Z " + coordinates(id)));
      function drawHeatmap() {
        const ctx = heatmap.getContext("2d"), cw = heatmap.width / config.width, ch = heatmap.height / config.height;
        const rows = model.byZombie[zombieId].filter(Boolean), max = Math.max(0, ...rows.map(row => row.stopTick));
        const counts = { capture: 0, cycle: 0, unresolved: 0 }; rows.forEach(row => counts[row.outcome]++);
        byId("slice-summary").textContent = "Z " + coordinates(zombieId) + ": " + rows.length + " human starts · " + counts.capture + " capture · " + counts.cycle + " cycle · " + counts.unresolved + " unresolved.";
        byId("tick-scale").textContent = "scale 0–" + max + " ticks";
        ctx.clearRect(0, 0, heatmap.width, heatmap.height);
        for (let id = 0; id < size; id++) {
          const p = point(id, config.width), x = p.x * cw, y = p.y * ch, row = model.byZombie[zombieId][id];
          const hue = row ? { capture: 0, cycle: 210, unresolved: 40 }[row.outcome] : 0;
          ctx.fillStyle = row ? "hsl(" + hue + " 65% " + (93 - (max ? row.stopTick / max : 0) * 24) + "%)" : "#d9dee1";
          ctx.fillRect(x, y, cw, ch); ctx.strokeStyle = "#69777d"; ctx.lineWidth = 1; ctx.strokeRect(x, y, cw, ch);
          ctx.fillStyle = "#182730"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.font = "bold " + Math.floor(Math.min(cw, ch) * .4) + "px system-ui";
          ctx.fillText(row ? { capture: "C", cycle: "↻", unresolved: "?" }[row.outcome] : "Z", x + cw / 2, y + ch * .3);
          ctx.font = Math.floor(Math.min(cw, ch) * .4) + "px system-ui";
          ctx.fillText(row ? row.stopTick : "—", x + cw / 2, y + ch * .71);
          if (id === humanId) { ctx.strokeStyle = "#101820"; ctx.lineWidth = 5; ctx.strokeRect(x + 3, y + 3, cw - 6, ch - 6); }
        }
        heatmap.setAttribute("aria-label", "Human-start results for zombie " + coordinates(zombieId) + ". " + rows.length + " selectable starts; same-cell start excluded. Use the Human start menu for exact results.");
      }
      function render() {
        if (!frames.length) return;
        const frame = frames[selected], ctx = world.getContext("2d"), cw = world.width / config.width, ch = world.height / config.height;
        ctx.clearRect(0, 0, world.width, world.height); ctx.strokeStyle = "#b4bfc4"; ctx.lineWidth = 1;
        for (let y = 0; y < config.height; y++) for (let x = 0; x < config.width; x++) ctx.strokeRect(x * cw, y * ch, cw, ch);
        const shared = frame.human.x === frame.zombie.x && frame.human.y === frame.zombie.y;
        for (const [name, letter, color, shift] of [["human", "H", "#126ea6", -1], ["zombie", "Z", "#a62b2b", 1]]) {
          const p = frame[name], x = (p.x + .5 + (shared ? shift * .23 : 0)) * cw, y = (p.y + .5) * ch, radius = Math.min(cw, ch) * (shared ? .2 : .32);
          ctx.fillStyle = color;
          if (name === "human") { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); }
          else ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
          ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = "bold " + radius + "px system-ui"; ctx.fillText(letter, x, y);
        }
        slider.value = selected;
        const positions = "H (" + frame.human.x + ", " + frame.human.y + ") · Z (" + frame.zombie.x + ", " + frame.zombie.y + ")";
        byId("readout").textContent = "Tick " + frame.tick + " / " + frames[frames.length - 1].tick + " · " + positions + " · " + frame.status + (frame.reason ? " · " + frame.reason : "");
        world.setAttribute("aria-label", "Tick " + frame.tick + ": " + positions);
        byId("back").disabled = selected === 0; byId("next").disabled = selected === frames.length - 1;
        tableRows.forEach((row, index) => row.setAttribute("aria-current", String(index === selected)));
      }
      function chooseHuman() {
        stop(); humanId = Number(hSelect.value); drawHeatmap();
        const row = model.byZombie[zombieId][humanId];
        byId("selection").textContent = row.id + " · H " + coordinates(humanId) + " · Z " + coordinates(zombieId) + " · " + row.outcome + " at tick " + row.stopTick + (row.outcome === "cycle" ? " · first seen " + row.cycleStart + " · period " + row.period : "");
        try {
          const run = replayRow(row, config, production); frames = run.frames; selected = 0;
          byId("error").hidden = true; byId("match").hidden = false;
          byId("match").textContent = "Verified against result row: outcome, stopping tick, cycle start and period. Endpoint coordinates below are recomputed by production (not stored in the row).";
          byId("positions").replaceChildren();
          const fragment = document.createDocumentFragment();
          tableRows = frames.map(frame => {
            const tr = document.createElement("tr"); tr.dataset.tick = frame.tick;
            for (const value of [frame.tick, frame.human.x, frame.human.y, frame.zombie.x, frame.zombie.y, frame.status, frame.reason]) { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); }
            fragment.appendChild(tr); return tr;
          });
          byId("positions").appendChild(fragment); slider.max = frames.length - 1; slider.disabled = frames.length < 2; stop(); render();
        } catch (error) { fail(error); }
      }
      function chooseZombie() {
        stop(); zombieId = Number(zSelect.value); hSelect.replaceChildren();
        for (const row of model.byZombie[zombieId]) if (row) hSelect.appendChild(option(row.humanId, "H " + coordinates(row.humanId) + " · " + row.outcome + " · tick " + row.stopTick));
        if (humanId !== zombieId && model.byZombie[zombieId][humanId]) hSelect.value = humanId;
        chooseHuman();
      }
      function select(index) { stop(); selected = Math.max(0, Math.min(frames.length - 1, index)); render(); }
      zSelect.disabled = false; hSelect.disabled = false;
      zSelect.addEventListener("change", chooseZombie); hSelect.addEventListener("change", chooseHuman);
      heatmap.addEventListener("click", event => {
        const rect = heatmap.getBoundingClientRect();
        const x = Math.floor((event.clientX - rect.left) / rect.width * config.width), y = Math.floor((event.clientY - rect.top) / rect.height * config.height);
        if (x < 0 || x >= config.width || y < 0 || y >= config.height) return;
        const id = y * config.width + x; if (id === zombieId) return; hSelect.value = id; chooseHuman();
      });
      byId("back").addEventListener("click", () => select(selected - 1)); byId("next").addEventListener("click", () => select(selected + 1));
      slider.addEventListener("input", () => select(Number(slider.value))); byId("pause").addEventListener("click", stop);
      byId("play").addEventListener("click", () => {
        if (timer !== null || frames.length < 2) return;
        if (selected === frames.length - 1) { selected = 0; render(); }
        byId("play").disabled = true; byId("pause").disabled = false;
        timer = root.setInterval(() => { selected++; render(); if (selected === frames.length - 1) stop(); }, 250);
      });
      chooseZombie();
    } catch (error) { byId("summary").textContent = "Sweep unavailable."; fail(error); }
  }
  root.ZombieSweepView = Object.freeze({ replayRow, indexData, mount });
  if (root.document) mount(root.document, root.ZombieSweepData, root.ZombieLab);
}(globalThis));
