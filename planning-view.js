/* ZL-008: frozen scalar results and selected production paired replay. */
(function (root) {
  "use strict";
  function selectDefault(results) {
    const rows = results.slice().sort((a, b) => a.zombieId - b.zombieId || a.humanId - b.humanId);
    let row = rows.find(r => r.comparison === "escape"), criterion = "first escape in zombie/human ID order";
    if (!row) {
      const later = rows.filter(r => r.comparison === "later").sort((a, b) => (b.treatment.stopTick - b.baseline.stopTick) - (a.treatment.stopTick - a.baseline.stopTick));
      row = later[0]; criterion = "largest positive captured-time difference; lowest start IDs break ties";
    }
    if (!row) { row = rows.find(r => r.comparison !== "same"); criterion = "first difference in zombie/human ID order"; }
    if (!row) { row = rows.find(r => r.id === "z42-h27") || rows[0]; criterion = "original start z42-h27 (first permitted start for a smaller fixture)"; }
    if (!row) throw new Error("No permitted starting pairs");
    return { row, reason: "Selected example, not representative: " + criterion + "." };
  }
  const categories = ["later", "earlier", "same", "escape", "unresolved"];
  function comparisonOf(b, t) {
    if (b.outcome === "capture" && t.outcome === "capture") return t.stopTick > b.stopTick ? "later" : t.stopTick < b.stopTick ? "earlier" : "same";
    if (b.outcome === "capture" && t.outcome === "cycle") return "escape";
    return "unresolved";
  }
  function indexData(data) {
    function check(ok, detail) { if (!ok) throw new Error("Invalid planning data: " + detail); }
    check(data && data.schemaVersion === 1 && data.config && data.metadata && typeof data.metadata.commit === "string", "schema / metadata");
    const c = data.config, size = c.width * c.height;
    check(Number.isInteger(c.width) && c.width > 0 && Number.isInteger(c.height) && c.height > 0 && size <= 10000, "dimensions");
    check(Number.isInteger(c.safetyTickLimit) && c.safetyTickLimit >= 0 && c.safetyTickLimit <= 10000 && c.horizon === 2 && c.policy === "two-tick-model-based" && c.excluded === "same-cell starts", "policy / cap");
    check(Array.isArray(data.results) && data.results.length === size * (size - 1), "complete row count");
    const byZombie = Array.from({ length: size }, () => Array(size).fill(null));
    const counted = { total: data.results.length, baseline: { capture: 0, cycle: 0, unresolved: 0 }, treatment: { capture: 0, cycle: 0, unresolved: 0 }, later: 0, earlier: 0, same: 0, escape: 0, unresolved: 0 };
    let previous = -1, initialCapture = 0;
    for (const r of data.results) {
      check(r && [r.zombieId, r.humanId].every(n => Number.isInteger(n) && n >= 0 && n < size) && r.zombieId !== r.humanId, "start IDs");
      const order = r.zombieId * size + r.humanId;
      check(order > previous && r.id === "z" + r.zombieId + "-h" + r.humanId, "ID / enumeration / duplicate"); previous = order;
      for (const name of ["baseline", "treatment"]) {
        const run = r[name];
        check(run && ["capture", "cycle", "unresolved"].includes(run.outcome) && Number.isInteger(run.stopTick) && run.stopTick >= 0 && run.stopTick <= c.safetyTickLimit, "outcome / stop tick");
        check(run.outcome === "cycle" ? Number.isInteger(run.cycleStart) && run.cycleStart >= 0 && Number.isInteger(run.period) && run.period > 0 && run.cycleStart + run.period === run.stopTick : run.cycleStart === null && run.period === null, "cycle fields");
        check(run.outcome !== "unresolved" || run.stopTick === c.safetyTickLimit, "cutoff tick");
        counted[name][run.outcome]++;
      }
      check(r.baseline.outcome === "capture", "frozen baseline must capture");
      check(categories.includes(r.comparison) && r.comparison === comparisonOf(r.baseline, r.treatment), "comparison category");
      counted[r.comparison]++; if (r.baseline.stopTick === 0) initialCapture++;
      byZombie[r.zombieId][r.humanId] = r;
    }
    check(data.summary && ["total", ...categories].every(k => data.summary[k] === counted[k]) && ["baseline", "treatment"].every(name => data.summary[name] && ["capture", "cycle", "unresolved"].every(k => data.summary[name][k] === counted[name][k])), "summary mismatch");
    return { data, config: c, byZombie, initialCapture };
  }
  function point(id, width) { return { x: id % width, y: Math.floor(id / width) }; }
  function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }
  function replayRun(row, config, production, step, expected) {
    let state = Object.assign({}, production.initialState(), { width: config.width, height: config.height, tick: 0, tickLimit: config.safetyTickLimit, human: point(row.humanId, config.width), zombie: point(row.zombieId, config.width), status: "running", reason: "", decisions: null });
    if (distance(state.human, state.zombie) <= 1 || config.safetyTickLimit === 0) state = step(state);
    const frames = [], seen = new Map();
    let outcome, cycleStart = null, period = null;
    for (;;) {
      frames.push(state);
      if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown production status");
      if (state.status === "limit" && state.tick < config.safetyTickLimit) throw new Error("Premature production limit");
      const key = [state.human.x, state.human.y, state.zombie.x, state.zombie.y].join(",");
      if (state.status === "caught") { outcome = "capture"; break; }
      if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); period = state.tick - cycleStart; break; }
      seen.set(key, state.tick);
      if (state.tick >= config.safetyTickLimit) { outcome = "unresolved"; break; }
      const next = step(state);
      if (next.tick !== state.tick + 1) throw new Error("Production made no consecutive tick progress");
      state = next;
    }
    const run = { frames, outcome, stopTick: state.tick, cycleStart, period };
    for (const field of ["outcome", "stopTick", "cycleStart", "period"]) if (run[field] !== expected[field]) throw new Error("Replay mismatch for " + row.id + ": " + field + " expected " + expected[field] + ", actual " + run[field]);
    return run;
  }
  function atTick(pair, tick) {
    if (!Number.isInteger(tick)) throw new Error("Invalid tick");
    const sharedTick = Math.max(0, Math.min(pair.maxTick, tick));
    function local(run) {
      const localTick = Math.min(sharedTick, run.stopTick), frame = run.frames[localTick];
      return { frame, localTick, frozen: sharedTick > run.stopTick, separation: distance(frame.human, frame.zombie) };
    }
    return { sharedTick, baseline: local(pair.baseline), treatment: local(pair.treatment) };
  }
  function compare(model, zombieId, humanId, production, planner) {
    if (!production || typeof production.initialState !== "function" || typeof production.step !== "function" || !planner || typeof planner.step !== "function") throw new Error("Missing production baseline / planner");
    const row = Number.isInteger(zombieId) && Number.isInteger(humanId) && model.byZombie[zombieId] && model.byZombie[zombieId][humanId];
    if (!row) throw new Error("Invalid starting pair");
    const baseline = replayRun(row, model.config, production, production.step, row.baseline);
    const treatment = replayRun(row, model.config, production, planner.step, row.treatment);
    return { row, baseline, treatment, maxTick: Math.max(baseline.stopTick, treatment.stopTick) };
  }
  function describeRun(run) {
    if (run.outcome === "capture") return "capture at tick " + run.stopTick;
    if (run.outcome === "cycle") return "proven cycle: start tick " + run.cycleStart + ", first repeat tick " + run.stopTick + ", period " + run.period + " — indefinite avoidance under fixed policy";
    return "unresolved at safety cutoff tick " + run.stopTick + " — not proof of avoidance";
  }
  function describeComparison(row) {
    let detail = "";
    if (row.baseline.outcome === "capture" && row.treatment.outcome === "capture") {
      const delta = row.treatment.stopTick - row.baseline.stopTick;
      detail = " Finite capture-time difference (planner − baseline): " + (delta > 0 ? "+" : "") + delta + " ticks.";
    } else detail = " No finite capture-time difference is defined.";
    return row.id + " · Baseline: " + describeRun(row.baseline) + ". Planner: " + describeRun(row.treatment) + "." + detail;
  }
  function mount(document, data, production, planner) {
    const get = id => document.getElementById(id), slider = get("scrubber");
    let model, pair = null, tick = 0, timer = null, zombieId, humanId;
    function element(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); return n; }
    function coords(p) { return "(" + p.x + ", " + p.y + ")"; }
    function stop() { if (timer !== null) root.clearInterval(timer); timer = null; }
    function fail(error) {
      stop(); pair = null; get("error").hidden = false;
      get("error").textContent = error.message + ". Replay cleared and disabled; resolve the source mismatch and reload.";
      get("match").hidden = true; get("comparison").textContent = "Selected replay unavailable";
      get("timeline").textContent = "Replay unavailable"; slider.value = "0"; slider.max = "0";
      for (const name of ["baseline", "treatment"]) { get("world-" + name).replaceChildren(); get("world-" + name).setAttribute("aria-label", "Replay unavailable"); get("history-" + name).replaceChildren(); get("readout-" + name).textContent = "Replay unavailable"; }
      for (const node of document.querySelectorAll("button,select,input")) node.disabled = true;
    }
    function svgNode(tag, attrs) { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); return n; }
    function draw(name, local) {
      const svg = get("world-" + name), { width, height } = model.config;
      svg.replaceChildren(); svg.setAttribute("viewBox", "0 0 " + width + " " + height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) svg.appendChild(svgNode("rect", { x, y, width: 1, height: 1, fill: "none", stroke: "#c4cecf", "stroke-width": .025 }));
      for (const [agent, color] of [["human", "#006ba1"], ["zombie", "#a42e32"]]) svg.appendChild(svgNode("polyline", { points: pair[name].frames.map(f => (f[agent].x + .5) + "," + (f[agent].y + .5)).join(" "), fill: "none", stroke: color, "stroke-width": .12, "stroke-opacity": .28, "stroke-dasharray": agent === "zombie" ? ".2 .12" : "none" }));
      for (const [agent, letter, color] of [["human", "H", "#006ba1"], ["zombie", "Z", "#a42e32"]]) {
        const p = local.frame[agent], shared = local.separation === 0, x = p.x + .5 + (shared ? (agent === "human" ? -.23 : .23) : 0), y = p.y + .5, r = shared ? .23 : .35;
        svg.appendChild(svgNode(agent === "human" ? "circle" : "rect", agent === "human" ? { cx: x, cy: y, r, fill: color } : { x: x-r, y: y-r, width: r*2, height: r*2, fill: color }));
        const label = svgNode("text", { x, y: y + .17, "text-anchor": "middle", fill: "white", "font-size": .5, "font-weight": 700 }); label.textContent = letter; svg.appendChild(label);
      }
      svg.setAttribute("aria-label", name + " local tick " + local.localTick + ": H " + coords(local.frame.human) + "; Z " + coords(local.frame.zombie) + "; separation " + local.separation);
    }
    function render() {
      if (!pair) return;
      const view = atTick(pair, tick); tick = view.sharedTick; slider.value = String(tick);
      get("timeline").textContent = "Shared tick " + tick + " / " + pair.maxTick;
      for (const name of ["baseline", "treatment"]) {
        const local = view[name], run = pair[name]; draw(name, local);
        const endpoint = run.outcome === "capture" ? "capture endpoint" : run.outcome === "cycle" ? "first-repeat cycle endpoint" : "unresolved cutoff endpoint";
        const status = local.frozen ? "frozen at " + endpoint : local.localTick === run.stopTick ? endpoint : "running";
        get("readout-" + name).textContent = "Local tick " + local.localTick + " · shared tick " + tick + " · " + status + ". H " + coords(local.frame.human) + " · Z " + coords(local.frame.zombie) + " · separation " + local.separation + ". Run outcome: " + describeRun(run) + ".";
        get("readout-" + name).classList.toggle("frozen", local.frozen);
        for (const row of get("history-" + name).children) row.setAttribute("aria-current", String(Number(row.dataset.tick) === local.localTick));
      }
      get("play").disabled = timer !== null || pair.maxTick === 0; get("pause").disabled = timer === null;
      get("next").disabled = tick >= pair.maxTick; get("reset").disabled = false; slider.disabled = pair.maxTick === 0;
    }
    function history(name) {
      const body = get("history-" + name), run = pair[name]; body.replaceChildren();
      for (const frame of run.frames) {
        const row = element("tr"); row.dataset.tick = frame.tick;
        const endpoint = frame.tick === run.stopTick ? describeRun(run) : "running";
        for (const value of [frame.tick, coords(frame.human), coords(frame.zombie), distance(frame.human, frame.zombie), frame.status + " · " + endpoint]) row.appendChild(element("td", value));
        body.appendChild(row);
      }
    }
    function options() {
      const human = get("human-start"); human.replaceChildren();
      for (let id = 0; id < model.byZombie.length; id++) { const option = element("option", "H " + coords(point(id, model.config.width)) + " · ID " + id + (id === zombieId ? " · excluded" : "")); option.value = String(id); option.disabled = id === zombieId; human.appendChild(option); }
      human.value = String(humanId);
    }
    function drawMap() {
      const map = get("outcome-map"); map.replaceChildren(); map.style.gridTemplateColumns = "repeat(" + model.config.width + ",minmax(0,1fr))";
      model.byZombie[zombieId].forEach((row, id) => {
        const cell = element("button"); cell.type = "button";
        if (!row) { cell.textContent = "Z"; cell.disabled = true; cell.setAttribute("aria-label", "Excluded same-cell start " + coords(point(id, model.config.width))); }
        else {
          const delta = row.baseline.outcome === "capture" && row.treatment.outcome === "capture" ? row.treatment.stopTick - row.baseline.stopTick : null;
          cell.textContent = row.comparison === "escape" ? "C" : row.comparison === "unresolved" ? "?" : (delta > 0 ? "+" : "") + delta;
          cell.className = row.comparison + (id === humanId ? " selected" : ""); cell.setAttribute("aria-pressed", String(id === humanId));
          cell.setAttribute("aria-label", "H " + coords(point(id, model.config.width)) + ": " + describeComparison(row)); cell.title = describeComparison(row);
          cell.addEventListener("click", () => { humanId = id; get("human-start").value = String(id); choose(true); });
        }
        map.appendChild(cell);
      });
    }
    function choose(manual) {
      stop(); tick = 0;
      try {
        pair = compare(model, zombieId, humanId, production, planner); slider.max = String(pair.maxTick);
        if (manual) get("selection").textContent = "User-selected example, not representative of the full start space.";
        get("comparison").textContent = describeComparison(pair.row); get("match").hidden = false;
        get("match").textContent = "Production replay matches both frozen rows: outcome, stop tick, cycle start and period. Coordinates are recomputed.";
        history("baseline"); history("treatment"); drawMap(); render();
      } catch (error) { fail(error); }
    }
    try {
      model = indexData(data); get("error").hidden = true;
      const selection = selectDefault(data.results); zombieId = selection.row.zombieId; humanId = selection.row.humanId;
      get("selection").textContent = selection.reason;
      for (const c of categories) get("count-" + c).textContent = String(data.summary[c]);
      get("summary").textContent = data.summary.total + " permitted ordered starts; same-cell starts excluded. " + model.initialCapture + " begin cardinal-adjacent and are captured at tick 0, without either policy moving. Baseline: " + data.summary.baseline.capture + " captures. Planner: " + data.summary.treatment.capture + " captures, " + data.summary.treatment.cycle + " cycles, " + data.summary.treatment.unresolved + " unresolved.";
      get("metadata").textContent = "Source commit: " + data.metadata.commit + " · " + model.config.width + " × " + model.config.height + " board · horizon " + model.config.horizon + " · safety cutoff " + model.config.safetyTickLimit + " ticks.";
      const zombies = get("zombie-start"); zombies.replaceChildren();
      for (let id = 0; id < model.byZombie.length; id++) { const option = element("option", "Z " + coords(point(id, model.config.width)) + " · ID " + id); option.value = String(id); zombies.appendChild(option); }
      zombies.value = String(zombieId); zombies.disabled = false; get("human-start").disabled = false; options();
      zombies.addEventListener("change", () => { zombieId = Number(zombies.value); if (humanId === zombieId) humanId = model.byZombie[zombieId].find(Boolean).humanId; options(); choose(true); });
      get("human-start").addEventListener("change", () => { humanId = Number(get("human-start").value); choose(true); });
      get("play").addEventListener("click", () => { if (!pair || timer !== null || pair.maxTick === 0) return; if (tick === pair.maxTick) tick = 0; timer = root.setInterval(() => { tick++; if (tick >= pair.maxTick) stop(); render(); }, 350); render(); });
      get("pause").addEventListener("click", () => { stop(); render(); });
      get("next").addEventListener("click", () => { stop(); tick++; render(); });
      get("reset").addEventListener("click", () => { stop(); tick = 0; render(); });
      slider.addEventListener("input", () => { stop(); tick = Number(slider.value); render(); });
      choose(false);
    } catch (error) { fail(error); }
  }
  root.ZombiePlanningView = Object.freeze({ selectDefault, indexData, replayRun, atTick, compare, describeRun, describeComparison, mount });
  if (root.document && root.document.getElementById("planning-app")) mount(root.document, root.ZombiePlanningData, root.ZombieLab, root.ZombiePlanner);
}(globalThis));
