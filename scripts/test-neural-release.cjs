"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
test("an explicitly requested real viewer artifact cannot silently skip without Playwright", () => {
  const env = { ...process.env, ZL011_DATA: path.join(root, "absent-neural-release-test.json") };
  delete env.ZL011_PLAYWRIGHT;
  const run = spawnSync(process.execPath, [path.join(__dirname, "test-neural-view.cjs")], { env, encoding: "utf8", timeout: 15000 });
  assert.ifError(run.error);
  assert.notEqual(run.status, 0, "missing real data must fail even without a browser installation");
  assert.match(run.stderr, /ENOENT|no such file/i);
});
test("release keeps the final model, initialization and wrapper byte-for-byte frozen", () => {
  for (const [name, sha256] of Object.entries({
    "feed-forward.json": "c2c007bcb27c68e7f52d61d8e21c3d2003c7331ccb16b84aa46adef87de48275",
    "feed-forward-initial.json": "2b977ed115c41ed2db8256ec25829e2bd4bb11b8484d899a80f4edf7a31b83ef",
    "feed-forward.js": "d995296cb49c23ed69fb9f330c15bcbc2d05209e302e0a3e3774013cfabdec13"
  })) assert.equal(hash(fs.readFileSync(path.join(root, "models", name))), sha256, name);
});
