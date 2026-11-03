# Worked examples

Finished code from the runs this skill was built on. Copy patterns from here rather than re-deriving them; adapt
names and numbers to the new machine. Both started from the `teardown` skill's own examples (MIT).

- `v8/` — the V8 four-stroke after the full pipeline: `kin.js` (parameter block with collision dimensions, a real
  24:40:48 timing train, a cam profile generated from the lift curve for roller tappets), `engine.js` (subsystem
  tags, per-subsystem materials and ghosts, blended focus, per-subsystem sweeping cut planes, `forceGhost` for the
  warm-up), `stage.js` (per-view lens, AO fade during partial cuts, `warmVariants`), `console.js` (no typed numbers,
  to-scale schematic, isolate / cut / alone rows), `film.js` (SCRIPT, focus and cut blends, label sides, valley
  waypoint, cursor spacing, `window.FILM.sample`), `live.js` (tour, wall-clock idle, quality steps, `?perf`,
  `?tier`, hide chip), `v8-test/` (a fixed-camera test bench), `tools/clearance.mjs` (the 720° clearance check).
  Build: `node ~/.claude/skills/teardown/sims/build.mjs ./v8/v8-live ./v8/v8-film`.
- `cessna-model/` — the numbers stage done right: `model.js` (source tags, one input, the link-by-link chain, a
  geometric universal joint checked against its closed form, `readout`) and `check.mjs` (the hand check, runway and
  plate clearance over the stroke).
