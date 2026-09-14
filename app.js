/* DOM/Canvas presentation only. Simulation state changes only in the Step/Reset handlers. */
(function (root) {
  "use strict";
  function draw(canvas, state) {
    const context = canvas.getContext("2d");
    const cellWidth = canvas.width / state.width;
    const cellHeight = canvas.height / state.height;
    const unit = Math.min(cellWidth, cellHeight);
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "#fbfcfa";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#d2d9d0";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= state.width; x += 1) {
      context.moveTo(x * cellWidth, 0); context.lineTo(x * cellWidth, canvas.height);
    }
    for (let y = 0; y <= state.height; y += 1) {
      context.moveTo(0, y * cellHeight); context.lineTo(canvas.width, y * cellHeight);
    }
    context.stroke();
    const shared = state.human.x === state.zombie.x && state.human.y === state.zombie.y;
    function agent(position, label, color, offset) {
      const x = (position.x + 0.5) * cellWidth + offset;
      const y = (position.y + 0.5) * cellHeight;
      const size = unit * (shared ? 0.19 : 0.3);
      context.fillStyle = color;
      if (label === "H") {
        context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill();
      } else context.fillRect(x - size, y - size, size * 2, size * 2);
      context.fillStyle = "#ffffff";
      context.font = "bold " + Math.round(size * 1.15) + "px system-ui, sans-serif";
      context.textAlign = "center"; context.textBaseline = "middle";
      context.fillText(label, x, y + 1);
    }
    agent(state.human, "H", "#225ca8", shared ? -unit * 0.22 : 0);
    agent(state.zombie, "Z", "#a6362b", shared ? unit * 0.22 : 0);
    context.restore();
  }
  function mount(container) {
    let state = root.ZombieLab.initialState();
    const canvas = container.querySelector("[data-grid]");
    const stepButton = container.querySelector("[data-step]");
    const resetButton = container.querySelector("[data-reset]");
    const status = container.querySelector("[data-status]");
    const positions = container.querySelector("[data-positions]");
    const decisions = container.querySelector("[data-decisions]");
    function coordinate(position) { return "(" + position.x + ", " + position.y + ")"; }
    function repaint() {
      draw(canvas, state);
      status.textContent = (state.status === "running" ? "Running" : state.status === "caught" ? "Caught" : "Tick limit reached") +
        " · tick " + state.tick + " / " + state.tickLimit + (state.reason ? " · " + state.reason : "");
      positions.textContent = "H · Human " + coordinate(state.human) + "     Z · Zombie " + coordinate(state.zombie);
      canvas.setAttribute("aria-label", positions.textContent + ". " + status.textContent);
      decisions.textContent = state.decisions ?
        "Human: " + state.decisions.human.direction + ", maximizing distance to the old zombie: " + state.decisions.human.distance +
        ". Zombie: " + state.decisions.zombie.direction + ", minimizing distance to the old human: " + state.decisions.zombie.distance + "." :
        "No decision yet. Press Step to advance one tick. Both agents will read the same old positions.";
      stepButton.disabled = state.status !== "running";
    }
    stepButton.addEventListener("click", function () { state = root.ZombieLab.step(state); repaint(); });
    resetButton.addEventListener("click", function () { state = root.ZombieLab.initialState(); repaint(); });
    repaint();
    return Object.freeze({ snapshot: function () { return JSON.parse(JSON.stringify(state)); }, repaint });
  }
  root.ZombieLabUI = Object.freeze({ draw, mount });
  if (typeof document !== "undefined" && document.getElementById("lab")) mount(document.getElementById("lab"));
}(globalThis));
