"use strict";
// Offline labels only; never imported by browser inference.
const crypto = require("node:crypto");
const SPLITS = ["train", "validation", "test"];
const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0], [0, 0]];

function requireCell(cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 70) throw new RangeError("Cell must be integer 0..69");
}
function splitForCells(z1, z2) {
  requireCell(z1); requireCell(z2);
  const text = `ZL011:${Math.min(z1, z2)}:${Math.max(z1, z2)}`;
  const bucket = parseInt(crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8), 16) % 10;
  return bucket < 8 ? "train" : bucket === 8 ? "validation" : "test";
}
function inputsAndLegal(h, z1, z2) {
  [h, z1, z2].forEach(requireCell);
  const x = h % 10, y = Math.floor(h / 10);
  return { inputs: [h, z1, z2].flatMap(c => [(c % 10) / 9, Math.floor(c / 10) / 6]),
    legal: DIRECTIONS.map(([dx, dy]) => x + dx >= 0 && x + dx < 10 && y + dy >= 0 && y + dy < 7) };
}
function targetsForRanks(rank, successorRanks) {
  if (!Number.isInteger(rank) || rank < -1 || rank === 0 || !Array.isArray(successorRanks) || successorRanks.length !== 5 ||
      successorRanks.some(r => r !== null && (!Number.isInteger(r) || r < -1))) throw new Error("Invalid nonterminal rank/action ranks");
  const present = successorRanks.filter(r => r !== null);
  if (!present.length) throw new Error("No legal successor");
  const desired = rank === -1 ? -1 : Math.max(...present);
  if (rank > 0 && (present.some(r => r < 0) || rank !== desired + 1)) throw new Error("Exact finite rank rule violated");
  const count = successorRanks.filter(r => r === desired).length;
  if (!count) throw new Error("Winning state lacks winning successor");
  return successorRanks.map(r => r === desired ? 1 / count : 0);
}

