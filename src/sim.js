// Deterministic tick simulation. No DOM. One instruction per golem per tick,
// golems resolved in order (golem 1 first).

import { parseMap, tileAt, DIRS, THRESHOLDS } from './map.js';

export const TICK_MS = 400;
export const RATE_WINDOW_TICKS = Math.round(60000 / TICK_MS); // 60 simulated seconds

// Where new golems appear until the player moves them: [col, row, facing].
const DEFAULT_PLACEMENTS = [[1, 8, 0], [2, 8, 0], [3, 8, 0]];

export function createGolem(n, col, row, facing = 0) {
  return {
    n, // 1-based golem number
    placed: { col, row, facing },
    col, row, facing,
    hand: null, // null | 'stone' | 'ore'
    pc: 0,
    flag: false,
    status: 'idle',
    lastLine: -1, // line that ran on the most recent tick
    program: [],
    stats: { ticks: 0, failed: 0, delivered: 0 },
  };
}

export function createState({ grid = parseMap(), golems = [] } = {}) {
  return {
    grid,
    golems,
    stockpile: { stone: 0, ore: 0 },
    deliveries: { stone: [], ore: [] }, // tick numbers inside the rolling window
    tick: 0,
  };
}

export function golemAt(state, col, row) {
  return state.golems.find((g) => g.col === col && g.row === row) || null;
}

export function ahead(g, back = false) {
  const d = DIRS[(g.facing + (back ? 2 : 0)) % 4];
  return { col: g.col + d.dc, row: g.row + d.dr };
}

// ---- placement ----

export function resetGolem(g) {
  g.col = g.placed.col; g.row = g.placed.row; g.facing = g.placed.facing;
  g.hand = null; g.pc = 0; g.flag = false; g.lastLine = -1; g.status = 'idle';
}

export function resetGolems(state) {
  for (const g of state.golems) resetGolem(g);
}

export function resetProgramState(g) {
  g.pc = 0; g.lastLine = -1; g.status = 'program edited';
}

function isFreeFloor(state, col, row, except) {
  const t = tileAt(state.grid, col, row);
  if (!t || t.type !== '.') return false;
  return !state.golems.some(
    (o) => o !== except && ((o.col === col && o.row === row) || (o.placed.col === col && o.placed.row === row)),
  );
}

export function placeGolem(state, g, col, row) {
  if (!isFreeFloor(state, col, row, g)) return false;
  g.placed.col = col; g.placed.row = row;
  resetGolem(g);
  return true;
}

export function rotateGolem(g) {
  g.placed.facing = (g.placed.facing + 1) % 4;
  resetGolem(g);
}

// Make sure the state has `count` golems, adding new ones at default spots.
export function ensureGolems(state, count) {
  while (state.golems.length < count) {
    const n = state.golems.length + 1;
    let [col, row, facing] = DEFAULT_PLACEMENTS[n - 1] || DEFAULT_PLACEMENTS[0];
    if (!isFreeFloor(state, col, row)) {
      outer: for (let r = state.grid.rows - 1; r >= 0; r--) {
        for (let c = 0; c < state.grid.cols; c++) {
          if (isFreeFloor(state, c, r)) { col = c; row = r; break outer; }
        }
      }
    }
    state.golems.push(createGolem(n, col, row, facing));
  }
}

// ---- execution ----

const BLOCK_NAMES = { '#': 'bedrock', S: 'stone vein', O: 'ore vein', r: 'rubble', B: 'OUT box' };

function whatBlocks(state, col, row) {
  const t = tileAt(state.grid, col, row);
  if (!t) return 'edge of map';
  const other = golemAt(state, col, row);
  if (other) return `golem ${other.n}`;
  return BLOCK_NAMES[t.type] || 'obstacle';
}

function isFloorFree(state, col, row) {
  const t = tileAt(state.grid, col, row);
  return !!t && t.type === '.' && !golemAt(state, col, row);
}

function succeed(g, msg) { g.flag = true; g.status = msg; }
function fail(g, msg) { g.flag = false; g.status = msg; g.stats.failed++; }

function doMove(state, g, back) {
  const name = back ? 'BACKWARD' : 'FORWARD';
  const { col, row } = ahead(g, back);
  if (isFloorFree(state, col, row)) {
    g.col = col; g.row = row;
    succeed(g, `${name} ok → (${col},${row})`);
  } else {
    fail(g, `${name} blocked: ${whatBlocks(state, col, row)}`);
  }
}

