/* ZL-009: index frozen scalars, replay only the selected three runs. */
(function (root) {
  "use strict";
  const policies = ["greedy", "depth1", "depth2"];
  const fields = ["outcome", "stopTick", "cycleStart", "period"];
  const point = id => ({ x: id % 10, y: Math.floor(id / 10) });
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  function indexData(data) {
    const check = (ok, detail) => { if (!ok) throw new Error("Invalid two-zombie data: " + detail); };
    check(data && data.schemaVersion === 1 && data.metadata && typeof data.metadata.commit === "string" && data.config, "schema / metadata");
    const c = data.config;
    check(c.width === 10 && c.height === 7 && c.zombie1Id === 42 && c.safetyTickLimit === 10000 && c.scope === "fixed-zombie1-slice" && JSON.stringify(c.policies) === JSON.stringify(policies), "frozen scope / rules");
    check(Array.isArray(data.results) && data.results.length === 4761, "complete row count");
    const byZombie = Array.from({ length: 70 }, () => Array(70).fill(null));
    const counted = Object.fromEntries(policies.map(p => [p, { capture: 0, cycle: 0, unresolved: 0 }]));
    let previous = -1, initialCapture = 0;
    for (const row of data.results) {
      check(row && [row.zombie2Id, row.humanId].every(n => Number.isInteger(n) && n >= 0 && n < 70) && row.humanId !== 42 && row.humanId !== row.zombie2Id, "start IDs");
      const order = row.zombie2Id * 70 + row.humanId;
      check(order > previous && row.id === "z2-" + row.zombie2Id + "-h" + row.humanId, "ID / enumeration / duplicate"); previous = order;
      const contact = [point(42), point(row.zombie2Id)].some(z => distance(point(row.humanId), z) <= 1);
      if (contact) initialCapture++;
      for (const policy of policies) {
        const run = row.outcomes && row.outcomes[policy];
        check(run && ["capture", "cycle", "unresolved"].includes(run.outcome) && Number.isInteger(run.stopTick) && run.stopTick >= 0 && run.stopTick <= c.safetyTickLimit, "outcome / stop tick");
        check(run.outcome === "cycle" ? Number.isInteger(run.cycleStart) && run.cycleStart >= 0 && Number.isInteger(run.period) && run.period > 0 && run.cycleStart + run.period === run.stopTick : run.cycleStart === null && run.period === null, "cycle fields");
        check(run.outcome !== "unresolved" || run.stopTick === c.safetyTickLimit, "cutoff tick");
        check(contact ? run.outcome === "capture" && run.stopTick === 0 : run.stopTick > 0, "initial contact");
        counted[policy][run.outcome]++;
      }
      byZombie[row.zombie2Id][row.humanId] = row;
    }
    check(data.summary && data.summary.total === 4761 && data.summary.initialCapture === initialCapture && data.summary.policies && policies.every(p => data.summary.policies[p] && Object.keys(counted[p]).every(k => data.summary.policies[p][k] === counted[p][k])), "summary mismatch");
    return { data, config: c, byZombie, initialCapture };
  }
  function replayRun(row, config, production, policy, expected) {
    let state = { ...production.initialState(row.humanId, row.zombie2Id), tickLimit: config.safetyTickLimit };
    if (state.zombies.some(z => distance(state.human, z) <= 1) || config.safetyTickLimit === 0) state = production.step(state, policy);
    const frames = [], seen = new Map();
    let outcome, cycleStart = null, period = null;
    for (;;) {
      if (!["running", "caught", "limit"].includes(state.status)) throw new Error("Unknown production status");
      if (state.status === "limit" && state.tick < config.safetyTickLimit) throw new Error("Premature production limit");
      frames.push(state);
      const key = [state.human, ...state.zombies].map(p => p.x + "," + p.y).join("|");
      if (state.status === "caught") { outcome = "capture"; break; }
      if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); period = state.tick - cycleStart; break; }
      seen.set(key, state.tick);
      if (state.tick >= config.safetyTickLimit) { outcome = "unresolved"; break; }
      const next = production.step(state, policy);
      if (next.tick !== state.tick + 1) throw new Error("Production made no consecutive tick progress");
      state = next;
    }
    const run = { frames, outcome, stopTick: state.tick, cycleStart, period };
    for (const field of fields) if (run[field] !== expected[field]) throw new Error("Replay mismatch for " + row.id + " / " + policy + ": " + field + " expected " + expected[field] + ", actual " + run[field]);
    return run;
  }
  function compare(model, zombie2Id, humanId, production) {
    if (!production || typeof production.initialState !== "function" || typeof production.step !== "function") throw new Error("Missing production ZombiePair API");
    const row = Number.isInteger(zombie2Id) && Number.isInteger(humanId) && model.byZombie[zombie2Id] && model.byZombie[zombie2Id][humanId];
    if (!row) throw new Error("Invalid starting pair");
    const pair = { row };
    for (const p of policies) pair[p] = replayRun(row, model.config, production, p, row.outcomes[p]);
    pair.maxTick = Math.max(...policies.map(p => pair[p].stopTick));
    return pair;
  }
  function atTick(pair, tick) {
    if (!Number.isInteger(tick)) throw new Error("Invalid tick");
    const sharedTick = Math.max(0, Math.min(pair.maxTick, tick)), view = { sharedTick };
    for (const p of policies) {
      const run = pair[p], localTick = Math.min(sharedTick, run.stopTick), frame = run.frames[localTick];
      view[p] = { frame, localTick, frozen: sharedTick > run.stopTick, separation: Math.min(...frame.zombies.map(z => distance(frame.human, z))) };
    }
    return view;
  }
  function selectDefault(results) {
    const rows = results.slice().sort((a, b) => a.zombie2Id - b.zombie2Id || a.humanId - b.humanId);
    let row = rows.find(r => new Set(policies.map(p => r.outcomes[p].outcome)).size > 1), criterion = "first outcome difference in Z2 / human ID order";
    if (!row) {
      row = rows.find(r => new Set(policies.filter(p => r.outcomes[p].outcome === "capture").map(p => r.outcomes[p].stopTick)).size > 1);
      criterion = "first differing finite capture times in Z2 / human ID order";
    }
    if (!row) { row = rows.find(r => r.zombie2Id === 42 && r.humanId === 27); criterion = "original start H27 / Z2=42"; }
    if (!row) throw new Error("Missing default starting pair");
    return { row, reason: "Selected example, not representative: " + criterion + "." };
  }
  function describeRun(run) {
    if (run.outcome === "capture") return "capture at tick " + run.stopTick;
    if (run.outcome === "cycle") return "proven cycle: start tick " + run.cycleStart + ", first repeat tick " + run.stopTick + ", period " + run.period + " — indefinite avoidance under this fixed deterministic policy";
    return "unresolved at safety cutoff tick " + run.stopTick + " — not proof of avoidance";
  }
  function describeComparison(row) {
    const description = row.id + ": " + policies.map(p => p + ": " + describeRun(row.outcomes[p])).join(". ") + ".";
    const differences = [["greedy", "depth1"], ["greedy", "depth2"], ["depth1", "depth2"]].map(([a, b]) => {
      if (row.outcomes[a].outcome !== "capture" || row.outcomes[b].outcome !== "capture") return "No finite capture-time difference for " + b + " − " + a + ".";
      const delta = row.outcomes[b].stopTick - row.outcomes[a].stopTick;
      return b + " − " + a + ": " + (delta > 0 ? "+" : "") + delta + " ticks (finite captures only).";
    });
    return description + " " + differences.join(" ");
  }
  function mount(document, data, production) {
    const get = id => document.getElementById(id), slider = get("scrubber");
    let model, pair = null, tick = 0, timer = null, zombie2Id, humanId, mapPolicy = "greedy";
    const coords = p => "(" + p.x + ", " + p.y + ")";
    const names = { greedy: "Greedy", depth1: "One-tick", depth2: "Two-tick" };
    function element(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); return n; }
    function svgNode(tag, attrs) { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); return n; }
    function stop() { if (timer !== null) root.clearInterval(timer); timer = null; }
    function fail(error) {
      stop(); pair = null; get("error").hidden = false;
      get("error").textContent = error.message + ". Replay cleared and disabled; resolve the mismatch and reload.";
      get("match").hidden = true; get("comparison").textContent = "Selected replay unavailable";
      get("timeline").textContent = "Replay unavailable"; slider.value = "0"; slider.max = "0";
      for (const p of policies) { get("world-" + p).replaceChildren(); get("world-" + p).setAttribute("aria-label", "Replay unavailable"); get("history-" + p).replaceChildren(); get("readout-" + p).textContent = "Replay unavailable"; }
      for (const node of document.querySelectorAll("button,select,input")) node.disabled = true;
    }
    function draw(policy, local) {
      const svg = get("world-" + policy), f = local.frame;
      svg.replaceChildren(); svg.setAttribute("viewBox", "0 0 10 7");
      for (let y = 0; y < 7; y++) for (let x = 0; x < 10; x++) svg.appendChild(svgNode("rect", { x, y, width: 1, height: 1, fill: "none", stroke: "#c4cecf", "stroke-width": .025 }));
      const agents = [
        { id: "human", label: "H", color: "#006ba1", point: s => s.human, dash: "none" },
        { id: "zombie1", label: "1", color: "#a42e32", point: s => s.zombies[0], dash: ".2 .12" },
        { id: "zombie2", label: "2", color: "#815000", point: s => s.zombies[1], dash: ".05 .13" }
      ];
      for (const a of agents) svg.appendChild(svgNode("polyline", { points: pair[policy].frames.map(s => (a.point(s).x + .5) + "," + (a.point(s).y + .5)).join(" "), fill: "none", stroke: a.color, "stroke-width": .1, "stroke-opacity": .25, "stroke-dasharray": a.dash }));
      for (const a of agents) {
        const p = a.point(f), group = agents.filter(b => distance(b.point(f), p) === 0), i = group.indexOf(a);
        const offsets = group.length === 3 ? [[0, -.24], [-.24, .22], [.24, .22]] : group.length === 2 ? [[-.24, 0], [.24, 0]] : [[0, 0]];
        const x = p.x + .5 + offsets[i][0], y = p.y + .5 + offsets[i][1], r = group.length > 1 ? .23 : .35;
        const attrs = a.id === "human" ? { cx: x, cy: y, r } : { x: x-r, y: y-r, width: r*2, height: r*2, rx: a.id === "zombie2" ? .1 : 0 };
        svg.appendChild(svgNode(a.id === "human" ? "circle" : "rect", { ...attrs, fill: a.color, "data-agent": a.id }));
        const label = svgNode("text", { x, y: y + .16, "text-anchor": "middle", fill: "white", "font-size": .48, "font-weight": 700 }); label.textContent = a.label; svg.appendChild(label);
      }
      svg.setAttribute("aria-label", names[policy] + " local tick " + local.localTick + ": H " + coords(f.human) + "; Z1 " + coords(f.zombies[0]) + "; Z2 " + coords(f.zombies[1]) + (distance(...f.zombies) === 0 ? "; zombies co-located in the same cell" : "") + "; nearest separation " + local.separation);
    }
    function render() {
      if (!pair) return;
      const view = atTick(pair, tick); tick = view.sharedTick; slider.value = String(tick);
      get("timeline").textContent = "Shared tick " + tick + " / " + pair.maxTick;
      for (const p of policies) {
        const local = view[p], run = pair[p], f = local.frame; draw(p, local);
        const endpoint = run.outcome === "capture" ? "capture endpoint" : run.outcome === "cycle" ? "first-repeat cycle endpoint" : "unresolved cutoff endpoint";
        const status = local.frozen ? "frozen at " + endpoint : local.localTick === run.stopTick ? endpoint : "running";
        get("readout-" + p).textContent = "Local tick " + local.localTick + " · shared tick " + tick + " · " + status + ". H " + coords(f.human) + " · Z1 " + coords(f.zombies[0]) + " · Z2 " + coords(f.zombies[1]) + (distance(...f.zombies) === 0 ? " (co-located)" : "") + " · nearest distance " + local.separation + ". Outcome: " + describeRun(run) + ".";
        get("readout-" + p).classList.toggle("frozen", local.frozen);
        for (const row of get("history-" + p).children) row.setAttribute("aria-current", String(Number(row.dataset.tick) === local.localTick));
      }
      get("play").disabled = timer !== null || pair.maxTick === 0; get("pause").disabled = timer === null;
      get("next").disabled = tick >= pair.maxTick; get("reset").disabled = false; slider.disabled = pair.maxTick === 0;
    }
    function history(p) {
      const body = get("history-" + p), run = pair[p]; body.replaceChildren();
      for (const f of run.frames) {
        const row = element("tr"); row.dataset.tick = f.tick;
        for (const value of [f.tick, coords(f.human), coords(f.zombies[0]), coords(f.zombies[1]), Math.min(...f.zombies.map(z => distance(f.human, z))), f.status + " · " + (f.tick === run.stopTick ? describeRun(run) : "running")]) row.appendChild(element("td", value));
        body.appendChild(row);
      }
    }
    function options() {
      const human = get("human-start"); human.replaceChildren();
      for (let id = 0; id < 70; id++) { const option = element("option", "H " + coords(point(id)) + " · ID " + id + (id === 42 || id === zombie2Id ? " · excluded" : "")); option.value = String(id); option.disabled = id === 42 || id === zombie2Id; human.appendChild(option); }
      human.value = String(humanId);
    }
    function drawMap() {
      const map = get("outcome-map"); map.replaceChildren();
      get("map-description").textContent = names[mapPolicy] + " outcomes with Z1 initially (2, 4), Z2 initially " + coords(point(zombie2Id)) + ". Numbers are capture ticks, not differences.";
      model.byZombie[zombie2Id].forEach((row, id) => {
        const cell = element("button"); cell.type = "button";
        if (!row) { cell.textContent = "×"; cell.disabled = true; cell.setAttribute("aria-label", "Excluded same-cell human start " + coords(point(id))); }
        else {
          const run = row.outcomes[mapPolicy]; cell.textContent = run.outcome === "capture" ? String(run.stopTick) : run.outcome === "cycle" ? "C" : "?";
          cell.className = run.outcome + (id === humanId ? " selected" : ""); cell.setAttribute("aria-pressed", String(id === humanId));
          const label = "H " + coords(point(id)) + ": " + names[mapPolicy] + " " + describeRun(run);
          cell.setAttribute("aria-label", label); cell.title = label;
          cell.addEventListener("click", () => { humanId = id; get("human-start").value = String(id); choose(true); });
        }
        map.appendChild(cell);
      });
    }
    function choose(manual) {
      stop(); tick = 0;
      try {
        pair = compare(model, zombie2Id, humanId, production); slider.max = String(pair.maxTick);
        if (manual) get("selection").textContent = "User-selected example, not representative of the fixed-Z1 slice.";
        get("comparison").textContent = describeComparison(pair.row); get("match").hidden = false;
        get("match").textContent = "All three production replays match frozen outcome, stop tick, cycle start and period. Coordinates are recomputed.";
        for (const p of policies) history(p);
        drawMap(); render();
      } catch (error) { fail(error); }
    }
    try {
      model = indexData(data); get("error").hidden = true;
      const selection = selectDefault(data.results); zombie2Id = selection.row.zombie2Id; humanId = selection.row.humanId;
      get("selection").textContent = selection.reason;
      get("summary").textContent = data.summary.total + " permitted starts in the fixed-Z1 slice, three policies per start. " + model.initialCapture + " start in cardinal contact and capture at tick 0 before any policy can act. " + (data.summary.total - model.initialCapture) + " start without contact.";
      for (const p of policies) for (const k of ["capture", "cycle", "unresolved"]) get("count-" + p + "-" + k).textContent = String(data.summary.policies[p][k]);
      get("moving-summary").textContent = "The capture column includes the same " + model.initialCapture + " initial captures for every policy. Among noninitial starts: " + policies.map(p => names[p] + " " + (data.summary.policies[p].capture - model.initialCapture) + " captures, " + data.summary.policies[p].cycle + " cycles, " + data.summary.policies[p].unresolved + " unresolved").join("; ") + ".";
      get("metadata").textContent = "Source commit: " + data.metadata.commit + " · 10 × 7 board · fixed Z1 ID42 · safety cutoff " + model.config.safetyTickLimit + " ticks · schema " + data.schemaVersion + ".";
      const zombies = get("zombie2-start"); zombies.replaceChildren();
      for (let id = 0; id < 70; id++) { const option = element("option", "Z2 " + coords(point(id)) + " · ID " + id + (id === 42 ? " · co-located with Z1" : "")); option.value = String(id); zombies.appendChild(option); }
      zombies.value = String(zombie2Id); zombies.disabled = false; get("human-start").disabled = false; options();
      const policySelect = get("map-policy"); policySelect.replaceChildren();
      for (const p of policies) { const option = element("option", names[p]); option.value = p; policySelect.appendChild(option); }
      policySelect.value = mapPolicy; policySelect.disabled = false;
      policySelect.addEventListener("change", () => { if (!pair) return; mapPolicy = policySelect.value; if (!policies.includes(mapPolicy)) { fail(new Error("Invalid map policy")); return; } drawMap(); });
      zombies.addEventListener("change", () => { zombie2Id = Number(zombies.value); if (humanId === zombie2Id || humanId === 42) humanId = model.byZombie[zombie2Id].find(Boolean).humanId; options(); choose(true); });
      get("human-start").addEventListener("change", () => { humanId = Number(get("human-start").value); choose(true); });
      get("play").addEventListener("click", () => { if (!pair || timer !== null || pair.maxTick === 0) return; if (tick === pair.maxTick) tick = 0; timer = root.setInterval(() => { tick++; if (tick >= pair.maxTick) stop(); render(); }, 350); render(); });
      get("pause").addEventListener("click", () => { stop(); render(); });
      get("next").addEventListener("click", () => { stop(); tick++; render(); });
      get("reset").addEventListener("click", () => { stop(); tick = 0; render(); });
      slider.addEventListener("input", () => { stop(); tick = Number(slider.value); render(); });
      choose(false);
    } catch (error) { fail(error); }
  }
  root.ZombiePairView = Object.freeze({ indexData, replayRun, compare, atTick, selectDefault, describeRun, describeComparison, mount });
  if (root.document && root.document.getElementById("two-zombies-app")) mount(root.document, root.ZombiePairData, root.ZombiePair);
}(globalThis));
