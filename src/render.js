// Canvas drawing: grid, items, golems, hit progress. Colored rectangles and letters only.

import { THRESHOLDS, DIRS } from './map.js';

export const GOLEM_COLORS = ['#4da3ff', '#ff8a5c', '#7ddc8c'];
export const ITEM_COLORS = { stone: '#d5d9e0', ore: '#f2c94c' };

const TILE_COLORS = { '#': '#1f1f27', '.': '#4b4339', S: '#6f7581', O: '#3b3852', r: '#6d5237', B: '#2d8a5b' };
const TILE_LETTERS = { S: 'S', O: 'O', r: 'r', B: 'OUT' };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let layout = null;

  function measure(grid) {
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(box.width));
    const h = Math.max(1, Math.floor(box.height));
    if (!layout || layout.w !== w || layout.h !== h || layout.dpr !== dpr) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const tile = Math.floor(Math.min(w / grid.cols, h / grid.rows));
      layout = {
        w, h, dpr, tile,
        ox: Math.floor((w - tile * grid.cols) / 2),
        oy: Math.floor((h - tile * grid.rows) / 2),
      };
    }
    return layout;
  }

  function drawVeinSpeckles(type, col, row, x, y, t) {
    ctx.fillStyle = type === 'S' ? '#9aa1ad' : '#f2c94c';
    for (let i = 0; i < 4; i++) {
      const sx = x + ((((col * 7 + row * 13 + i * 11) % 10) + 1) / 12) * (t - 5);
      const sy = y + ((((col * 5 + row * 3 + i * 17) % 10) + 1) / 12) * (t - 5);
      ctx.fillRect(sx, sy, Math.max(2, t / 9), Math.max(2, t / 9));
    }
  }

  function draw(state, view = {}) {
    const { grid } = state;
    const L = measure(grid);
    const t = L.tile;
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ctx.clearRect(0, 0, L.w, L.h);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < grid.rows; r++) {
      for (let c = 0; c < grid.cols; c++) {
        const tile = grid.tiles[r][c];
        const x = L.ox + c * t;
        const y = L.oy + r * t;
        ctx.fillStyle = TILE_COLORS[tile.type] || '#f0f';
        ctx.fillRect(x, y, t - 1, t - 1);
        if (tile.type === 'S' || tile.type === 'O') drawVeinSpeckles(tile.type, c, r, x, y, t);
        if (TILE_LETTERS[tile.type]) {
          ctx.fillStyle = tile.type === 'B' ? '#d6f5e4' : 'rgba(255,255,255,0.85)';
          ctx.font = `700 ${Math.floor(t * (tile.type === 'B' ? 0.3 : 0.42))}px system-ui, sans-serif`;
          ctx.fillText(TILE_LETTERS[tile.type], x + t / 2, y + t / 2);
        }
        const need = THRESHOLDS[tile.type];
        if (need && tile.hits > 0) {
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x + 2, y + t - 7, t - 5, 4);
          ctx.fillStyle = '#ff5d5d';
          ctx.fillRect(x + 2, y + t - 7, ((t - 5) * tile.hits) / need, 4);
        }
        if (tile.item) {
          ctx.fillStyle = ITEM_COLORS[tile.item];
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 1;
          const s = t * 0.34;
          ctx.fillRect(x + (t - s) / 2, y + (t - s) / 2, s, s);
          ctx.strokeRect(x + (t - s) / 2, y + (t - s) / 2, s, s);
        }
      }
    }

    for (const g of state.golems) drawGolem(g, L, view.selected === g);
  }

  function drawGolem(g, L, selected) {
    const t = L.tile;
    const cx = L.ox + g.col * t + t / 2;
    const cy = L.oy + g.row * t + t / 2;
    const rad = t * 0.36;
    const color = GOLEM_COLORS[(g.n - 1) % GOLEM_COLORS.length];
    // facing wedge
    const d = DIRS[g.facing];
    const px = -d.dr, py = d.dc; // perpendicular
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + d.dc * (rad + t * 0.14), cy + d.dr * (rad + t * 0.14));
    ctx.lineTo(cx + d.dc * rad * 0.6 + px * rad * 0.55, cy + d.dr * rad * 0.6 + py * rad * 0.55);
    ctx.lineTo(cx + d.dc * rad * 0.6 - px * rad * 0.55, cy + d.dr * rad * 0.6 - py * rad * 0.55);
    ctx.closePath();
    ctx.fill();
    // body
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = selected ? 2.5 : 1.5;
    ctx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.fillStyle = '#0b0b10';
    ctx.font = `800 ${Math.floor(t * 0.4)}px system-ui, sans-serif`;
    ctx.fillText(String(g.n), cx, cy + 1);
    // held item dot
    if (g.hand) {
      ctx.beginPath();
      ctx.arc(cx + rad * 0.85, cy - rad * 0.85, t * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = ITEM_COLORS[g.hand];
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
  }

  // Client coordinates -> { col, row } or null.
  function hit(grid, clientX, clientY) {
    if (!layout) return null;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((clientX - rect.left - layout.ox) / layout.tile);
    const row = Math.floor((clientY - rect.top - layout.oy) / layout.tile);
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return null;
    return { col, row };
  }

  return { draw, hit };
}