const fs = require("node:fs"), path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function writeDataset(graph, outDir, metadata = {}) {
  const { terminals, ranks, successors } = graph;
  if (terminals.length !== 343000 || ranks.length !== 343000 || successors.length !== 343000 * 5) throw new Error("Complete graph required");
  const out = path.resolve(outDir), names = [...SPLITS.map(s => s + ".json"), "manifest.json"];
  fs.mkdirSync(out, { recursive: true });
  for (const name of names) if (fs.existsSync(path.join(out, name))) throw new Error("Dataset output already exists: " + name);
  const stats = Object.fromEntries(SPLITS.map(s => [s, { groups: 0, orderedStates: 0, terminalStates: 0, examples: 0 }]));
  const memberships = Object.fromEntries(SPLITS.map(s => [s, crypto.createHash("sha256")]));
  const groupMembership = crypto.createHash("sha256"), stateMembership = crypto.createHash("sha256");
  const groupSplit = new Array(4900);
  for (let a = 0; a < 70; a++) for (let b = a; b < 70; b++) {
    const split = splitForCells(a, b);
    groupSplit[a * 70 + b] = split; groupSplit[b * 70 + a] = split;
    stats[split].groups++; groupMembership.update(`${a}:${b}:${split}\n`);
  }
  for (let index = 0; index < 343000; index++) {
    const split = groupSplit[Math.floor(index / 70)], terminal = terminals[index];
    if (terminal !== 0 && terminal !== 1) throw new Error("Invalid terminal flag");
    stats[split].orderedStates++; stats[split].terminalStates += terminal;
    stateMembership.update(`${index}:${split}:${terminal}\n`);
    if (!terminal) { stats[split].examples++; memberships[split].update(`${index}\n`); }
  }
  const files = {}, rankBytes = Buffer.allocUnsafe(ranks.length * 4);
  ranks.forEach((rank, index) => rankBytes.writeInt32LE(rank, index * 4));
  for (const split of SPLITS) {
    stats[split].membershipSha256 = memberships[split].digest("hex");
    const filename = split + ".json", fd = fs.openSync(path.join(out, filename), "wx"), hash = crypto.createHash("sha256");
    let bytes = 0, count = 0, buffer = "";
    const flush = () => { fs.writeFileSync(fd, buffer); hash.update(buffer); bytes += Buffer.byteLength(buffer); buffer = ""; };
    const append = text => { buffer += text; if (buffer.length > 65536) flush(); };
    try {
      append(`{\"schemaVersion\":1,\"split\":${JSON.stringify(split)},\"examples\":[\n`);
      for (let index = 0; index < 343000; index++) {
        if (terminals[index] || groupSplit[Math.floor(index / 70)] !== split) continue;
        const h = index % 70, z1 = Math.floor(index / 4900), z2 = Math.floor(index / 70) % 70;
        const features = inputsAndLegal(h, z1, z2), successorRanks = [];
        for (let a = 0; a < 5; a++) {
          const next = successors[index * 5 + a];
          if (features.legal[a] !== (next >= 0) || next >= 343000) throw new Error(`Legal transition mismatch: ${index}/${a}`);
          successorRanks.push(next < 0 ? null : ranks[next]);
        }
        const row = { stateIndex: index, ...features, targets: targetsForRanks(ranks[index], successorRanks) };
        append(JSON.stringify(row) + (++count < stats[split].examples ? ",\n" : "\n"));
      }
      append("]}\n"); flush(); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    if (count !== stats[split].examples) throw new Error("Example count mismatch");
    files[filename] = { bytes, sha256: hash.digest("hex") };
  }
  const manifest = { schemaVersion: 1, metadata, stateCount: 343000,
    enumeration: "stateIndex=(z1Cell*70+z2Cell)*70+humanCell; cell=y*10+x; ascending stateIndex",
    inputs: ["hx/9", "hy/6", "z1x/9", "z1y/6", "z2x/9", "z2y/6"], actions: ["N", "E", "S", "W", "stay"],
    splitRule: "SHA256 UTF8 ZL011:min(z1,z2):max(z1,z2); first8 hex uint32 modulo10; 0..7 train,8 validation,9 test",
    targetRule: "Uniform over legal rank -1 successors if winning; otherwise uniform over all maximum-rank legal successors",
    membershipEncoding: "UTF8 ascending decimal stateIndex followed by LF; nonterminal only, per split",
    groupMembershipEncoding: "UTF8 a:b:split followed by LF; a=0..69,b=a..69",
    stateMembershipEncoding: "UTF8 stateIndex:split:terminal followed by LF; all states ascending; terminal=0 or1",
    groupMembershipSha256: groupMembership.digest("hex"), stateMembershipSha256: stateMembership.digest("hex"),
    rankEncoding: "Int32 little-endian rank per ascending stateIndex", ranksSha256: digest(rankBytes), splits: stats, files };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  return manifest;
}
function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--out-dir" || !args[1] || args[1].startsWith("--")) throw new Error("Usage: node scripts/build-neural-dataset.cjs --out-dir DIR");
  const started = process.hrtime.bigint();
  const sourceNames = ["experiments/ZL-011-protocol.md", "scripts/build-neural-dataset.cjs", "scripts/build-avoidability.cjs", "two-zombies.js"];
  const sourceHashes = Object.fromEntries(sourceNames.map(name => [name, digest(fs.readFileSync(path.join(ROOT, name)))]));
  const { execFileSync } = require("node:child_process");
  const metadata = { protocolCommit: "875c75ec5bc8c0b39179202ff570b6a5d4e10fbd", sourceHashes,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    worktreeStatus: execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim(),
    nodeVersion: process.version, createdAt: new Date().toISOString() };
  const graph = require("./build-avoidability.cjs").solveGraph();
  // Bind the new labels to the already-frozen ZL-010 certificate, not a new game.
  const certificatePath = path.join(ROOT, "evidence/avoidability/data/avoidability-certificate.json");
  const certificateBytes = fs.readFileSync(certificatePath), certificate = JSON.parse(certificateBytes);
  if (certificate.ranks.length !== graph.ranks.length || certificate.ranks.some((r, i) => r !== graph.ranks[i])) throw new Error("Frozen ZL-010 certificate rank mismatch");
  metadata.certificateSha256 = digest(certificateBytes);
  const manifest = writeDataset(graph, args[1], metadata), usage = process.resourceUsage();
  console.log(JSON.stringify({ output: path.resolve(args[1]), manifestSha256: digest(fs.readFileSync(path.join(args[1], "manifest.json"))),
    splits: manifest.splits, groupMembershipSha256: manifest.groupMembershipSha256, stateMembershipSha256: manifest.stateMembershipSha256,
    elapsedSeconds: Number(process.hrtime.bigint() - started) / 1e9, maxRSSBytes: usage.maxRSS * 1024,
    files: manifest.files, graphVerification: graph.verification, sourceHashes }));
}
module.exports = { splitForCells, inputsAndLegal, targetsForRanks, writeDataset };
if (require.main === module) {
  try { require("./build-avoidability.cjs").withWatchdog(main); }
  catch (error) { console.error(error.stack); process.exitCode = 1; }
}
