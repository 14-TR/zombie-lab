"use strict";
// Optional developer convenience; the application and tests also run via file://.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
for (const file of ["simulation.js", "tests.js"]) {
  const target = path.join(__dirname, file);
  vm.runInThisContext(fs.readFileSync(target, "utf8"), { filename: file });
}
