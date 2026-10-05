// DOM panels: header, golem strip, program editor, palette, controls, placement.

import { GOLEM_COLORS } from './render.js';
import * as P from './program.js';
import { isUnlocked, unlockHint, limits, milestoneStatus } from './progress.js';
import { rate, TICK_MS, placeGolem, rotateGolem, resetProgramState, golemAt } from './sim.js';

export const SPEEDS = [1, 4, 16];

const $ = (id) => document.getElementById(id);

export function mountUI(app, actions) {
  const el = {
    app: $('app'), stoneN: $('stoneN'), oreN: $('oreN'), stoneRate: $('stoneRate'), oreRate: $('oreRate'),
    msTitle: $('msTitle'), msDetail: $('msDetail'), msBar: $('msBar'),
    toast: $('toast'), tabs: $('tabs'), status: $('status'),
    meter: $('meter'), lines: $('lines'), up: $('btnUp'), down: $('btnDown'), del: $('btnDel'),
    palette: $('palette'), clock: $('clock'),
    run: $('btnRun'), step: $('btnStep'), speed: $('btnSpeed'), reset: $('btnReset'), menu: $('btnMenu'),
    modal: $('modal'), sheet: $('sheet'),
  };

  const golem = () => app.state.golems[app.sel];
  const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };

  // ---- toast ----
  let toastTimer = 0;
  function toast(msg, good = false, ms = 2200) {
    el.toast.textContent = msg;
    el.toast.className = good ? 'good' : '';
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  const lockedOut = () => {
    if (!app.running) return false;
    toast('Pause to edit');
    return true;
  };

  // ---- golem tabs ----
  let tabCount = 0;
  function buildTabs() {
    el.tabs.innerHTML = '';
    app.state.golems.forEach((g, i) => {
      const b = document.createElement('button');
      b.className = 'tab';
      b.style.setProperty('--c', GOLEM_COLORS[i % GOLEM_COLORS.length]);
      b.innerHTML = '<div class="t1"><span class="dot"></span><span class="nm"></span><span class="flag"></span></div><div class="t2"></div>';
      b.addEventListener('click', () => selectGolem(i));
      el.tabs.appendChild(b);
    });
    tabCount = app.state.golems.length;
  }

  function selectGolem(i) {
    app.sel = i; app.line = -1; app.mode = null;
    renderProgram();
  }

  // ---- program panel ----
  function renderProgram() {
    const g = golem();
    const prog = g.program;
    const lim = limits(app.progress);
    const c = P.check(prog, lim);

    if (app.mode && app.mode.type === 'target') {
      el.meter.innerHTML = `<span class="hint">Tap the line to jump to</span> <button class="cancel" id="cancelMode">Cancel</button>`;
      $('cancelMode').addEventListener('click', () => { app.mode = null; renderProgram(); });
    } else {
      const w = `<span class="${c.overWeight ? 'over' : ''}">Weight ${c.weight}/${lim.budget}</span>`;
      const l = `<span class="${c.overLines ? 'over' : ''}">Lines ${c.lines}/${lim.lines}</span>`;
      el.meter.innerHTML = `${w} · ${l}`;
    }

    el.lines.className = app.mode && app.mode.type === 'target' ? 'targeting' : '';
    el.lines.innerHTML = '';
    if (!prog.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = 'Empty program. Tap an instruction below to add it.';
      el.lines.appendChild(d);
    }
    prog.forEach((ins, i) => {
      const row = document.createElement('div');
      row.className = 'line' + (i === app.line ? ' sel' : '') + (i >= lim.lines ? ' over' : '');
      row.dataset.i = i;
      const def = P.OPS[ins.op];
      let arg = '';
      if (def.needs === 'target') {
        const to = P.lineOf(prog, ins.target);
        arg = `→ ${to >= 0 ? to + 1 : '?'}`;
      } else if (ins.op === 'IS') arg = ins.arg;
      row.innerHTML = `<span class="n">${i + 1}</span><span class="op">${def.label}</span><span class="arg">${arg}</span><span class="w">${def.weight}</span>`;
      row.addEventListener('click', () => onLineTap(i));
      el.lines.appendChild(row);
    });

    const has = app.line >= 0 && app.line < prog.length;
    el.up.disabled = !has || app.line === 0 || app.running;
    el.down.disabled = !has || app.line === prog.length - 1 || app.running;
    el.del.disabled = !has || app.running;
    paintPalette();
    lastExec = -2;
    updateLive();
    if (app.line >= 0) {
      const sel = el.lines.querySelector('.sel');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
  }

  function programChanged(g) {
    resetProgramState(g);
    actions.save();
    renderProgram();
  }

  function onLineTap(i) {
    if (lockedOut()) return;
    const g = golem();
    if (app.mode && app.mode.type === 'target') {
      const { op } = app.mode;
      app.mode = null;
      insert(P.makeInstr(op, { target: g.program[i].id }));
      return;
    }
    app.line = app.line === i ? -1 : i;
    renderProgram();
  }

  function insert(instr) {
    const g = golem();
    const at = app.line >= 0 ? app.line : g.program.length - 1;
    g.program = P.insertAfter(g.program, at, instr);
    app.line = at + 1;
    programChanged(g);
  }

  el.up.addEventListener('click', () => {
    if (lockedOut()) return;
    const g = golem();
    g.program = P.move(g.program, app.line, -1); app.line--;
    programChanged(g);
  });
  el.down.addEventListener('click', () => {
    if (lockedOut()) return;
    const g = golem();
    g.program = P.move(g.program, app.line, 1); app.line++;
    programChanged(g);
  });
  el.del.addEventListener('click', () => {
    if (lockedOut()) return;
    const g = golem();
    g.program = P.removeAt(g.program, app.line);
    app.line = Math.min(app.line, g.program.length - 1);
    programChanged(g);
  });

  // ---- palette ----
  function buildPalette() {
    el.palette.innerHTML = '';
    for (const op of P.PALETTE_ORDER) {
      const def = P.OPS[op];
      const b = document.createElement('button');
      b.dataset.op = op;
      b.innerHTML = `${def.label}<small>${def.weight}</small>`;
      b.addEventListener('click', () => onPalette(op));
      el.palette.appendChild(b);
    }
  }

  function paintPalette() {
    for (const b of el.palette.children) {
      const op = b.dataset.op;
      b.classList.toggle('locked', !isUnlocked(app.progress, op));
      b.classList.toggle('armed', !!app.mode && app.mode.type === 'target' && app.mode.op === op);
    }
  }

  function onPalette(op) {
    if (lockedOut()) return;
    const def = P.OPS[op];
    if (!isUnlocked(app.progress, op)) {
      toast(`${def.label} is locked — ${unlockHint(op)}`);
      return;
    }
    if (app.mode && app.mode.type === 'target' && app.mode.op === op) { app.mode = null; renderProgram(); return; }
    app.mode = null;
    if (def.needs === 'target') {
      if (!golem().program.length) { toast('Add a line first, then jump to it'); renderProgram(); return; }
      app.mode = { type: 'target', op };
      renderProgram();
    } else if (def.needs === 'arg') {
      openSheet(`IS? — test what?`, () => {
        const grid = document.createElement('div');
        grid.className = 'grid2';
        for (const arg of P.IS_ARGS) {
          const b = document.createElement('button');
          b.textContent = arg;
          b.addEventListener('click', () => { closeSheet(); insert(P.makeInstr('IS', { arg })); });
          grid.appendChild(b);
        }
        return grid;
      }, 'The tile ahead (or your hand for HOLDING). Sets the flag.');
    } else {
      insert(P.makeInstr(op));
    }
  }

  // ---- modal sheet ----
  function openSheet(title, build, note) {
    el.sheet.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = title;
    el.sheet.appendChild(h);
    el.sheet.appendChild(build());
    if (note) { const p = document.createElement('p'); p.textContent = note; el.sheet.appendChild(p); }
    const close = document.createElement('button');
    close.className = 'wide';
    close.textContent = 'Close';
    close.addEventListener('click', closeSheet);
    el.sheet.appendChild(close);
    el.modal.hidden = false;
  }
  function closeSheet() { el.modal.hidden = true; }
  el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeSheet(); });

  el.menu.addEventListener('click', () => {
    openSheet('Debug', () => {
      const box = document.createElement('div');
      const mk = (label, fn, cls = '') => {
        const b = document.createElement('button');
        b.className = `wide ${cls}`;
        b.textContent = label;
        b.addEventListener('click', () => { closeSheet(); fn(); });
        return b;
      };
      box.appendChild(mk('Restore original map (rubble, hit counters, floor items)', actions.restoreMap));
      box.appendChild(mk('Wipe save and start over', actions.wipe, 'danger'));
      return box;
    }, 'Restoring the map keeps your programs, golems and stockpile.');
  });

  // ---- world taps: place / rotate golems while paused ----
  function onWorldTap(cell) {
    if (!cell) return;
    if (app.running) { toast('Pause to place or rotate golems'); return; }
    const { state } = app;
    const g = golemAt(state, cell.col, cell.row);
    if (g) {
      app.sel = state.golems.indexOf(g);
      app.line = -1; app.mode = null;
      rotateGolem(g);
      actions.save();
      renderProgram();
      return;
    }
    if (placeGolem(state, golem(), cell.col, cell.row)) {
      actions.save();
    } else {
      toast('Golems can only stand on free floor');
    }
  }

  // ---- controls ----
  el.run.addEventListener('click', () => (app.running ? actions.pause() : actions.run()));
  el.step.addEventListener('click', () => actions.step());
  el.speed.addEventListener('click', () => actions.cycleSpeed());
  el.reset.addEventListener('click', () => actions.reset());

  const anyOver = () => app.state.golems.some((g) => !P.check(g.program, limits(app.progress)).ok);

  // ---- per-frame live updates ----
  let lastExec = -2;
  function updateLive() {
    const { state, progress } = app;
    text(el.stoneN, String(state.stockpile.stone));
    text(el.oreN, String(state.stockpile.ore));
    text(el.stoneRate, `${rate(state, 'stone')}/min`);
    text(el.oreRate, `${rate(state, 'ore')}/min`);

    const ms = milestoneStatus(state, progress);
    text(el.msTitle, ms.title);
    text(el.msDetail, ms.detail);
    const w = `${Math.round(ms.frac * 100)}%`;
    if (el.msBar.style.width !== w) el.msBar.style.width = w;

    if (tabCount !== state.golems.length) buildTabs();
    state.golems.forEach((g, i) => {
      const tab = el.tabs.children[i];
      tab.classList.toggle('sel', i === app.sel);
      text(tab.querySelector('.nm'), `Golem ${g.n}`);
      const flag = tab.querySelector('.flag');
      text(flag, g.flag ? 'YES' : 'NO');
      flag.className = `flag ${g.flag ? 'yes' : 'no'}`;
      const failPct = g.stats.ticks ? Math.round((100 * g.stats.failed) / g.stats.ticks) : 0;
      text(tab.querySelector('.t2'), `${g.stats.delivered} delivered · ${failPct}% failed`);
    });

    const g = golem();
    const prefix = g.lastLine >= 0 ? `L${g.lastLine + 1} ` : '';
    text(el.status, `${prefix}${g.status}`);
    el.status.className = /failed|blocked/.test(g.status) ? 'err' : '';

    const exec = g.program.length ? g.pc % g.program.length : -1;
    if (exec !== lastExec) {
      lastExec = exec;
      [...el.lines.querySelectorAll('.line')].forEach((row, i) => row.classList.toggle('exec', i === exec));
    }

    const secs = Math.floor((state.tick * TICK_MS) / 1000);
    text(el.clock, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);

    el.app.classList.toggle('running', app.running);
    text(el.run, app.running ? 'Pause' : 'Run');
    const blocked = !app.running && anyOver();
    el.run.disabled = blocked;
    el.step.disabled = app.running || blocked;
    el.reset.disabled = false;
    text(el.speed, `${SPEEDS[app.speedIdx]}×`);
  }

  buildPalette();
  buildTabs();
  renderProgram();

  return { toast, renderProgram, updateLive, onWorldTap, closeSheet };
}
