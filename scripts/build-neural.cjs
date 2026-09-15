"use strict";
// Evaluation uses exact ranks; neural-policy.js has no access to them.
function trace(initialIndex, next, terminal, options = {}) {
  const cutoff = options.cutoff ?? 10000;
  if (!Number.isInteger(cutoff) || cutoff < 0 || cutoff > 10000) throw new RangeError("Invalid safety cutoff");
  const seen = new Map(), indices = [];
  let index = initialIndex;
  for (let tick = 0; tick <= cutoff; tick++) {
    indices.push(index);
    if (terminal(index)) return { outcome: "capture", stopTick: tick, cycleStart: null, period: null, indices };
    if (seen.has(index)) return { outcome: "cycle", stopTick: tick, cycleStart: seen.get(index), period: tick - seen.get(index), indices };
    seen.set(index, tick);
    if (tick === cutoff) return { outcome: "unresolved", stopTick: tick, cycleStart: null, period: null, indices };
    index = next(index);
    if (!Number.isInteger(index) || index < 0 || index >= 343000) throw new RangeError("Successor outside position domain");
  }
}
function summarize(rows, policies) {
  const summary = { total: rows.length, initialContact: 0, noninitialUnavoidable: 0, avoidable: 0,
    splits: { train: 0, validation: 0, test: 0 }, policies: {} };
  for (const p of policies) summary.policies[p] = { capture: 0, cycle: 0, unresolved: 0,
    avoidableCaptures: 0, avoidableUnresolved: 0, unavoidableCaptures: 0, initialContactCaptures: 0,
    noninitialUnavoidableCaptures: 0, captureDelayShortfall: { capturedStarts: 0, noninitialCapturedStarts: 0,
      positiveStarts: 0, totalTicks: 0, maxTicks: 0, meanTicks: null, noninitialMeanTicks: null, histogram: {} } };
  for (const row of rows) {
    if (row.avoidable) summary.avoidable++;
    else if (row.maxCaptureTicks === 0) summary.initialContact++;
    else summary.noninitialUnavoidable++;
    if (!(row.split in summary.splits)) throw new Error("Unknown split");
    summary.splits[row.split]++;
    for (const p of policies) {
      const run = row.policies[p], s = summary.policies[p], d = s.captureDelayShortfall;
      if (!run || !["capture", "cycle", "unresolved"].includes(run.outcome)) throw new Error("Unknown outcome");
      s[run.outcome]++;
      if (row.avoidable) {
        s.avoidableCaptures += Number(run.outcome === "capture");
        s.avoidableUnresolved += Number(run.outcome === "unresolved");
      } else {
        if (run.outcome !== "capture") throw new Error("Noncapture contradicts finite rank");
        const shortfall = row.maxCaptureTicks - run.stopTick;
        if (!Number.isInteger(shortfall) || shortfall < 0) throw new Error("Invalid finite-rank delay shortfall");
        s.unavoidableCaptures++; s.initialContactCaptures += Number(row.maxCaptureTicks === 0);
        s.noninitialUnavoidableCaptures += Number(row.maxCaptureTicks > 0);
        d.capturedStarts++; d.noninitialCapturedStarts += Number(row.maxCaptureTicks > 0);
        d.positiveStarts += Number(shortfall > 0); d.totalTicks += shortfall; d.maxTicks = Math.max(d.maxTicks, shortfall);
        d.histogram[shortfall] = (d.histogram[shortfall] || 0) + 1;
      }
    }
  }
  for (const p of policies) {
    const s = summary.policies[p], d = s.captureDelayShortfall;
    d.meanTicks = d.capturedStarts ? d.totalTicks / d.capturedStarts : null;
    d.noninitialMeanTicks = d.noninitialCapturedStarts ? d.totalTicks / d.noninitialCapturedStarts : null;
    s.avoidableCaptureRate = summary.avoidable ? s.avoidableCaptures / summary.avoidable : null;
    s.exactAvoidabilityGap = { winningStarts: summary.avoidable, captured: s.avoidableCaptures,
      unresolved: s.avoidableUnresolved, provenCycles: s.cycle };
  }
  return summary;
}
function comparePolicies(rows, comparator, treatment = "neural") {
  const s = { comparator, treatment, total: rows.length, crossTab: {}, comparatorCycles: 0,
    recoveredAvoidableCaptures: 0, newCapturesOnCycles: 0, unchangedCycles: 0, unresolvedOnCycles: 0,
    avoidableCaptures: 0, comparatorAvoidableCaptures: 0,
    bothCapturedNoninitial: { count: 0, later: 0, earlier: 0, same: 0, totalDeltaTicks: 0, meanDeltaTicks: null } };
  for (const row of rows) {
    const a = row.policies[comparator], b = row.policies[treatment], key = `${a.outcome}->${b.outcome}`;
    s.crossTab[key] = (s.crossTab[key] || 0) + 1;
    s.avoidableCaptures += Number(row.avoidable && b.outcome === "capture");
    s.comparatorAvoidableCaptures += Number(row.avoidable && a.outcome === "capture");
    s.recoveredAvoidableCaptures += Number(row.avoidable && a.outcome === "capture" && b.outcome === "cycle");
    if (a.outcome === "cycle") {
      s.comparatorCycles++; s.newCapturesOnCycles += Number(b.outcome === "capture");
      s.unchangedCycles += Number(b.outcome === "cycle"); s.unresolvedOnCycles += Number(b.outcome === "unresolved");
    }
    if (a.outcome === "capture" && b.outcome === "capture" && a.stopTick > 0 && b.stopTick > 0) {
      const d = s.bothCapturedNoninitial, delta = b.stopTick - a.stopTick;
      d.count++; d[delta > 0 ? "later" : delta < 0 ? "earlier" : "same"]++; d.totalDeltaTicks += delta;
    }
  }
  const d = s.bothCapturedNoninitial; d.meanDeltaTicks = d.count ? d.totalDeltaTicks / d.count : null;
  s.success = s.avoidableCaptures < s.comparatorAvoidableCaptures &&
    s.newCapturesOnCycles === 0 && s.unresolvedOnCycles === 0;
  return s;
}
const { createHash } = require("node:crypto");
const SPLITS = ["train", "validation", "test"];
const splitCache = new Map();
function groupSplit(z1, z2) {
  if (![z1, z2].every(n => Number.isInteger(n) && n >= 0 && n < 70)) throw new RangeError("Invalid zombie cell");
  const key = `${Math.min(z1, z2)}:${Math.max(z1, z2)}`;
  if (!splitCache.has(key)) {
    const bucket = parseInt(createHash("sha256").update(`ZL011:${key}`).digest("hex").slice(0, 8), 16) % 10;
    splitCache.set(key, bucket < 8 ? "train" : bucket === 8 ? "validation" : "test");
  }
  return splitCache.get(key);
}
function indexSplit(index) { return groupSplit(Math.floor(index / 4900), Math.floor(index / 70) % 70); }
function selectWitnesses(rows, replay) {
  const reasons = new Map();
  const first = (predicate, reason) => {
    const row = rows.find(predicate);
    if (row) reasons.set(row.id, [...(reasons.get(row.id) || []), reason]);
  };
  for (const p of ["depth1", "depth2"]) {
    first(r => r.avoidable && r.policies[p].outcome === "capture" && r.policies.neural.outcome === "cycle", `recovery-${p}`);
    first(r => r.policies[p].outcome === "cycle" && r.policies.neural.outcome === "capture", `regression-${p}`);
  }
  first(r => r.policies.neural.outcome === "cycle", "first-neural-cycle");
  first(r => r.avoidable && r.policies.neural.outcome === "capture", "first-avoidable-neural-capture");
  first(r => !r.avoidable && r.maxCaptureTicks > 0, "first-noninitial-unavoidable");
  return rows.filter(r => reasons.has(r.id)).map(row => {
    const run = replay(row);
    if (!run.frames || run.frames.length !== run.stopTick + 1 || run.frames[0].tick !== 0 ||
        run.frames.at(-1).tick !== run.stopTick) throw new Error("Incomplete witness frames");
    return { id: row.id, reason: reasons.get(row.id).join("; "), frames: run.frames,
      outcome: run.outcome, stopTick: run.stopTick, cycleStart: run.cycleStart, cyclePeriod: run.period };
  });
}
function trajectoryOverlap(trajectories, classify = indexSplit) {
  const zeros = () => Object.fromEntries(SPLITS.map(s => [s, 0]));
  const result = { trajectories: 0, frameVisits: zeros(), uniqueStates: zeros(), uniqueGroups: zeros(), trajectoriesVisiting: zeros(),
    definition: "All serialized frames including initial and capture/repeated endpoints; unique groups are unordered zombie pairs. Configurations, not trajectories, are held out." };
  const states = new Set(), groups = new Set();
  for (const indices of trajectories) {
    result.trajectories++; const encountered = new Set();
    for (const index of indices) {
      const split = classify(index); encountered.add(split); result.frameVisits[split]++;
      if (!states.has(index)) { states.add(index); result.uniqueStates[split]++; }
      const z1 = Math.floor(index / 4900), z2 = Math.floor(index / 70) % 70;
      const key = Math.min(z1, z2) * 70 + Math.max(z1, z2);
      if (!groups.has(key)) { groups.add(key); result.uniqueGroups[split]++; }
    }
    for (const split of encountered) result.trajectoriesVisiting[split]++;
  }
  return result;
}
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const ROOT = path.resolve(__dirname, ".."), STATE_COUNT = 343000;
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];
const cell = p => p.y * 10 + p.x;
const stateIndex = s => (cell(s.zombies[0]) * 70 + cell(s.zombies[1])) * 70 + cell(s.human);
function createWorld() {
  // Load the unchanged classic source in this realm so latency comparisons do
  // not charge only the planners for cross-VM function calls.
  const pair = new Function("globalThis", fs.readFileSync(path.join(ROOT, "two-zombies.js"), "utf8") +
    "; return globalThis.ZombiePair;")({});
  const points = Array.from({ length: 70 }, (_, id) => Object.freeze({ x: id % 10, y: Math.floor(id / 10) }));
  const legal = points.map(p => DIRECTIONS.map(([dx, dy]) => {
    const x = p.x + dx, y = p.y + dy;
    return x < 0 || x >= 10 || y < 0 || y >= 7 ? -1 : y * 10 + x;
  }));
  const touching = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 1;
  const terminals = new Uint8Array(STATE_COUNT), successors = new Int32Array(STATE_COUNT * 5).fill(-2);
  for (let i = 0; i < STATE_COUNT; i++) {
    const h = points[i % 70];
    terminals[i] = Number(touching(h, points[Math.floor(i / 4900)]) || touching(h, points[Math.floor(i / 70) % 70]));
  }
  function stateAt(index) {
    if (!Number.isInteger(index) || index < 0 || index >= STATE_COUNT) throw new RangeError("State outside domain");
    return { width: 10, height: 7, tick: 0, tickLimit: 10000, status: "running", reason: "",
      human: points[index % 70], zombies: [points[Math.floor(index / 4900)], points[Math.floor(index / 70) % 70]] };
  }
  function transition(index, action, cached = true) {
    if (!Number.isInteger(action) || action < 0 || action >= 5) throw new RangeError("Invalid action");
    const target = legal[index % 70][action];
    if (terminals[index] || target < 0) return -1;
    const slot = index * 5 + action;
    if (cached && successors[slot] !== -2) return successors[slot];
    const state = stateAt(index), next = pair.resolveTick(state, {
      human: points[target], zombies: pair.step(state, "greedy").zombies });
    const successor = stateIndex(next);
    if (next.tick !== 1 || Number(next.status === "caught") !== terminals[successor]) throw new Error("Production transition mismatch");
    if (cached) successors[slot] = successor;
    return successor;
  }
  function policy(choose) {
    const actions = new Int8Array(STATE_COUNT).fill(-1), choices = new Int32Array(STATE_COUNT).fill(-2);
    const next = index => {
      if (choices[index] !== -2) return choices[index];
      const a = next.action(index);
      return choices[index] = transition(index, a);
    };
    next.action = index => {
      if (actions[index] >= 0) return actions[index];
      if (terminals[index]) throw new Error("Terminal state has no decision");
      const human = choose(stateAt(index)), a = legal[index % 70].indexOf(cell(human));
      if (a < 0) throw new Error("Illegal policy choice");
      return actions[index] = a;
    };
    return next;
  }
  const run = (index, next, options) => trace(index, next, i => Boolean(terminals[i]), options);
  function runDirect(index, choose, options = {}) {
    let current = stateAt(index); current.tickLimit = options.cutoff ?? 10000;
    return trace(index, i => {
      if (stateIndex(current) !== i) throw new Error("Direct replay lost state");
      const next = pair.resolveTick(current, { human: choose(current), zombies: pair.step(current, "greedy").zombies });
      if (next.tick !== current.tick + 1 || Number(next.status === "caught") !== terminals[stateIndex(next)]) throw new Error("Direct replay physics mismatch");
      current = next; return stateIndex(next);
    }, i => Boolean(terminals[i]), options);
  }
  function frames(indices) {
    return indices.map((index, tick) => {
      const s = stateAt(index);
      return { human: { ...s.human }, zombie1: { ...s.zombies[0] }, zombie2: { ...s.zombies[1] }, tick };
    });
  }
  return { pair, stateAt, legal, terminals, transition, policy, run, runDirect, frames };
}
function scoreActions(rank, successors, ranks, logits) {
  let action = -1, best = -Infinity, runnerUp = -Infinity;
  const legal = [], optimal = [];
  let maximumRank = -1;
  for (let a = 0; a < 5; a++) if (successors[a] >= 0) {
    legal.push(a); maximumRank = Math.max(maximumRank, ranks[successors[a]]);
    if (!Number.isFinite(logits[a])) throw new Error("Nonfinite logits");
    if (logits[a] > best) { runnerUp = best; best = logits[a]; action = a; }
    else runnerUp = Math.max(runnerUp, logits[a]);
  }
  for (const a of legal) if (ranks[successors[a]] === (rank === -1 ? -1 : maximumRank)) optimal.push(a);
  if (!optimal.length || action < 0) throw new Error("No legal optimal action");
  const logNormalizer = Math.log(legal.reduce((s, a) => s + Math.exp(logits[a] - best), 0)) + best;
  return { action, optimal: optimal.includes(action), canonical: action === optimal[0],
    margin: best - runnerUp, nearTie: best - runnerUp <= 1e-10,
    crossEntropy: logNormalizer - optimal.reduce((s, a) => s + logits[a], 0) / optimal.length };
}
const NeuralPolicy = require("../neural-policy.js");
const WATCHDOG_MS = 840000, MEMORY_BYTES = 512 * 1024 * 1024;
const hash = value => createHash("sha256").update(value).digest("hex");
function withWatchdog(operation, milliseconds = WATCHDOG_MS) {
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > WATCHDOG_MS) throw new RangeError("Invalid watchdog");
  return vm.runInNewContext("operation()", { operation }, { timeout: milliseconds });
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze); Object.freeze(value);
  }
  return value;
}
function resourceBudget(started) {
  const usage = process.resourceUsage(), elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (process.memoryUsage().rss >= MEMORY_BYTES || usage.maxRSS * 1024 >= MEMORY_BYTES) throw new Error("512 MiB memory budget exceeded");
  if (elapsedMs >= WATCHDOG_MS) throw new Error("14-minute wall-clock budget exceeded");
  return { elapsedMs, maxRSSKiB: usage.maxRSS, currentRSSBytes: process.memoryUsage().rss,
    userCPUTimeUs: usage.userCPUTime, systemCPUTimeUs: usage.systemCPUTime, watchdogMs: WATCHDOG_MS };
}
function dataScript(data) {
  return "window.ZL_NEURAL_DATA = " + JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")) + ";\n";
}
function benchmark(world, model, config = {}) {
  const batchSize = config.batchSize ?? 256, warmups = config.warmups ?? 3, repeats = config.repeats ?? 11;
  const indices = Array.from({ length: batchSize }, (_, k) => {
    let i = Math.floor(k * STATE_COUNT / batchSize);
    while (world.terminals[i]) i = (i + 1) % STATE_COUNT;
    return i;
  });
  const states = indices.map(world.stateAt), names = ["neural", "depth1", "depth2"];
  const choose = { neural: s => NeuralPolicy.chooseHuman(s, model), depth1: s => world.pair.chooseHuman(s, "depth1"),
    depth2: s => world.pair.chooseHuman(s, "depth2"), overhead: s => s.human };
  let checksum = 0;
  const batch = name => {
    const begin = process.hrtime.bigint();
    for (const s of states) checksum += cell(choose[name](s));
    return Number(process.hrtime.bigint() - begin) / 1e6;
  };
  for (let r = 0; r < warmups; r++) for (const name of [...names, "overhead"]) batch(name);
  const measurements = Object.fromEntries([...names, "overhead"].map(n => [n, []]));
  for (let r = 0; r < repeats; r++) {
    const order = names.slice(r % 3).concat(names.slice(0, r % 3));
    for (const name of [...order, "overhead"]) measurements[name].push(batch(name));
  }
  const policies = Object.fromEntries(Object.entries(measurements).map(([name, values]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return [name, { batchMilliseconds: values, medianMicrosecondsPerDecision: median * 1000 / batchSize,
      minMicrosecondsPerDecision: sorted[0] * 1000 / batchSize, maxMicrosecondsPerDecision: sorted.at(-1) * 1000 / batchSize }];
  }));
  return { batchSize, warmups, repeats, stateIndices: indices, checksum, policies,
    method: "Same fixed, evenly spaced nonterminal states; uncached chooseHuman; rotating policy order; same JS realm. Includes loop/call/result checksum and NN validation/normalization. Overhead measured, not subtracted; no simulation/solver or model loading timed.",
    host: { platform: process.platform, arch: process.arch, node: process.version, cpu: require("node:os").cpus()[0]?.model },
    depth1ToNeuralRatio: policies.depth1.medianMicrosecondsPerDecision / policies.neural.medianMicrosecondsPerDecision,
    depth2ToNeuralRatio: policies.depth2.medianMicrosecondsPerDecision / policies.neural.medianMicrosecondsPerDecision };
}
const scalar = run => ({ outcome: run.outcome, stopTick: run.stopTick, cycleStart: run.cycleStart, period: run.period });
function buildNeural(options = {}) { return withWatchdog(() => buildNeuralCore(options)); }
function buildNeuralCore(options) {
  const started = process.hrtime.bigint(), check = () => resourceBudget(started), fixture = options.fixture === true;
  if (!fixture && ["model", "initial", "originalRows", "oneStepIndices", "heldoutIndices", "benchmarkConfig"].some(k => k in options)) {
    throw new Error("Custom models/domains/benchmark require explicitly labeled fixture mode");
  }
  const modelDir = path.resolve(options.modelDir || path.join(ROOT, "models"));
  const modelPaths = { neural: path.join(modelDir, "feed-forward.json"), untrained: path.join(modelDir, "feed-forward-initial.json") };
  const models = {}, modelHashes = {};
  for (const [name, file] of Object.entries(modelPaths)) {
    const supplied = fixture && options[name === "neural" ? "model" : "initial"];
    if (!supplied && !fs.existsSync(file)) throw new Error(`Frozen model absent: ${file}. Run training first; no evaluation performed.`);
    const bytes = supplied ? JSON.stringify(supplied) : fs.readFileSync(file);
    const model = supplied ? JSON.parse(bytes) : JSON.parse(bytes.toString());
    NeuralPolicy.validateModel(model);
    if (model.epoch !== (name === "neural" ? 40 : 0)) throw new Error("Frozen epoch mismatch");
    models[name] = deepFreeze(model); modelHashes[name] = hash(bytes);
  }
  // Both identities are fixed above before reading any exact labels or outcomes.
  if (options.onFrozen) options.onFrozen({ schemaVersion: 1, modelHashes, modelPaths, fixture });
  const certificateFile = path.join(ROOT, "evidence/avoidability/data/avoidability-certificate.json");
  const legacyFile = path.join(ROOT, "evidence/avoidability/data/avoidability.json");
  const certificate = JSON.parse(fs.readFileSync(certificateFile)), legacy = JSON.parse(fs.readFileSync(legacyFile));
  if (certificate.schemaVersion !== 1 || certificate.ranks.length !== STATE_COUNT ||
      certificate.ranks.some(r => !Number.isInteger(r) || r < -1 || r >= STATE_COUNT)) throw new Error("Invalid complete exact-rank certificate");
  for (const [name, digest] of Object.entries(certificate.metadata.sourceHashes)) {
    if (hash(fs.readFileSync(path.join(ROOT, name))) !== digest) throw new Error(`Frozen source changed: ${name}`);
  }
  const ranks = Int32Array.from(certificate.ranks), world = createWorld();
  const sourceHashes = Object.fromEntries(["two-zombies.js", "neural-policy.js", "scripts/build-neural.cjs", "experiments/ZL-011-protocol.md"]
    .map(f => [f, hash(fs.readFileSync(path.join(ROOT, f)))]));
  const domain = Array.from({ length: STATE_COUNT }, (_, i) => i);
  const oneStepIndices = fixture ? options.oneStepIndices : domain.filter(i => !world.terminals[i]);
  const heldoutIndices = fixture ? options.heldoutIndices : domain.filter(i => indexSplit(i) === "test");
  const original = fixture ? options.originalRows : legacy.results;
  if (!fixture && (original.length !== 4761 || new Set(original.map(r => r.id)).size !== 4761)) throw new Error("Incomplete original domain");
  const verification = { graphStates: 0, graphLegalActions: 0, originalReplayRows: 0, heldoutReplayRows: 0,
    legacyOutcomeComparisons: 0, cacheFrameComparisons: 0, fixture };
  const graphIndices = fixture ? oneStepIndices : domain;
  for (const i of graphIndices) {
    if (i % 1024 === 0) check(); verification.graphStates++;
    if ((ranks[i] === 0) !== Boolean(world.terminals[i])) throw new Error(`Contact/rank mismatch: ${i}`);
    if (world.terminals[i]) continue;
    const successors = Array.from({ length: 5 }, (_, a) => world.transition(i, a));
    const nextRanks = successors.filter(n => n >= 0).map(n => ranks[n]); verification.graphLegalActions += nextRanks.length;
    if (ranks[i] === -1 ? !nextRanks.includes(-1) : nextRanks.includes(-1) || ranks[i] !== Math.max(...nextRanks) + 1) {
      throw new Error(`Exact rank equation failed: ${i}`);
    }
  }
  const choose = { neural: s => NeuralPolicy.chooseHuman(s, models.neural), untrained: s => NeuralPolicy.chooseHuman(s, models.untrained),
    greedy: s => world.pair.chooseHuman(s, "greedy"), depth1: s => world.pair.chooseHuman(s, "depth1"), depth2: s => world.pair.chooseHuman(s, "depth2") };
  const policies = Object.fromEntries(Object.entries(choose).map(([p, fn]) => [p, world.policy(fn)]));
  const oneStep = {};
  for (const name of ["untrained", "neural"]) {
    const scores = Object.fromEntries(SPLITS.map(s => [s, { states: 0, optimalActions: 0, canonicalActions: 0, nearTies: 0, minMargin: null, crossEntropySum: 0 }]));
    for (const i of oneStepIndices) {
      if (i % 1024 === 0) check();
      if (world.terminals[i]) throw new Error("One-step domain contains initial contact");
      const logits = NeuralPolicy.logits(world.stateAt(i), models[name]);
      const result = scoreActions(ranks[i], Array.from({ length: 5 }, (_, a) => world.transition(i, a)), ranks, logits);
      if (policies[name].action(i) !== result.action) throw new Error("Inference mask/choice mismatch");
      const s = scores[indexSplit(i)]; s.states++; s.optimalActions += Number(result.optimal); s.canonicalActions += Number(result.canonical);
      s.nearTies += Number(result.nearTie); s.minMargin = s.minMargin === null ? result.margin : Math.min(s.minMargin, result.margin); s.crossEntropySum += result.crossEntropy;
    }
    for (const s of Object.values(scores)) {
      s.optimalActionAccuracy = s.states ? s.optimalActions / s.states : null;
      s.canonicalActionAgreement = s.states ? s.canonicalActions / s.states : null;
      s.crossEntropy = s.states ? s.crossEntropySum / s.states : null;
    }
    oneStep[name] = scores;
  }
  const parity = options.python ? Object.fromEntries(["untrained", "neural"].map(name => {
    check(); return [name, verifyPython(models[name], oneStepIndices, world, options.python)];
  })) : { status: "not-run", reason: fixture ? "Synthetic fixture" : "Supply --python EXISTING_NUMPY_PYTHON for independent all-state parity; default builder/CI has no Python dependency." };
  const verifiedRun = (index, p) => {
    const cached = world.run(index, policies[p]), direct = world.runDirect(index, choose[p]);
    if (JSON.stringify(cached) !== JSON.stringify(direct)) throw new Error(`Cache/direct complete trajectory mismatch: ${index}/${p}`);
    verification.cacheFrameComparisons += direct.indices.length; return cached;
  };
  const results = original.map((old, n) => {
    if (n % 128 === 0) check();
    const i = old.stateIndex, s = world.stateAt(i), row = { id: old.id, stateIndex: i, human: { ...s.human }, zombie1: { ...s.zombies[0] },
      zombie2: { ...s.zombies[1] }, split: indexSplit(i), avoidable: ranks[i] === -1, maxCaptureTicks: ranks[i] < 0 ? null : ranks[i], policies: {} };
    for (const p of ["greedy", "depth1", "depth2", "untrained", "neural"]) {
      row.policies[p] = scalar(verifiedRun(i, p));
      if (["greedy", "depth1", "depth2"].includes(p)) {
        if (JSON.stringify(row.policies[p]) !== JSON.stringify(old.policies[p])) throw new Error(`Frozen legacy outcome mismatch: ${row.id}/${p}`);
        verification.legacyOutcomeComparisons++;
      }
    }
    verification.originalReplayRows++; return row;
  });
  const heldoutResults = heldoutIndices.map(i => ({ id: `state-${i}`, stateIndex: i, split: indexSplit(i),
    avoidable: ranks[i] < 0, maxCaptureTicks: ranks[i] < 0 ? null : ranks[i], policies: {} }));
  const overlap = {};
  for (const p of ["untrained", "neural"]) {
    overlap[p] = trajectoryOverlap((function* () {
      for (let n = 0; n < heldoutResults.length; n++) {
        if (n % 128 === 0) check(); const row = heldoutResults[n], run = verifiedRun(row.stateIndex, p);
        row.policies[p] = scalar(run); yield run.indices;
      }
    })());
  }
  verification.heldoutReplayRows = heldoutResults.length;
  const originalSummary = summarize(results, ["greedy", "depth1", "depth2", "untrained", "neural"]);
  const heldoutSummary = { ...summarize(heldoutResults, ["untrained", "neural"]),
    scope: "exact-avoidability-only; no expanded planner comparison", overlap };
  const comparisons = Object.fromEntries(["depth1", "depth2", "untrained"].map(p => [p, comparePolicies(results, p)]));
  if (!fixture) for (const p of ["depth1", "depth2"]) {
    if (comparisons[p].comparatorAvoidableCaptures !== 24 || comparisons[p].comparatorCycles !== 4193) throw new Error("Frozen comparator mismatch");
  }
  const witnesses = selectWitnesses(results, row => { const run = world.run(row.stateIndex, policies.neural); return { ...run, frames: world.frames(run.indices) }; });
  const membershipHash = createHash("sha256"), splitCounts = Object.fromEntries(SPLITS.map(s => [s, { groups: 0, states: 0, nonterminalStates: 0 }]));
  for (let a = 0; a < 70; a++) for (let b = a; b < 70; b++) splitCounts[groupSplit(a, b)].groups++;
  for (const i of domain) { const split = indexSplit(i); splitCounts[split].states++; splitCounts[split].nonterminalStates += Number(!world.terminals[i]); membershipHash.update(`${i}:${split}\n`); }
  const data = { schemaVersion: 1, metadata: { fixture, commit: options.commit ?? process.env.PREVIEW_COMMIT ?? "unknown",
    protocolCommit: "875c75ec5bc8c0b39179202ff570b6a5d4e10fbd", modelHashes, sourceHashes,
    certificateSHA256: hash(fs.readFileSync(certificateFile)), legacySHA256: hash(fs.readFileSync(legacyFile)),
    splitCounts, splitMembershipSHA256: membershipHash.digest("hex"), splitDigestEncoding: "UTF8 stateIndex:split\n, all 343000 ordered states ascending",
    safetyCutoff: 10000, heldoutScope: heldoutSummary.scope,
    limitations: ["The 4761-row original slice is a regression benchmark, not wholly held out.", "Only start configurations are held out; complete trajectories can visit training or validation groups.", "Imitation of exact-control targets, not independent discovery or reinforcement learning.", "One fixed seed/architecture/final epoch; no post-test tuning."] },
    summary: { ...originalSummary, original: originalSummary, heldout: heldoutSummary, oneStep, comparisons, verification, parity,
      witnessCount: witnesses.length, witnessFrames: witnesses.reduce((s, w) => s + w.frames.length, 0), latency: benchmark(world, models.neural, options.benchmarkConfig) },
    results, witnesses };
  for (const [name, file] of Object.entries(modelPaths)) {
    if (!(fixture && options[name === "neural" ? "model" : "initial"]) && hash(fs.readFileSync(file)) !== modelHashes[name]) {
      throw new Error("Frozen model file changed during evaluation: " + name);
    }
  }
  Object.defineProperty(data, "heldoutResults", { value: heldoutResults });
  Object.defineProperty(data, "resources", { value: check() });
  return data;
}
function verifyPython(model, indices, world, python) {
  const script = `import json, sys, signal, resource, time
import numpy as np
signal.alarm(600)
started = time.perf_counter()
payload = json.load(sys.stdin)
p = {k: np.array(payload["model"][k], dtype=np.float64) for k in ("W1", "b1", "W2", "b2")}
indices = payload["indices"]
for start in range(0, len(indices), 1024):
    ids = np.array(indices[start:start+1024], dtype=np.int64)
    h, z1, z2 = ids % 70, ids // 4900, (ids // 70) % 70
    X = np.column_stack((h % 10 / 9, h // 10 / 6, z1 % 10 / 9, z1 // 10 / 6, z2 % 10 / 9, z2 // 10 / 6))
    L = np.tanh(X @ p["W1"] + p["b1"]) @ p["W2"] + p["b2"]
    if not np.isfinite(L).all(): raise FloatingPointError("Nonfinite independent logits")
    legal = np.column_stack((h // 10 > 0, h % 10 < 9, h // 10 < 6, h % 10 > 0, np.ones(len(h), dtype=bool)))
    action = np.argmax(np.where(legal, L, -np.inf), axis=1)
    sys.stdout.buffer.write(np.column_stack((L, action)).astype("<f8").tobytes())
    rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == "darwin" else 1024)
    if rss >= 512 * 1024 * 1024: raise MemoryError("512 MiB parity subprocess budget exceeded")
print(json.dumps({"python": sys.version, "numpy": np.__version__, "elapsedMs": (time.perf_counter()-started)*1000, "maxRSSBytes": rss, "blasThreads": 1}), file=sys.stderr)
`;
  const run = require("node:child_process").spawnSync(python, ["-c", script], {
    input: JSON.stringify({ model, indices }), maxBuffer: 20 * 1024 * 1024, timeout: 600000,
    env: { ...process.env, OPENBLAS_NUM_THREADS: "1", OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1", VECLIB_MAXIMUM_THREADS: "1", BLIS_NUM_THREADS: "1" } });
  if (run.error || run.status !== 0) throw new Error("Independent Python parity failed: " + (run.error?.message || run.stderr.toString()));
  if (run.stdout.length !== indices.length * 48) throw new Error("Incomplete Python parity output");
  const receipt = { states: indices.length, tolerance: 1e-10, maxAbsoluteLogitError: 0, actionDisagreements: 0,
    nearTies: 0, firstActionDisagreements: [], resources: JSON.parse(run.stderr.toString()),
    method: "Independent NumPy batched float64 matrix products; no exact ranks/labels; binary six-float64 records (five logits, first-tied legal argmax). No outputs retained." };
  for (let row = 0; row < indices.length; row++) {
    const index = indices[row], state = world.stateAt(index), jsLogits = NeuralPolicy.logits(state, model);
    let best = -Infinity, second = -Infinity;
    for (let a = 0; a < 5; a++) {
      const other = run.stdout.readDoubleLE(row * 48 + a * 8);
      if (!Number.isFinite(other)) throw new Error("Nonfinite Python parity output");
      receipt.maxAbsoluteLogitError = Math.max(receipt.maxAbsoluteLogitError, Math.abs(other - jsLogits[a]));
      if (world.legal[index % 70][a] >= 0) {
        if (jsLogits[a] > best) { second = best; best = jsLogits[a]; }
        else second = Math.max(second, jsLogits[a]);
      }
    }
    receipt.nearTies += Number(best - second <= 1e-10);
    const jsAction = world.legal[index % 70].indexOf(cell(NeuralPolicy.chooseHuman(state, model))), pyAction = run.stdout.readDoubleLE(row * 48 + 40);
    if (jsAction !== pyAction) {
      receipt.actionDisagreements++;
      if (receipt.firstActionDisagreements.length < 10) receipt.firstActionDisagreements.push({ stateIndex: index, jsAction, pythonAction: pyAction, jsMargin: best - second });
    }
  }
  receipt.passed = receipt.maxAbsoluteLogitError <= receipt.tolerance;
  if (!receipt.passed) throw new Error("Python/JS logit tolerance exceeded: " + JSON.stringify(receipt));
  return receipt;
}
function main() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    const name = { "--out-dir": "outDir", "--model-dir": "modelDir", "--python": "python" }[args[i]];
    if (!name || !args[i + 1] || args[i + 1].startsWith("--") || name in options) throw new Error("Usage: node scripts/build-neural.cjs [--out-dir DIR] [--model-dir DIR] [--python EXISTING_NUMPY_PYTHON]");
    options[name] = args[i + 1];
  }
  const started = process.hrtime.bigint(), out = path.resolve(options.outDir || process.env.PREVIEW_OUTPUT_DIR || "preview");
  options.onFrozen = receipt => {
    fs.mkdirSync(out, { recursive: true });
    const target = path.join(out, "frozen-models.json");
    if (fs.existsSync(target) && JSON.stringify(JSON.parse(fs.readFileSync(target)).modelHashes) !== JSON.stringify(receipt.modelHashes)) {
      throw new Error("Evaluation directory already bound to different frozen models");
    }
    fs.writeFileSync(target, JSON.stringify(receipt) + "\n");
  };
  const data = buildNeural(options);
  const artifacts = { "neural.json": JSON.stringify(data) + "\n", "neural-data.js": dataScript(data),
    "neural-heldout.json": JSON.stringify({ schemaVersion: 1, metadata: data.metadata, summary: data.summary.heldout, results: data.heldoutResults }) + "\n" };
  const artifactBytes = Object.fromEntries(Object.entries(artifacts).map(([n, text]) => [n, Buffer.byteLength(text)]));
  const outputBytes = Object.values(artifactBytes).reduce((a, b) => a + b, 0);
  if (outputBytes >= 30000000) throw new Error("30 MB retained artifact budget exceeded");
  resourceBudget(started);
  for (const [name, text] of Object.entries(artifacts)) fs.writeFileSync(path.join(out, name), text);
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(out, "neural-data.js"), "utf8"), context, { timeout: 5000 });
  if (JSON.stringify(context.window.ZL_NEURAL_DATA) !== JSON.stringify(JSON.parse(fs.readFileSync(path.join(out, "neural.json"))))) throw new Error("Emitted classic/JSON payload mismatch");
  if (JSON.parse(fs.readFileSync(path.join(out, "neural-heldout.json"))).results.length !== data.summary.heldout.total) throw new Error("Emitted heldout count mismatch");
  const receipt = { output: out, metadata: data.metadata, summary: data.summary, artifactBytes, outputBytes,
    artifactHashes: Object.fromEntries(Object.keys(artifacts).map(name => [name, hash(fs.readFileSync(path.join(out, name)))])),
    resources: resourceBudget(started), emittedArtifactsVerified: true };
  fs.writeFileSync(path.join(out, "evaluation.json"), JSON.stringify(receipt) + "\n");
  console.log(JSON.stringify(receipt));
}
module.exports = { trace, summarize, comparePolicies, groupSplit, selectWitnesses, trajectoryOverlap, createWorld,
  scoreActions, buildNeural, dataScript, withWatchdog, verifyPython };
if (require.main === module) {
  try { withWatchdog(main); }
  catch (error) { console.error("Neural evaluation failed: " + error.message); process.exitCode = 1; }
}
