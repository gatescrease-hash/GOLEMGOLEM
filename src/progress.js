// Stockpile-driven milestones, unlocks and the localStorage save.

import { rate, ensureGolems, createGolem, createState } from './sim.js';
import { serializeGrid, deserializeGrid } from './map.js';
import { reserveIds } from './program.js';

export const M5_STONE_PER_MIN = 15;
export const M5_ORE_PER_MIN = 4;
export const M5_HOLD_TICKS = 300; // 2 simulated minutes at 400 ms/tick

const START = { golems: 1, budget: 10, lines: 8 };

export const MILESTONES = [
  {
    title: 'Deliver 20 stone',
    reward: '2nd golem',
    frac: (s) => s.stockpile.stone / 20,
    done: (s) => s.stockpile.stone >= 20,
    apply: (p) => { p.golems = 2; },
  },
  {
    title: 'Deliver 60 stone',
    reward: 'JMP + IF, budget 16, 12 lines',
    frac: (s) => s.stockpile.stone / 60,
    done: (s) => s.stockpile.stone >= 60,
    apply: (p) => {
      p.unlocked.JMP = p.unlocked.IF_YES = p.unlocked.IF_NO = true;
      p.budget = 16; p.lines = 12;
    },
  },
  {
    title: 'Deliver 10 ore',
    reward: '3rd golem, budget 20',
    frac: (s) => s.stockpile.ore / 10,
    done: (s) => s.stockpile.ore >= 10,
    apply: (p) => { p.golems = 3; p.budget = 20; },
  },
  {
    title: 'Deliver 30 ore',
    reward: 'IS?, budget 28, 16 lines',
    frac: (s) => s.stockpile.ore / 30,
    done: (s) => s.stockpile.ore >= 30,
    apply: (p) => { p.unlocked.IS = true; p.budget = 28; p.lines = 16; },
  },
  {
    title: `Hold ${M5_STONE_PER_MIN} stone/min + ${M5_ORE_PER_MIN} ore/min for 2:00`,
    reward: 'Demo complete',
    frac: (s, p) => p.holdTicks / M5_HOLD_TICKS,
    done: (s, p) => p.holdTicks >= M5_HOLD_TICKS,
    apply: () => {},
  },
];

export function createProgress() {
  return { ...START, unlocked: {}, completed: 0, holdTicks: 0 };
}

export function isUnlocked(p, op) {
  return op in { FORWARD: 1, BACKWARD: 1, TURN_CW: 1, TURN_CCW: 1, USE: 1, TAKE: 1, DROP: 1, WAIT: 1 } || !!p.unlocked[op];
}

export function unlockHint(op) {
  return op === 'IS' ? 'unlocked by milestone 4' : 'unlocked by milestone 2';
}

export function limits(p) {
  return { budget: p.budget, lines: p.lines };
}

// Call once per tick after sim.step. Returns the milestones completed this tick.
export function evaluate(state, p) {
  if (p.completed === 4) {
    const holding = rate(state, 'stone') >= M5_STONE_PER_MIN && rate(state, 'ore') >= M5_ORE_PER_MIN;
    p.holdTicks = holding ? p.holdTicks + 1 : 0;
  }
  const finished = [];
  while (p.completed < MILESTONES.length && MILESTONES[p.completed].done(state, p)) {
    MILESTONES[p.completed].apply(p);
    finished.push(MILESTONES[p.completed]);
    p.completed++;
  }
  ensureGolems(state, p.golems);
  return finished;
}

// What the header shows: current milestone, progress 0..1, and a short detail line.
export function milestoneStatus(state, p) {
  if (p.completed >= MILESTONES.length) {
    return { title: 'Demo complete!', frac: 1, detail: '', complete: true };
  }
  const m = MILESTONES[p.completed];
  let detail = `Reward: ${m.reward}`;
  if (p.completed === 4) {
    const secs = Math.floor((p.holdTicks * 400) / 1000);
    detail = `Holding ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} / 2:00`;
  }
  return {
    title: `${p.completed + 1}/${MILESTONES.length} · ${m.title}`,
    frac: Math.min(1, Math.max(0, m.frac(state, p))),
    detail,
    complete: false,
  };
}

// ---- save / load ----

const SAVE_KEY = 'golemgolem.mines.v1';

export function saveGame(state, p) {
  try {
    const data = {
      v: 1,
      progress: p,
      stockpile: state.stockpile,
      tick: state.tick,
      map: serializeGrid(state.grid),
      golems: state.golems.map((g) => ({ placed: g.placed, program: g.program })),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// Returns { state, progress } or null when there's no usable save.
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.v !== 1) return null;
    const grid = deserializeGrid(data.map);
    if (!grid) return null;
    const progress = { ...createProgress(), ...data.progress, holdTicks: 0 };
    progress.unlocked = { ...data.progress.unlocked };
    const state = createState({ grid });
    state.stockpile = { stone: 0, ore: 0, ...data.stockpile };
    state.tick = data.tick | 0;
    data.golems.forEach((sg, i) => {
      const g = createGolem(i + 1, sg.placed.col, sg.placed.row, sg.placed.facing);
      g.program = sg.program;
      reserveIds(g.program);
      state.golems.push(g);
    });
    ensureGolems(state, progress.golems);
    return { state, progress };
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function newGame() {
  const progress = createProgress();
  const state = createState();
  ensureGolems(state, progress.golems);
  return { state, progress };
}
