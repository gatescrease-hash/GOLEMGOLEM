// Instruction definitions, weights, budget checks and editing helpers.
// A program is an array of { id, op, target?, arg? }. Jump targets store the
// id of the target instruction, so reordering/inserting never breaks a jump.

export const OPS = {
  FORWARD:  { label: 'FORWARD',  weight: 1, tier: 0 },
  BACKWARD: { label: 'BACKWARD', weight: 1, tier: 0 },
  TURN_CW:  { label: 'TURN CW',  weight: 1, tier: 0 },
  TURN_CCW: { label: 'TURN CCW', weight: 1, tier: 0 },
  USE:      { label: 'USE',      weight: 1, tier: 0 },
  TAKE:     { label: 'TAKE',     weight: 1, tier: 0 },
  DROP:     { label: 'DROP',     weight: 1, tier: 0 },
  WAIT:     { label: 'WAIT',     weight: 1, tier: 0 },
  JMP:      { label: 'JMP',      weight: 2, tier: 1, needs: 'target' },
  IF_YES:   { label: 'IF YES',   weight: 2, tier: 1, needs: 'target' },
  IF_NO:    { label: 'IF NO',    weight: 2, tier: 1, needs: 'target' },
  IS:       { label: 'IS?',      weight: 4, tier: 2, needs: 'arg' },
};

export const PALETTE_ORDER = Object.keys(OPS);

export const IS_ARGS = ['STONE', 'ORE', 'RUBBLE', 'FLOOR', 'GOLEM', 'BOX', 'ITEM', 'HOLDING'];

let nextId = 1;

export function makeInstr(op, extras = {}) {
  if (!OPS[op]) throw new Error(`Unknown instruction ${op}`);
  return { id: nextId++, op, ...extras };
}

// After loading saved programs, make sure fresh ids can't collide with them.
export function reserveIds(program) {
  for (const ins of program) if (ins.id >= nextId) nextId = ins.id + 1;
}

export function lineOf(program, id) {
  return program.findIndex((i) => i.id === id);
}

export function weightOf(program) {
  return program.reduce((sum, i) => sum + OPS[i.op].weight, 0);
}

export function check(program, limits) {
  const weight = weightOf(program);
  const lines = program.length;
  const overWeight = weight > limits.budget;
  const overLines = lines > limits.lines;
  return { weight, lines, overWeight, overLines, ok: !overWeight && !overLines };
}

export function insertAfter(program, index, instr) {
  const at = Math.min(Math.max(index + 1, 0), program.length);
  return [...program.slice(0, at), instr, ...program.slice(at)];
}

// Deleting a jump target retargets its jumps to the line that followed it.
export function removeAt(program, index) {
  const removed = program[index];
  if (!removed) return program;
  const follower = program[(index + 1) % program.length];
  const rest = program.filter((_, i) => i !== index);
  if (!rest.length) return rest;
  return rest.map((i) => (i.target === removed.id ? { ...i, target: follower.id } : i));
}

export function move(program, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= program.length || to < 0 || to >= program.length) return program;
  const copy = [...program];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

export function describe(program, instr) {
  const { label } = OPS[instr.op];
  if (OPS[instr.op].needs === 'target') {
    const line = lineOf(program, instr.target);
    return `${label} → ${line >= 0 ? line + 1 : '?'}`;
  }
  if (instr.op === 'IS') return `${label} ${instr.arg}`;
  return label;
}

// ---- text form (used by tests and handy for debugging) ----

const LABEL_TO_OP = Object.fromEntries(Object.entries(OPS).map(([op, d]) => [d.label, op]));

export function toText(program) {
  return program.map((i) => describe(program, i).replace('→ ', '')).join('\n');
}

// "USE\nTURN CW\nIF YES 1\nIS? STONE" -> program. Line numbers are 1-based. ';' starts a comment.
export function fromText(text) {
  const rows = [];
  for (const raw of text.split('\n')) {
    const line = raw.split(';')[0].trim().toUpperCase().replace(/\s+/g, ' ');
    if (!line) continue;
    let m;
    if ((m = line.match(/^(JMP|IF YES|IF NO) (\d+)$/))) {
      rows.push({ op: LABEL_TO_OP[m[1]], line: Number(m[2]) });
    } else if ((m = line.match(/^IS\? (\w+)$/)) && IS_ARGS.includes(m[1])) {
      rows.push({ op: 'IS', arg: m[1] });
    } else if (LABEL_TO_OP[line] && !OPS[LABEL_TO_OP[line]].needs) {
      rows.push({ op: LABEL_TO_OP[line] });
    } else {
      throw new Error(`Can't parse "${raw.trim()}"`);
    }
  }
  const program = rows.map((r) => makeInstr(r.op, r.arg ? { arg: r.arg } : {}));
  rows.forEach((r, i) => {
    if (r.line == null) return;
    if (!program[r.line - 1]) throw new Error(`Line ${i + 1}: no line ${r.line}`);
    program[i].target = program[r.line - 1].id;
  });
  return program;
}
