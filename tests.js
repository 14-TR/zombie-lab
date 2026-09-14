/* Browser and existing-Node test runner; no packages required. */
(function (root) {
  "use strict";
  const tests = [];
  function test(name, run) { tests.push({ name, run }); }
  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }
  function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected),
      (message || "Values differ") + ": " + JSON.stringify(actual) + " !== " + JSON.stringify(expected));
  }

  test("initial world is one human and one zombie on a bounded grid", function () {
    assert(root.ZombieLab && typeof root.ZombieLab.initialState === "function", "Missing initialState");
    const state = root.ZombieLab.initialState();
    equal(state, {
      width: 10, height: 7, tick: 0, tickLimit: 40,
      human: { x: 7, y: 2 }, zombie: { x: 2, y: 4 },
      status: "running", reason: "", decisions: null
    });
    const second = root.ZombieLab.initialState();
    assert(second !== state && second.human !== state.human, "Reset must create fresh state");
  });

  test("one pure tick uses the same old state for both decisions", function () {
    assert(typeof root.ZombieLab.step === "function", "Missing step");
    const state = root.ZombieLab.initialState();
    state.width = 3; state.height = 3;
    state.human = Object.freeze({ x: 1, y: 1 });
    state.zombie = Object.freeze({ x: 0, y: 1 });
    Object.freeze(state);
    const before = JSON.stringify(state);
    const next = root.ZombieLab.step(state);
    equal(next.human, { x: 1, y: 0 }, "Human flees north on a tie");
    equal(next.zombie, { x: 1, y: 1 }, "Zombie targets OLD human, not its new destination");
    equal(next.tick, 1);
    equal(JSON.stringify(state), before, "Input state changed");
    equal(next.decisions.human, { direction: "north", distance: 2 });
    equal(next.decisions.zombie, { direction: "east", distance: 0 });
  });

  test("shared destination is caught and further ticks stop", function () {
    assert(typeof root.ZombieLab.resolveTick === "function", "Missing resolveTick");
    const state = Object.assign(root.ZombieLab.initialState(), {
      width: 2, height: 1, human: { x: 1, y: 0 }, zombie: { x: 0, y: 0 }
    });
    const next = root.ZombieLab.step(state);
    equal(next.status, "caught");
    equal(next.reason, "shared destination");
    equal(next.tick, 1);
    equal(next.human, next.zombie);
    equal(next.decisions.human.direction, "stay");
    equal(root.ZombieLab.step(next), next, "Terminal step must not advance");
    equal(root.ZombieLab.resolveTick(next, { human: next.human, zombie: next.zombie }), next);
  });

  test("exchanged positions are caught even without a shared destination", function () {
    const state = Object.assign(root.ZombieLab.initialState(), {
      width: 2, height: 1, human: { x: 1, y: 0 }, zombie: { x: 0, y: 0 }
    });
    const before = JSON.stringify(state);
    const moves = Object.freeze({ human: Object.freeze({ x: 0, y: 0 }), zombie: Object.freeze({ x: 1, y: 0 }) });
    const next = root.ZombieLab.resolveTick(state, moves);
    equal(next.status, "caught");
    equal(next.reason, "exchanged positions");
    equal(next.tick, 1);
    equal(next.human, moves.human);
    equal(next.zombie, moves.zombie);
    equal(JSON.stringify(state), before);
    equal(root.ZombieLab.step(next), next);
  });

  test("explicit tick limit stops exactly, with capture taking precedence", function () {
    const state = root.ZombieLab.initialState();
    state.tickLimit = 1;
    const next = root.ZombieLab.step(state);
    equal(next.tick, 1);
    equal(next.status, "limit");
    equal(next.reason, "tick limit");
    equal(root.ZombieLab.step(next), next);
    const alreadyAtLimit = Object.assign(root.ZombieLab.initialState(), { tick: 40 });
    equal(root.ZombieLab.step(alreadyAtLimit).tick, 40);
    equal(root.ZombieLab.step(alreadyAtLimit).status, "limit");
    const caughtAtLimit = Object.assign(root.ZombieLab.initialState(), {
      width: 2, height: 1, tickLimit: 1, human: { x: 1, y: 0 }, zombie: { x: 0, y: 0 }
    });
    equal(root.ZombieLab.step(caughtAtLimit).status, "caught");
  });

  test("existing contact stops without moving, including a one-cell board", function () {
    const state = Object.assign(root.ZombieLab.initialState(), {
      width: 1, height: 1, human: { x: 0, y: 0 }, zombie: { x: 0, y: 0 }
    });
    const next = root.ZombieLab.step(state);
    equal(next.tick, 0);
    equal(next.status, "caught");
    equal(next.reason, "already in contact");
    equal(next.human, state.human);
    equal(next.zombie, state.zombie);
    equal(state.status, "running");
    const zeroLimit = Object.assign(root.ZombieLab.initialState(), { tickLimit: 0 });
    equal(root.ZombieLab.step(zeroLimit).tick, 0);
    equal(root.ZombieLab.step(zeroLimit).status, "limit");
  });

  test("resolver rejects out-of-bounds, diagonal, fractional and long moves", function () {
    const state = Object.assign(root.ZombieLab.initialState(), {
      width: 3, height: 3, human: { x: 0, y: 0 }, zombie: { x: 2, y: 2 }
    });
    for (const invalid of [{ x: -1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0 }, { x: 2, y: 0 }]) {
      let rejected = false;
      try { root.ZombieLab.resolveTick(state, { human: invalid, zombie: state.zombie }); }
      catch (error) { rejected = error instanceof RangeError; }
      assert(rejected, "Must reject " + JSON.stringify(invalid) + " with RangeError");
    }
  });

  test("all starts on 1×1 through 4×4 boards stay bounded, pure and repeatable", function () {
    const coverage = { boards: 0, starts: 0, transitions: 0 };
    root.ZombieLabTestCoverage = coverage;
    for (let width = 1; width <= 4; width += 1) for (let height = 1; height <= 4; height += 1) {
      coverage.boards += 1;
      for (let h = 0; h < width * height; h += 1) for (let z = 0; z < width * height; z += 1) {
        coverage.starts += 1;
        let state = Object.assign(root.ZombieLab.initialState(), {
          width, height, tickLimit: 12,
          human: { x: h % width, y: Math.floor(h / width) },
          zombie: { x: z % width, y: Math.floor(z / width) }
        });
        let repeat = JSON.parse(JSON.stringify(state));
        for (let i = 0; i < 14; i += 1) {
          const before = JSON.stringify(state);
          Object.freeze(state.human); Object.freeze(state.zombie); Object.freeze(state);
          const next = root.ZombieLab.step(state);
          repeat = root.ZombieLab.step(repeat);
          coverage.transitions += 1;
          equal(next, repeat, "Trajectory differs");
          equal(JSON.stringify(state), before, "Input mutated");
          for (const name of ["human", "zombie"]) {
            const p = next[name];
            assert(Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < width && p.y >= 0 && p.y < height, "Boundary violated");
            assert(Math.abs(p.x - state[name].x) + Math.abs(p.y - state[name].y) <= 1, "Non-neighbor movement");
          }
          assert(next.tick <= next.tickLimit, "Tick limit exceeded");
          if (state.status !== "running") equal(next, state, "Terminal state changed");
          state = next;
        }
        assert(state.status !== "running", "Run failed to terminate");
      }
    }
  });

  test("following into a vacated cell is not capture unless positions swap", function () {
    const state = Object.assign(root.ZombieLab.initialState(), {
      width: 3, height: 1, human: { x: 0, y: 0 }, zombie: { x: 1, y: 0 }
    });
    equal(root.ZombieLab.resolveTick(state, { human: { x: 1, y: 0 }, zombie: { x: 2, y: 0 } }).status, "running");
    equal(root.ZombieLab.resolveTick(state, { human: state.human, zombie: state.zombie }).status, "running");
  });

  if (typeof document !== "undefined") {
    test("Canvas drawing shows pixels without changing state or trajectories", function () {
      assert(root.ZombieLabUI && typeof root.ZombieLabUI.draw === "function", "Missing Canvas renderer");
      const canvas = document.createElement("canvas");
      canvas.width = 640; canvas.height = 448;
      let drawn = root.ZombieLab.initialState();
      let plain = root.ZombieLab.initialState();
      for (let tick = 0; tick < 45; tick += 1) {
        const before = JSON.stringify(drawn);
        Object.freeze(drawn.human); Object.freeze(drawn.zombie); Object.freeze(drawn);
        root.ZombieLabUI.draw(canvas, drawn);
        root.ZombieLabUI.draw(canvas, drawn);
        equal(JSON.stringify(drawn), before, "Drawing mutated state");
        drawn = root.ZombieLab.step(drawn);
        plain = root.ZombieLab.step(plain);
        equal(drawn, plain, "Drawing changed trajectory");
      }
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      assert(pixels.some(function (value, index) { return index % 4 === 3 && value > 0; }), "Canvas is blank");
    });
    test("Step and Reset controls advance once, stop, and restore the exact start", function () {
      assert(typeof root.ZombieLabUI.mount === "function", "Missing controls");
      const fixture = document.createElement("div");
      fixture.innerHTML = '<canvas data-grid width="640" height="448"></canvas><button data-step>Step</button><button data-reset>Reset</button><p data-status></p><p data-positions></p><p data-decisions></p>';
      const app = root.ZombieLabUI.mount(fixture);
      const start = app.snapshot();
      const button = fixture.querySelector("[data-step]");
      equal(start, root.ZombieLab.initialState());
      button.click();
      equal(app.snapshot().tick, 1, "One click must advance exactly once");
      assert(fixture.querySelector("[data-decisions]").textContent.includes("north"), "Missing decision explanation");
      const beforePaint = app.snapshot();
      app.repaint(); app.repaint();
      equal(app.snapshot(), beforePaint, "Repaint advanced the world");
      const detached = app.snapshot(); detached.human.x = -99;
      equal(app.snapshot(), beforePaint, "Snapshot leaks mutable state");
      for (let i = 0; i < 45; i += 1) button.click();
      assert(button.disabled, "Terminal Step must be disabled");
      const stopped = app.snapshot();
      button.click(); equal(app.snapshot(), stopped);
      assert(stopped.status !== "running" && stopped.tick <= stopped.tickLimit);
      fixture.querySelector("[data-reset]").click();
      equal(app.snapshot(), start, "Reset differs from original start");
      assert(!button.disabled, "Reset must re-enable Step");
      assert(fixture.querySelector("[data-status]").textContent.includes("0 / 40"));
    });
  }

  const results = tests.map(function (entry) {
    try { entry.run(); return { name: entry.name, passed: true }; }
    catch (error) { return { name: entry.name, passed: false, error: error.message }; }
  });
  const failed = results.filter(function (result) { return !result.passed; }).length;
  root.ZombieLabTestResults = { total: results.length, passed: results.length - failed, failed, results };
  const output = results.map(function (result) {
    return (result.passed ? "PASS " : "FAIL ") + result.name + (result.error ? ": " + result.error : "");
  }).join("\n") + "\n" + (results.length - failed) + "/" + results.length + " passed";
  if (typeof document !== "undefined") {
    const element = document.getElementById("results");
    if (element) element.textContent = output;
    document.title = (failed ? "FAIL" : "PASS") + " — Zombie Lab tests";
  }
  if (typeof console !== "undefined") console.log(output);
  if (typeof process !== "undefined" && failed) process.exitCode = 1;
}(globalThis));