function doUse(state, g) {
  const { col, row } = ahead(g);
  const t = tileAt(state.grid, col, row);
  if (!t || !(t.type in THRESHOLDS)) {
    return fail(g, `USE failed: nothing to hit (${whatBlocks(state, col, row)})`);
  }
  const need = THRESHOLDS[t.type];
  if (t.type === 'r') {
    t.hits++;
    if (t.hits >= need) { t.type = '.'; t.hits = 0; return succeed(g, 'USE: rubble cleared'); }
    return succeed(g, `USE: hit rubble ${t.hits}/${need}`);
  }
  if (g.hand) return fail(g, 'USE failed: hand full');
  const item = t.type === 'S' ? 'stone' : 'ore';
  t.hits++;
  if (t.hits >= need) { t.hits = 0; g.hand = item; return succeed(g, `USE: got ${item}`); }
  succeed(g, `USE: hit ${item} vein ${t.hits}/${need}`);
}

function doTake(state, g) {
  const { col, row } = ahead(g);
  const t = tileAt(state.grid, col, row);
  if (g.hand) return fail(g, 'TAKE failed: hand full');
  if (!t || t.type !== '.' || !t.item) return fail(g, 'TAKE failed: nothing there');
  g.hand = t.item; t.item = null;
  succeed(g, `TAKE: picked up ${g.hand}`);
}

function doDrop(state, g) {
  const { col, row } = ahead(g);
  const t = tileAt(state.grid, col, row);
  if (!g.hand) return fail(g, 'DROP failed: hand empty');
  if (t && t.type === 'B') {
    const item = g.hand;
    g.hand = null;
    state.stockpile[item]++;
    state.deliveries[item].push(state.tick);
    g.stats.delivered++;
    return succeed(g, `DROP: delivered ${item}`);
  }
  if (!t || t.type !== '.') return fail(g, `DROP failed: ${whatBlocks(state, col, row)}`);
  const other = golemAt(state, col, row);
  if (other) return fail(g, `DROP failed: golem ${other.n} there`);
  if (t.item) return fail(g, 'DROP failed: tile not empty');
  t.item = g.hand;
  succeed(g, `DROP: put ${g.hand} on floor`);
  g.hand = null;
}

function doIs(state, g, arg) {
  const { col, row } = ahead(g);
  const t = tileAt(state.grid, col, row);
  let yes = false;
  switch (arg) {
    case 'STONE': yes = !!t && t.type === 'S'; break;
    case 'ORE': yes = !!t && t.type === 'O'; break;
    case 'RUBBLE': yes = !!t && t.type === 'r'; break;
    case 'FLOOR': yes = isFloorFree(state, col, row); break;
    case 'GOLEM': yes = !!golemAt(state, col, row); break;
    case 'BOX': yes = !!t && t.type === 'B'; break;
    case 'ITEM': yes = !!t && t.type === '.' && !!t.item; break;
    case 'HOLDING': yes = !!g.hand; break;
    default: break;
  }
  g.flag = yes;
  g.status = `IS? ${arg}: ${yes ? 'YES' : 'NO'}`;
}

// Run one instruction for one golem.
function execute(state, g) {
  const prog = g.program;
  if (!prog.length) { g.status = 'no program'; return; }
  if (g.pc >= prog.length) g.pc = 0;
  const ins = prog[g.pc];
  let next = (g.pc + 1) % prog.length;
  g.lastLine = g.pc;
  g.stats.ticks++;

  switch (ins.op) {
    case 'FORWARD': doMove(state, g, false); break;
    case 'BACKWARD': doMove(state, g, true); break;
    case 'TURN_CW':
      g.facing = (g.facing + 1) % 4;
      g.status = `TURN CW: facing ${DIRS[g.facing].name}`;
      break;
    case 'TURN_CCW':
      g.facing = (g.facing + 3) % 4;
      g.status = `TURN CCW: facing ${DIRS[g.facing].name}`;
      break;
    case 'USE': doUse(state, g); break;
    case 'TAKE': doTake(state, g); break;
    case 'DROP': doDrop(state, g); break;
    case 'WAIT': g.status = 'WAIT'; break;
    case 'IS': doIs(state, g, ins.arg); break;
    case 'JMP':
    case 'IF_YES':
    case 'IF_NO': {
      const to = prog.findIndex((i) => i.id === ins.target);
      const taken = ins.op === 'JMP' || (ins.op === 'IF_YES') === g.flag;
      if (to < 0) { g.status = `${ins.op.replace('_', ' ')}: no target`; break; }
      if (taken) next = to;
      g.status = ins.op === 'JMP'
        ? `JMP → ${to + 1}`
        : `${ins.op.replace('_', ' ')}: ${taken ? 'jumped' : 'not taken'} (→ ${to + 1})`;
      break;
    }
    default: g.status = `unknown ${ins.op}`;
  }
  g.pc = next;
}

export function step(state) {
  state.tick++;
  for (const g of state.golems) execute(state, g);
  const cutoff = state.tick - RATE_WINDOW_TICKS;
  for (const log of Object.values(state.deliveries)) {
    while (log.length && log[0] <= cutoff) log.shift();
  }
}

// Items delivered per simulated minute over the last 60 simulated seconds.
export function rate(state, item) {
  return state.deliveries[item].length;
}
