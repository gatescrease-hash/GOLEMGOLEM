import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, ensureGolems, step } from '../src/sim.js';
import * as G from '../src/progress.js';

function fresh() {
  const progress = G.createProgress();
  const state = createState();
  ensureGolems(state, progress.golems);
  return { state, progress };
}

test('starting kit: 1 golem, budget 10, 8 lines, only tier 0', () => {
  const { progress } = fresh();
  assert.deepEqual(G.limits(progress), { budget: 10, lines: 8 });
  assert.equal(progress.golems, 1);
  assert.ok(G.isUnlocked(progress, 'USE'));
  assert.ok(!G.isUnlocked(progress, 'JMP'));
  assert.ok(!G.isUnlocked(progress, 'IS'));
});

test('milestones 1-4 unlock the rewards in the spec', () => {
  const { state, progress } = fresh();
  state.stockpile.stone = 20;
  assert.equal(G.evaluate(state, progress).length, 1);
  assert.equal(state.golems.length, 2);

  state.stockpile.stone = 60;
  G.evaluate(state, progress);
  assert.ok(G.isUnlocked(progress, 'JMP') && G.isUnlocked(progress, 'IF_YES') && G.isUnlocked(progress, 'IF_NO'));
  assert.deepEqual(G.limits(progress), { budget: 16, lines: 12 });

  state.stockpile.ore = 10;
  G.evaluate(state, progress);
  assert.equal(state.golems.length, 3);
  assert.deepEqual(G.limits(progress), { budget: 20, lines: 12 });

  state.stockpile.ore = 30;
  G.evaluate(state, progress);
  assert.ok(G.isUnlocked(progress, 'IS'));
  assert.deepEqual(G.limits(progress), { budget: 28, lines: 16 });
  assert.equal(progress.completed, 4);
});

test('one evaluate can complete several milestones', () => {
  const { state, progress } = fresh();
  state.stockpile.stone = 60; state.stockpile.ore = 30;
  assert.equal(G.evaluate(state, progress).length, 4);
});

test('milestone 5 needs both rates held for 300 consecutive ticks', () => {
  const { state, progress } = fresh();
  state.stockpile.stone = 60; state.stockpile.ore = 30;
  G.evaluate(state, progress);
  const feed = () => {
    // Fake deliveries: 15 stone + 4 ore inside the rolling window.
    state.deliveries.stone = Array.from({ length: 15 }, (_, i) => state.tick - i);
    state.deliveries.ore = Array.from({ length: 4 }, (_, i) => state.tick - i);
  };
  for (let i = 0; i < 299; i++) { feed(); step(state); feed(); G.evaluate(state, progress); }
  assert.equal(progress.completed, 4);
  step(state); feed(); G.evaluate(state, progress);
  assert.equal(progress.completed, 5);
  assert.ok(G.milestoneStatus(state, progress).complete);
});

test('dropping below the target rate resets the hold timer', () => {
  const { state, progress } = fresh();
  state.stockpile.stone = 60; state.stockpile.ore = 30;
  G.evaluate(state, progress);
  state.deliveries.stone = Array(15).fill(state.tick + 1);
  state.deliveries.ore = Array(4).fill(state.tick + 1);
  step(state); G.evaluate(state, progress);
  assert.ok(progress.holdTicks > 0);
  state.deliveries.ore = [];
  step(state); G.evaluate(state, progress);
  assert.equal(progress.holdTicks, 0);
});
