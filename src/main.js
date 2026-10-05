// Wires state, UI, renderer and the fixed-timestep loop together.

import { step, resetGolems, TICK_MS, ensureGolems } from './sim.js';
import { parseMap } from './map.js';
import { evaluate, loadGame, saveGame, clearSave, newGame, limits } from './progress.js';
import * as P from './program.js';
import { createRenderer } from './render.js';
import { mountUI, SPEEDS } from './ui.js';

const loaded = loadGame() || newGame();
const app = {
  state: loaded.state,
  progress: loaded.progress,
  running: false,
  speedIdx: 0,
  sel: 0,
  line: -1,
  mode: null,
};

const canvas = document.getElementById('canvas');
const renderer = createRenderer(canvas);
let ui;

const save = () => saveGame(app.state, app.progress);

function overBudget() {
  return app.state.golems.some((g) => !P.check(g.program, limits(app.progress)).ok);
}

function tick() {
  step(app.state);
  const done = evaluate(app.state, app.progress);
  if (done.length) {
    const last = done[done.length - 1];
    ui.toast(`Milestone complete: ${done.map((m) => m.title).join(' + ')} → ${last.reward}`, true, 5000);
    ui.renderProgram();
    save();
  } else if (app.state.tick % 50 === 0) {
    save();
  }
}

const actions = {
  save,
  run() {
    if (overBudget()) { ui.toast('A program is over budget'); return; }
    app.mode = null;
    app.running = true;
    ui.renderProgram();
  },
  pause() {
    app.running = false;
    save();
    ui.renderProgram();
  },
  step() {
    if (app.running || overBudget()) return;
    tick();
    ui.updateLive();
  },
  cycleSpeed() {
    app.speedIdx = (app.speedIdx + 1) % SPEEDS.length;
  },
  reset() {
    app.running = false;
    resetGolems(app.state);
    save();
    ui.renderProgram();
  },
  restoreMap() {
    const fresh = parseMap();
    app.state.grid = fresh;
    resetGolems(app.state);
    save();
    ui.toast('Map restored', true);
  },
  wipe() {
    clearSave();
    const g = newGame();
    app.state = g.state; app.progress = g.progress;
    app.running = false; app.sel = 0; app.line = -1; app.mode = null;
    ui.renderProgram();
    ui.toast('Save wiped', true);
  },
};

ui = mountUI(app, actions);
ensureGolems(app.state, app.progress.golems);

canvas.addEventListener('pointerup', (e) => ui.onWorldTap(renderer.hit(app.state.grid, e.clientX, e.clientY)));
window.addEventListener('beforeunload', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(now - last, 250);
  last = now;
  if (app.running) {
    const tickMs = TICK_MS / SPEEDS[app.speedIdx];
    acc += dt;
    let n = 0;
    while (acc >= tickMs && n < 40 && app.running) { tick(); acc -= tickMs; n++; }
    if (n === 40) acc = 0;
  } else {
    acc = 0;
  }
  ui.updateLive();
  renderer.draw(app.state, { selected: app.state.golems[app.sel] });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at the sim from the console.
window.golem = { app, P };
