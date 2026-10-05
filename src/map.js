// Map parsing. Tiles are addressed as tiles[row][col]; positions are written (col,row).

export const MAP_ASCII = [
  '#######',
  '#O...O#',
  '#..r..#',
  '##r#r##',
  '#.....#',
  '#.#S#.#',
  '#.....#',
  '#S...S#',
  '#.....#',
  '#B#####',
];

// Hits needed per tile type.
export const THRESHOLDS = { S: 2, O: 4, r: 3 };

// Facing: 0=N 1=E 2=S 3=W (TURN CW increments).
export const DIRS = [
  { dc: 0, dr: -1, name: 'N' },
  { dc: 1, dr: 0, name: 'E' },
  { dc: 0, dr: 1, name: 'S' },
  { dc: -1, dr: 0, name: 'W' },
];

export function parseMap(rows = MAP_ASCII) {
  const tiles = rows.map((line) =>
    [...line].map((type) => ({ type, hits: 0, item: null })),
  );
  return { cols: rows[0].length, rows: rows.length, tiles };
}

export function tileAt(grid, col, row) {
  if (row < 0 || row >= grid.rows || col < 0 || col >= grid.cols) return null;
  return grid.tiles[row][col];
}

export function serializeGrid(grid) {
  return grid.tiles.map((row) => row.map((t) => [t.type, t.hits, t.item]));
}

// Returns a grid, or null if the saved data doesn't match the current map shape.
export function deserializeGrid(data) {
  const fresh = parseMap();
  if (!Array.isArray(data) || data.length !== fresh.rows) return null;
  for (let r = 0; r < fresh.rows; r++) {
    if (!Array.isArray(data[r]) || data[r].length !== fresh.cols) return null;
    for (let c = 0; c < fresh.cols; c++) {
      const [type, hits, item] = data[r][c];
      fresh.tiles[r][c] = { type, hits: hits | 0, item: item ?? null };
    }
  }
  return fresh;
}
