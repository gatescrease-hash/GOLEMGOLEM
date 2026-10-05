# GOLEM GOLEM — Mines prototype

Throwaway browser prototype of one zone (the Mines) to test whether writing and
optimizing golem routines feels good. Vanilla JS + canvas, no build step.
See the game spec for the design; all numbers are provisional.

## Run

ES modules don't load from `file://`, so serve the folder:

```
npm start            # python3 -m http.server 8000  → http://localhost:8000
npm test             # headless sim / program / progress tests (Node 20+)
```

Best viewed in a portrait window (designed at 390×844).

## Layout

| File | Responsibility |
| --- | --- |
| `src/map.js` | ASCII map → tile grid with hit counters, (de)serialization |
| `src/sim.js` | Pure tick simulation: `step(state)`, placement, rolling rates. No DOM |
| `src/program.js` | Instruction table, weights, budget check, jump-safe editing, text form |
| `src/progress.js` | Milestones, unlocks, header status, localStorage save |
| `src/render.js` | Canvas drawing |
| `src/ui.js` | Header, golem strip, program editor, palette, controls, placement |
| `src/main.js` | Wiring and the fixed-timestep loop |

## Tuning knobs

- Map: `MAP_ASCII` and `THRESHOLDS` in `src/map.js`
- Tick length and rate window: `TICK_MS`, `RATE_WINDOW_TICKS` in `src/sim.js`
- Milestones, rewards, starting budget/lines, milestone-5 rates: `src/progress.js`
- Default spots for new golems: `DEFAULT_PLACEMENTS` in `src/sim.js`

Console helper: `golem.app` (live state) and `golem.P` (program helpers, e.g.
`golem.P.fromText("USE\nUSE")`). The ⚙ button restores the original map or wipes the save.
