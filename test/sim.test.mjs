import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMap, tileAt } from '../src/map.js';
import { createState, createGolem, step, ensureGolems, resetGolems, placeGolem } from '../src/sim.js';
import { fromText } from '../src/program.js';

const STARTER = `USE
USE
TURN CW
TURN CW
DROP
TURN CW
TURN CW`;

function setup(programs) {
  const state = createState();
  ensureGolems(state, programs.length);
  programs.forEach((p, i) => { state.golems[i].program = fromText(p); });
  return state;
}

test('map parses to 7x10 with the expected tiles', () => {
  const g = parseMap();
  assert.equal(g.cols, 7);
  assert.equal(g.rows, 10);
  assert.equal(tileAt(g, 1, 9).type, 'B');
  assert.equal(tileAt(g, 1, 7).type, 'S');
  assert.equal(tileAt(g, 1, 1).type, 'O');
  assert.equal(tileAt(g, 3, 2).type, 'r');
  assert.equal(tileAt(g, 1, 8).type, '.');
});

test('starter routine delivers exactly one stone every 7 ticks', () => {
  const s = setup([STARTER]);
  const g = s.golems[0];
  assert.deepEqual(g.placed, { col: 1, row: 8, facing: 0 });
  const deliveredAt = [];
  for (let i = 0; i < 70; i++) {
    const before = s.stockpile.stone;
    step(s);
    if (s.stockpile.stone > before) deliveredAt.push(s.tick);
  }
  assert.equal(deliveredAt.length, 10);
  for (let i = 1; i < deliveredAt.length; i++) assert.equal(deliveredAt[i] - deliveredAt[i - 1], 7);
  assert.equal(s.stockpile.stone, 10);
});

test('USE with a full hand fails and adds no hit', () => {
  const s = setup(['USE\nUSE\nUSE']);
  step(s); step(s);
  assert.equal(s.golems[0].hand, 'stone');
  step(s);
  assert.equal(s.golems[0].flag, false);
  assert.match(s.golems[0].status, /hand full/);
  assert.equal(tileAt(s.grid, 1, 7).hits, 0);
});

test('ore takes 4 hits and the counter is shared between golems', () => {
  const s = createState();
  const a = createGolem(1, 1, 2, 0); // (1,2) facing N -> ore at (1,1)
  const b = createGolem(2, 2, 1, 3); // (2,1) facing W -> same ore
  a.program = fromText('USE'); b.program = fromText('USE');
  s.golems.push(a, b);
  step(s); // a:1 b:2
  assert.equal(tileAt(s.grid, 1, 1).hits, 2);
  step(s); // a:3 b:4 -> b collects
  assert.equal(a.hand, null);
  assert.equal(b.hand, 'ore');
  assert.equal(tileAt(s.grid, 1, 1).hits, 0);
});

test('rubble clears after 3 hits, yields nothing and stays cleared across reset', () => {
  const s = createState();
  const g = createGolem(1, 3, 2 - 0, 2); // (3,2) is rubble; stand at (2,2) facing E instead
  g.col = g.placed.col = 2; g.row = g.placed.row = 2; g.facing = g.placed.facing = 1;
  g.program = fromText('USE');
  s.golems.push(g);
  assert.equal(tileAt(s.grid, 3, 2).type, 'r');
  step(s); step(s);
  assert.equal(tileAt(s.grid, 3, 2).type, 'r');
  step(s);
  assert.equal(tileAt(s.grid, 3, 2).type, '.');
  assert.equal(g.hand, null);
  resetGolems(s);
  assert.equal(tileAt(s.grid, 3, 2).type, '.');
});

test('moves are blocked by walls and golems; resolved in golem order', () => {
  const s = createState();
  const a = createGolem(1, 2, 8, 3); // facing W toward (1,8)
  const b = createGolem(2, 1, 8, 1); // facing E toward (2,8): they want to swap
  a.program = fromText('FORWARD'); b.program = fromText('FORWARD');
  s.golems.push(a, b);
  step(s);
  assert.equal(a.flag, false); assert.match(a.status, /blocked: golem 2/);
  assert.equal(b.flag, false); assert.match(b.status, /blocked: golem 1/);
  assert.equal(a.stats.failed, 1);
});

test('items can be dropped on floor and taken, but not onto an occupied tile', () => {
  const s = createState();
  const a = createGolem(1, 2, 7, 2); // facing S -> (2,8)
  s.golems.push(a);
  a.hand = 'ore';
  a.program = fromText('DROP\nDROP\nTAKE\nTAKE');
  step(s);
  assert.equal(tileAt(s.grid, 2, 8).item, 'ore');
  assert.equal(a.hand, null);
  step(s); assert.match(a.status, /hand empty/);
  step(s); assert.equal(a.hand, 'ore');
  step(s); assert.match(a.status, /hand full/);
  a.program = fromText('DROP'); a.pc = 0;
  step(s);
  tileAt(s.grid, 2, 8).item = null;
  a.hand = 'stone';
  tileAt(s.grid, 2, 8).item = 'ore';
  a.pc = 0; step(s);
  assert.match(a.status, /tile not empty/);
});

test('IF / IS? let a golem walk until blocked then turn', () => {
  const s = createState();
  const g = createGolem(1, 1, 6, 1); // (1,6) facing E along open row 6
  g.program = fromText(`FORWARD
IF YES 1
TURN CW
TURN CW`);
  s.golems.push(g);
  for (let i = 0; i < 12; i++) step(s);
  assert.equal(g.col, 5);
  assert.equal(g.facing, 3);
});

test('IS? tests the tile ahead and the hand', () => {
  const s = createState();
  const g = createGolem(1, 1, 8, 0);
  s.golems.push(g);
  const run = (text) => { g.program = fromText(text); g.pc = 0; step(s); return g.flag; };
  assert.equal(run('IS? STONE'), true);
  assert.equal(run('IS? FLOOR'), false);
  assert.equal(run('IS? HOLDING'), false);
  g.facing = 2;
  assert.equal(run('IS? BOX'), true);
  g.facing = 1; // (2,8) is floor
  assert.equal(run('IS? FLOOR'), true);
  assert.equal(run('IS? ITEM'), false);
  g.hand = 'stone';
  assert.equal(run('IS? HOLDING'), true);
});

test('placement only onto free floor', () => {
  const s = createState();
  ensureGolems(s, 2);
  assert.equal(placeGolem(s, s.golems[1], 1, 7), false); // stone vein
  assert.equal(placeGolem(s, s.golems[1], 1, 8), false); // golem 1's tile
  assert.equal(placeGolem(s, s.golems[1], 4, 6), true);
  assert.deepEqual([s.golems[1].col, s.golems[1].row], [4, 6]);
});
