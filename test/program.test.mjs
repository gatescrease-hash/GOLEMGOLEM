import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/program.js';

const ids = (prog) => prog.map((i) => i.id);

test('weights: starter routine weighs 7 and fits budget 10 / 8 lines', () => {
  const prog = P.fromText('USE\nUSE\nTURN CW\nTURN CW\nDROP\nTURN CW\nTURN CW');
  const c = P.check(prog, { budget: 10, lines: 8 });
  assert.equal(c.weight, 7);
  assert.equal(c.lines, 7);
  assert.ok(c.ok);
});

test('JMP/IF cost 2, IS? costs 4; over-budget and over-line are flagged separately', () => {
  const prog = P.fromText('IS? STONE\nIF YES 1\nJMP 1');
  assert.equal(P.weightOf(prog), 8);
  assert.ok(P.check(prog, { budget: 7, lines: 8 }).overWeight);
  assert.ok(P.check(P.fromText('WAIT\nWAIT\nWAIT'), { budget: 10, lines: 2 }).overLines);
});

test('inserting and moving lines keeps jumps on the same instruction', () => {
  let prog = P.fromText('USE\nFORWARD\nIF YES 1');
  const target = prog[0].id;
  prog = P.insertAfter(prog, -1, P.makeInstr('WAIT')); // before everything
  assert.equal(P.lineOf(prog, prog[3].target), 1);
  assert.equal(prog[3].target, target);
  prog = P.move(prog, 1, 1); // move USE down
  assert.equal(prog[P.lineOf(prog, target)].op, 'USE');
  assert.equal(P.describe(prog, prog[3]), 'IF YES → 3');
});

test('deleting a jump target retargets to the line that followed it', () => {
  let prog = P.fromText('USE\nFORWARD\nTURN CW\nJMP 2');
  const [, , c] = prog;
  prog = P.removeAt(prog, 1);
  assert.equal(prog[2].target, c.id);
  // deleting the last line when targeted wraps to the first
  prog = P.fromText('USE\nJMP 3\nWAIT');
  const first = prog[0].id;
  prog = P.removeAt(prog, 2);
  assert.equal(prog[1].target, first);
});

test('removing the only line yields an empty program', () => {
  assert.deepEqual(P.removeAt(P.fromText('USE'), 0), []);
});

test('fromText rejects junk and bad targets', () => {
  assert.throws(() => P.fromText('DANCE'));
  assert.throws(() => P.fromText('JMP 5'));
  assert.throws(() => P.fromText('IS? CAT'));
});

test('toText round-trips', () => {
  const text = 'USE\nIF NO 4\nIS? ORE\nJMP 1';
  assert.equal(P.toText(P.fromText(text)), text);
});

test('ids stay unique after reserveIds on loaded programs', () => {
  P.reserveIds([{ id: 9999, op: 'USE' }]);
  assert.ok(P.makeInstr('USE').id > 9999);
});
