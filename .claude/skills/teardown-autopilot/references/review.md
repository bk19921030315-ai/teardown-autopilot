# Stage 4 · The review loop

You cannot watch the film; you can measure it and read frames. Do all five, fix, and repeat until a full pass is
clean. Keep a list of every finding with its before/after number for the report.

## 1. Clearance over the whole input range (`tools/clearance.mjs`)

From `scripts/clearance-template.mjs`. Every pair of moving parts that share space, sampled over the full range
(720° for a four-stroke, 0..1 for a stroke) at ≤ 0.5° or 0.005 steps. Typical pairs:

- reciprocating: valve face ↔ piston crown; counterweight/web ↔ piston skirt; rod big end ↔ web and the other rod
- valvetrain: lobe ↔ follower (must be **in contact**, |gap| < 0.05 mm, not just clear); follower ↔ stem; neighbours
- gears: tooth outlines of every meshing pair (point-in-polygon both ways), tips of gears that must not touch
- linkages: link ↔ link, swept part ↔ fixed structure (the tyre swept 79 mm into the plate), ↔ the ground
- parts that must touch: "never touch" between a driver and a driven part is a floating part — report it.

Negative = collision. Fix with a number in the parameter block (or redesign the part so the model drives it), mark
it CHOSEN with the reason, rerun until "all clear".

## 2. Continuity at 0.01 s (`scripts/continuity.cjs`)

Samples `window.FILM.sample(t)` over the whole film and flags any step more than 6× its neighbours and above a floor.
It catches the cursor teleporting, a focus flash, a cut popping, a camera snap. It writes the beats into
`timeline.json`. Note: a blend parameter that restarts at a click is bookkeeping; sample what the eye sees (the
alphas), not k.

## 3. A still at every beat, read full size

`capture.mjs <film> --size 1600x900 --dpr 1 --stills beats --timeline <tl> --cols 3 --out <sheet>`, then Read each
frame in `<sheet>-frames/` — the sheet alone is too small to see a label overlap. For each frame ask:

- Does any part pass through another? Does any part float off its mount?
- Does a label cover the part it names, or run into a panel? Is any text over a dark background without a ground?
- Does every number agree with the pose (the schematic, the charts, the state panel, the callouts, each other)?
  Do the arithmetic for one or two: 34.6 mm down of 89 → 61% from BDC.

Pass the build's **name** (`umbrella-film`, found in `$TEARDOWN_OUT/dist`), not the `.html` path: a path ending in
`.html` switches the capture tool to the `window.seek(t)` page contract, and a sim page (which has `window.SIM`, not
`seek`) then waits for ever without a word of output.

## 4. Every transition at 0.2 s

For each camera move, focus change, cut, ramp: `--stills every:0.2 --from A --to B --cols 5`. Then
`python3 -I scripts/framediff.py <dirs>` flags lone spikes in frame-to-frame change; read every sheet anyway.

## 5. Purity

`node scripts/purity.cjs <film.html> 17.6 3.0 25.4 10.1 17.6 ...` draws instants in a scrambled order, each twice
with others between, and compares the PNGs byte for byte. Anything not byte-identical carries state between frames.

## Rendering budget (cloud container, software renderer)

~8 s per 1600×900 still, ~16 s per 1920×1080 frame. Two renderers at once at most (a third starves page loads past
the capture tool's fixed 60 s timeout). Start the second after the first has loaded. A full beat sheet takes about
2.5 min; a 3 s scrub about 2 min. Test-bench pages (`<slug>-test`) with a fixed camera are the fastest way to look
closely at one mechanism (a lobe on its roller in profile, gear mesh close-up).
