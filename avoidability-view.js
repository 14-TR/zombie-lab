/* ZL-010: classic-script, selected-witness validation; no graph solve in the UI. */
(function (root) {
  "use strict";
  const policies = ["greedy", "depth1", "depth2"];
  const directions = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
  const cell = p => p.y * 10 + p.x;
  const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const validPoint = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 10 && p.y >= 0 && p.y < 7;
  const contact = f => distance(f.human, f.zombie1) <= 1 || distance(f.human, f.zombie2) <= 1;
  function indexData(data) {
    const check = (ok, detail) => { if (!ok) throw new Error("Invalid avoidability data: " + detail); };
    check(data && data.schemaVersion === 1 && data.metadata && typeof data.metadata.commit === "string", "schema / metadata");
    check(data.metadata.sourceHashes && typeof data.metadata.sourceHashes === "object" && !Array.isArray(data.metadata.sourceHashes), "source hashes");
    check(data.summary && typeof data.summary === "object" && Array.isArray(data.results) && data.results.length === 4761 && Array.isArray(data.witnesses), "complete frozen slice / witnesses");
    const byId = new Map(), stats = { total: data.results.length, initialContact: 0, unavoidableNoninitial: 0, avoidable: 0, maxCaptureTicks: 0,
      policies: Object.fromEntries(policies.map(p => [p, { avoidableCaptures: 0, unavoidableCaptured: 0, delayShortfallStarts: 0, totalDelayShortfall: 0, maxDelayShortfall: 0 }])) };
    let previous = -1;
    for (const row of data.results) {
      check(row && [row.human, row.zombie1, row.zombie2].every(validPoint), "positions");
      const h = cell(row.human), z = cell(row.zombie2), order = z * 70 + h, initial = contact(row);
      check(cell(row.zombie1) === 42 && h !== 42 && h !== z && order > previous && row.id === "z2-" + z + "-h" + h, "ID / fixed-Z1 enumeration");
      check(row.stateIndex === (42 * 70 + z) * 70 + h, "state index"); previous = order;
      check(typeof row.avoidable === "boolean" && (row.avoidable ? row.maxCaptureTicks === null && !initial : Number.isInteger(row.maxCaptureTicks) && row.maxCaptureTicks >= 0 && row.maxCaptureTicks < 343000 && (row.maxCaptureTicks === 0) === initial), "avoidability / maximum delay / initial contact");
      if (initial) stats.initialContact++; else if (row.avoidable) stats.avoidable++; else stats.unavoidableNoninitial++;
      if (!row.avoidable) stats.maxCaptureTicks = Math.max(stats.maxCaptureTicks, row.maxCaptureTicks);
      for (const p of policies) {
        const run = row.policies && row.policies[p], counted = stats.policies[p];
        check(run && ["capture", "cycle", "unresolved"].includes(run.outcome) && Number.isInteger(run.stopTick) && run.stopTick >= 0 && run.stopTick <= 10000, "legacy policy outcome / tick");
        check(run.outcome === "cycle" ? Number.isInteger(run.cycleStart) && run.cycleStart >= 0 && Number.isInteger(run.period) && run.period > 0 && run.cycleStart + run.period === run.stopTick : run.cycleStart === null && run.period === null, "legacy recurrence");
        check(initial ? run.outcome === "capture" && run.stopTick === 0 : run.stopTick > 0, "legacy initial contact");
        check(run.outcome !== "unresolved" || run.stopTick === 10000, "legacy cutoff");
        check(row.avoidable || (run.outcome !== "cycle" && (run.outcome === "capture" ? run.stopTick <= row.maxCaptureTicks : row.maxCaptureTicks > run.stopTick)), "legacy outcome exceeds finite maximum delay");
        if (row.avoidable && run.outcome === "capture") counted.avoidableCaptures++;
        if (!row.avoidable && run.outcome === "capture") {
          const delta = row.maxCaptureTicks - run.stopTick; counted.unavoidableCaptured++;
          counted.delayShortfallStarts += Number(delta > 0); counted.totalDelayShortfall += delta; counted.maxDelayShortfall = Math.max(counted.maxDelayShortfall, delta);
        }
      }
      byId.set(row.id, row);
    }
    let lastWitness = -1;
    const witnesses = new Map();
    for (const witness of data.witnesses) {
      const row = witness && byId.get(witness.id);
      check(row && !witnesses.has(witness.id), "unknown / duplicate witness ID");
      check(row.stateIndex > lastWitness, "witness order"); lastWitness = row.stateIndex;
      check(typeof witness.reason === "string" || Array.isArray(witness.reason) && witness.reason.every(r => typeof r === "string"), "witness reason");
      witnesses.set(witness.id, witness);
    }
    return { data, byId, witnesses, stats };
  }
  function selectDefault(model) { return model.witnesses.values().next().value || null; }
  function legalMoves(from) {
    return directions.map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy })).filter(validPoint);
  }
  function zombieMoves(state) {
    // Frozen N/E/S/W/stay order. Each zombie reads the OLD human independently.
    return state.zombies.map(from => {
      let best, bestDistance = Infinity;
      for (const to of legalMoves(from)) { const d = distance(to, state.human); if (d < bestDistance) { best = to; bestDistance = d; } }
      return best;
    });
  }
  const frameKey = f => (cell(f.zombie1) * 70 + cell(f.zombie2)) * 70 + cell(f.human);
  function validateWitness(row, witness, production) {
    if (!production || typeof production.resolveTick !== "function") throw new Error("Missing production ZombiePair.resolveTick API");
    const check = (ok, detail) => { if (!ok) throw new Error("Replay mismatch: " + (row && row.id || "unknown") + " · " + detail); };
    check(row && witness && witness.id === row.id && Array.isArray(witness.frames) && witness.frames.length > 0 && witness.frames.length <= 343001, "witness ID / bounded frames");
    const seen = new Map(), frames = [];
    let state, outcome = null, cycleStart = null, cyclePeriod = null;
    for (let tick = 0; tick < witness.frames.length; tick++) {
      const f = witness.frames[tick];
      check(!outcome, "frames continue after capture or first recurrence");
      check(f && f.tick === tick && [f.human, f.zombie1, f.zombie2].every(validPoint), "frame tick / coordinates");
      if (tick === 0) {
        check(["human", "zombie1", "zombie2"].every(k => same(f[k], row[k])), "initial positions");
        state = { width: 10, height: 7, tick: 0, tickLimit: Infinity, human: { ...f.human }, zombies: [{ ...f.zombie1 }, { ...f.zombie2 }], status: "running", reason: "" };
        if (contact(f)) state = production.resolveTick(state, { human: state.human, zombies: state.zombies });
      } else {
        check(legalMoves(state.human).some(p => same(p, f.human)), "illegal human action");
        state = production.resolveTick(state, { human: { ...f.human }, zombies: zombieMoves(state) });
      }
      check(state.tick === tick && ["running", "caught"].includes(state.status) && same(state.human, f.human) && same(state.zombies[0], f.zombie1) && same(state.zombies[1], f.zombie2), "production transition / zombie old-state action / status");
      frames.push({ tick, human: { ...f.human }, zombie1: { ...f.zombie1 }, zombie2: { ...f.zombie2 } });
      const key = frameKey(f);
      if (state.status === "caught") outcome = "capture";
      else if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); cyclePeriod = tick - cycleStart; }
      else seen.set(key, tick);
    }
    check(outcome !== null, "no terminal capture or first recurrence");
    const run = { frames, outcome, stopTick: frames.length - 1, cycleStart, cyclePeriod };
    for (const k of ["outcome", "stopTick", "cycleStart", "cyclePeriod"]) check(run[k] === witness[k], k + " expected " + witness[k] + ", actual " + run[k]);
    check(row.avoidable ? outcome === "cycle" && row.maxCaptureTicks === null : outcome === "capture" && run.stopTick === row.maxCaptureTicks, "certified avoidability / maximum-delay endpoint");
    return run;
  }
  const coords = p => "(" + p.x + ", " + p.y + ")";
  function describeRow(row) {
    if (row.avoidable) return "Avoidable: a legal strategy can avoid capture indefinitely. A captured legacy run here is an avoidable policy failure, not unavoidable capture.";
    if (row.maxCaptureTicks === 0) return "Initial-contact capture at tick 0: no policy can act. Maximum delay is 0 ticks.";
    return "Unavoidable capture: every human strategy is eventually caught. Maximum possible capture delay is " + row.maxCaptureTicks + " ticks; the witness attains it.";
  }
  function describeRun(run) {
    if (run.outcome === "capture") return "capture at tick " + run.stopTick;
    if (run.outcome === "cycle") return "cycle from tick " + run.cycleStart + ", first repeat " + run.stopTick + ", period " + (run.cyclePeriod === undefined ? run.period : run.cyclePeriod);
    return "unresolved at cutoff " + run.stopTick + " (not proof of survival)";
  }
  function interpretPolicy(row, run) {
    if (run.outcome === "unresolved") return "Unresolved cutoff; not a measured capture-delay shortfall";
    if (row.avoidable) return run.outcome === "capture" ? "Avoidable policy failure" : "Indefinite avoidance";
    if (row.maxCaptureTicks === 0) return "Initial contact, before any policy can act";
    return "Unavoidable; delay shortfall " + (row.maxCaptureTicks - run.stopTick) + " ticks";
  }
  function comparePolicies(row, production) {
    if (!production || typeof production.step !== "function" || typeof production.initialState !== "function") throw new Error("Missing production ZombiePair policy API");
    const result = { divergence: null };
    for (const p of policies) {
      let state = production.initialState(cell(row.human), cell(row.zombie2)), outcome, cycleStart = null, period = null;
      const frames = [], seen = new Map();
      for (let tick = 0; tick <= 10000; tick++) {
        const f = { tick: state.tick, human: { ...state.human }, zombie1: { ...state.zombies[0] }, zombie2: { ...state.zombies[1] } };
        if (state.tick !== tick || !["running", "caught", "limit"].includes(state.status) || ![f.human, f.zombie1, f.zombie2].every(validPoint) || state.status === "limit" && tick < 10000) throw new Error("Replay mismatch: invalid legacy production progress");
        frames.push(f); const key = frameKey(f);
        if (state.status === "caught" || contact(f)) { outcome = "capture"; break; }
        if (seen.has(key)) { outcome = "cycle"; cycleStart = seen.get(key); period = tick - cycleStart; break; }
        seen.set(key, tick);
        if (tick === 10000) { outcome = "unresolved"; break; }
        state = production.step(state, p);
      }
      const run = { frames, outcome, stopTick: frames.length - 1, cycleStart, period };
      for (const k of ["outcome", "stopTick", "cycleStart", "period"]) if (run[k] !== row.policies[p][k]) throw new Error("Replay mismatch: " + row.id + " / " + p + " / " + k);
      result[p] = run;
    }
    const a = result.depth1.frames, b = result.depth2.frames;
    for (let tick = 0; tick + 1 < Math.min(a.length, b.length); tick++) {
      if (!same(a[tick + 1].human, b[tick + 1].human)) { result.divergence = { tick, depth1: a[tick + 1].human, depth2: b[tick + 1].human }; break; }
    }
    return result;
  }
  function mount(document, data, production) {
    const get = id => document.getElementById(id), slider = get("scrubber"), select = get("witness");
    let model, run = null, tick = 0, timer = null, failed = false;
    function element(tag, text) { const n = document.createElement(tag); if (text !== undefined) n.textContent = String(text); return n; }
    function svgNode(tag, attrs) { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k of Object.keys(attrs)) n.setAttribute(k, attrs[k]); return n; }
    function stop() { if (timer !== null) root.clearInterval(timer); timer = null; }
    function fail(error) {
      stop(); failed = true; run = null; get("error").hidden = false; get("error").textContent = error.message + ". Data and replay cleared; resolve the mismatch and reload.";
      get("match").hidden = true; get("match").textContent = "";
      for (const id of ["world", "history", "policy-results", "totals", "witness"]) get(id).replaceChildren();
      for (const id of ["summary", "classification", "metadata", "divergence", "selection"]) get(id).textContent = "";
      get("world").setAttribute("aria-label", "Replay unavailable"); get("timeline").textContent = "Replay unavailable"; get("readout").textContent = "Replay unavailable";
      slider.value = "0"; slider.max = "0";
      for (const n of document.querySelectorAll("button,select,input")) n.disabled = true;
    }
    function draw(f) {
      const svg = get("world"); svg.replaceChildren(); svg.setAttribute("viewBox", "0 0 10 7");
      for (let y = 0; y < 7; y++) for (let x = 0; x < 10; x++) svg.appendChild(svgNode("rect", { x, y, width: 1, height: 1, fill: "none", stroke: "#c4cecf", "stroke-width": .025 }));
      const agents = [{ id: "human", label: "H", color: "#006ba1" }, { id: "zombie1", label: "1", color: "#a42e32" }, { id: "zombie2", label: "2", color: "#815000" }];
      for (const a of agents) {
        const p = f[a.id], group = agents.filter(b => same(f[b.id], p)), i = group.indexOf(a);
        const offsets = group.length === 3 ? [[0, -.24], [-.24, .24], [.24, .24]] : group.length === 2 ? [[-.24, 0], [.24, 0]] : [[0, 0]];
        const x = p.x + .5 + offsets[i][0], y = p.y + .5 + offsets[i][1], r = group.length > 1 ? .23 : .35;
        const shape = a.id === "human" ? { cx: x, cy: y, r } : { x: x - r, y: y - r, width: 2 * r, height: 2 * r, rx: a.id === "zombie2" ? .09 : 0 };
        svg.appendChild(svgNode(a.id === "human" ? "circle" : "rect", { ...shape, fill: a.color, "data-agent": a.id }));
        const label = svgNode("text", { x, y: y + .16, "text-anchor": "middle", "font-size": .48, "font-weight": 700, fill: "white" }); label.textContent = a.label; svg.appendChild(label);
      }
      svg.setAttribute("aria-label", "Tick " + tick + ": H " + coords(f.human) + "; Z1 " + coords(f.zombie1) + "; Z2 " + coords(f.zombie2) + (same(f.zombie1, f.zombie2) ? "; zombies co-located" : ""));
    }
    function render() {
      if (!run || failed) return;
      if (!Number.isInteger(tick)) { fail(new Error("Replay mismatch: invalid scrub tick")); return; }
      tick = Math.max(0, Math.min(run.stopTick, tick)); const f = run.frames[tick]; draw(f); slider.value = String(tick);
      get("timeline").textContent = "Tick " + tick + " / " + run.stopTick;
      get("readout").textContent = "H " + coords(f.human) + " · Z1 " + coords(f.zombie1) + " · Z2 " + coords(f.zombie2) + ". " + (tick === run.stopTick ? run.outcome === "capture" ? "Capture endpoint." : "First-repeat endpoint (not capture or physical stop). " + describeRun(run) + "." : "Running toward the " + run.outcome + " witness endpoint.");
      for (const row of get("history").children) row.setAttribute("aria-current", String(Number(row.dataset.tick) === tick));
      get("play").disabled = timer !== null || run.stopTick === 0; get("pause").disabled = timer === null; get("next").disabled = tick === run.stopTick; get("reset").disabled = false; slider.disabled = run.stopTick === 0;
    }
    function choose() {
      if (failed) return;
      stop(); run = null; tick = 0;
      try {
        const row = model.byId.get(select.value), witness = model.witnesses.get(select.value);
        const validated = validateWitness(row, witness, production), legacy = comparePolicies(row, production);
        run = validated; slider.max = String(run.stopTick);
        get("selection").textContent = row.id + " · H " + coords(row.human) + " · Z1 " + coords(row.zombie1) + " · Z2 " + coords(row.zombie2) + " · " + (Array.isArray(witness.reason) ? witness.reason.join("; ") : witness.reason) + ". Selected example, not representative.";
        get("classification").textContent = describeRow(row);
        const tbody = get("policy-results"); tbody.replaceChildren();
        for (const p of policies) {
          const r = row.policies[p], tr = element("tr");
          const interpretation = interpretPolicy(row, r);
          for (const value of [p, describeRun(r), interpretation]) tr.appendChild(element("td", value)); tbody.appendChild(tr);
        }
        const d = legacy.divergence;
        get("divergence").textContent = d ? "First depth1 / depth2 action divergence at old-state tick " + d.tick + ": depth1 chooses " + coords(d.depth1) + "; depth2 chooses " + coords(d.depth2) + "." : "No depth1 / depth2 action divergence before their first terminal endpoints.";
        const history = get("history"); history.replaceChildren();
        for (const f of run.frames) { const tr = element("tr"); tr.dataset.tick = f.tick;
          for (const value of [f.tick, coords(f.human), coords(f.zombie1), coords(f.zombie2), f.tick === run.stopTick ? describeRun(run) : f.tick === 0 ? "initial" : "running"]) tr.appendChild(element("td", value)); history.appendChild(tr); }
        get("match").hidden = false; get("match").textContent = "All stored witness frames match legal actions and production dynamics. Outcome, stopping tick, first recurrence and maximum-delay endpoint match. All three legacy scalar outcomes also match production replay.";
        render();
      } catch (error) { fail(error); }
    }
    try {
      model = indexData(data); get("error").hidden = true;
      for (const n of document.querySelectorAll("button,select,input")) n.disabled = true;
      const s = model.stats;
      get("summary").textContent = s.total + " fixed-Z1 starts: " + s.initialContact + " initial-contact captures (tick 0); " + s.unavoidableNoninitial + " noninitial unavoidable captures; " + s.avoidable + " avoidable starts. Largest finite maximum delay in this slice: " + s.maxCaptureTicks + " ticks.";
      const totals = get("totals"); totals.replaceChildren();
      for (const p of policies) { const c = s.policies[p], tr = element("tr"); for (const v of [p, c.avoidableCaptures, c.unavoidableCaptured, c.delayShortfallStarts, c.totalDelayShortfall, c.maxDelayShortfall]) tr.appendChild(element("td", v)); totals.appendChild(tr); }
      get("metadata").textContent = "Source commit: " + data.metadata.commit + " · schema " + data.schemaVersion + ". Source hashes (not authenticated here): " + JSON.stringify(data.metadata.sourceHashes);
      select.replaceChildren();
      for (const w of model.witnesses.values()) { const option = element("option", w.id + " · " + (Array.isArray(w.reason) ? w.reason.join("; ") : w.reason)); option.value = w.id; select.appendChild(option); }
      const first = selectDefault(model);
      if (!first) { get("selection").textContent = "No witness frames supplied. Results are available above; no missing witness category is assumed."; return; }
      select.disabled = false; select.value = first.id; select.addEventListener("change", choose);
      get("play").addEventListener("click", () => { if (!run || failed || timer !== null || run.stopTick === 0) return; if (tick === run.stopTick) tick = 0; timer = root.setInterval(() => { tick++; if (tick >= run.stopTick) stop(); render(); }, 350); render(); });
      get("pause").addEventListener("click", () => { stop(); render(); });
      get("next").addEventListener("click", () => { stop(); tick++; render(); });
      get("reset").addEventListener("click", () => { stop(); tick = 0; render(); });
      slider.addEventListener("input", () => { stop(); tick = Number(slider.value); render(); });
      choose();
    } catch (error) { fail(error); }
  }
  root.ZL_AvoidabilityView = Object.freeze({ indexData, selectDefault, validateWitness, comparePolicies, describeRow, describeRun, interpretPolicy, mount });
  if (root.document && root.document.getElementById("avoidability-app")) mount(root.document, root.ZL_AVOIDABILITY_DATA, root.ZombiePair);
}(globalThis));
