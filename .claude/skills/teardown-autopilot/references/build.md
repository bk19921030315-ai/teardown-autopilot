# Stage 3 · Geometry, stage, film

## Geometry

- Build in the model's units and scale at the root (`root.scale.setScalar(0.001)` for millimetres).
- `update(input, ops)` poses everything from the model; it never decides a pose itself.
- Every part sits on a mount. Before calling geometry done, walk the parts list and name what each one stands on:
  idlers need studs, cam carriers stand on the head, liners are held by the deck rails. We shipped idler gears
  floating 10 mm off the block and carrier posts 40 mm above the head.
- Check orientation of anything with a "face": a valve's wide face goes toward the chamber (we had them inverted).
- Extruded parts that touch other parts (gear flanks, cam lobes) get their bevel cut **inward**
  (`bevelSize: b, bevelOffset: -b`), otherwise the bevel grows the contact surface and they interpenetrate.
- Gears: set each gear's tooth phase so a tooth of one sits in a gap of the next along the line of centres, then
  turn each by `-ratio ×` its driver. Verify with `clearance.mjs`, not by eye.

### Subsystems (isolate · cut · alone)

Tag every mesh with its subsystem after building (outer groups first, then inner overrides). Give each subsystem its
own clone of every material it uses, and each material a see-through twin, so that:

- **isolate** fades the rest to a ghost (opacity 0.12),
- **alone** fades the rest out and hides it,
- **cut** clips one subsystem on its own plane.

Focus is a blend `{from, to, k}` between two states, each giving every subsystem an alpha (1 solid, 0.12 ghost,
0 hidden); the frame lerps the alphas. That is what keeps "crankshaft alone → timing gears alone" from flashing the
whole engine back on for a frame. Companions stay with their subsystem (the gas with the block and pistons, the
arrows with what they ride on).

Each subsystem has its own clipping plane that **sweeps** from in front of the machine to the section over 0.7 s
when cut and back out when released. GTAO's normal pass cannot be clipped per subsystem, so fade ambient occlusion
out while any partial cut is in (`blendIntensity`), never toggle it.

Hide ghosted meshes during the GTAO pass, or the see-through rest darkens the subsystem in focus.

## Stage

Copy the closest example's `stage.js`. Allow a per-view lens (`cam.fov`, default 26): a camera inside the machine
(the V8's valley) needs ~60°. Add `warmVariants(compile)` (see `live.md`).

## The film

`SCRIPT` is a list of operator moves at times: `{t, cam}`, `{t, sub: [name, 'isolate' | 'cut' | 'alone']}`,
`{t, track}`, `{t, rpm: [a, b, dur]}` (or the machine's own input ramp). Everything else is a function of t:
`camAt`, `focusAt`, `cutsAt`, `cutsOnAt`, the input integrated in a table at load, the cursor from waypoints.

Rules, each the fix for a defect we shipped:

1. **Camera moves** blend every parameter with smootherstep over 1.6 s, azimuth the short way round, backing off
   through wide swings. A move into or out of the machine's interior goes through a waypoint that keeps the eye in
   open space (a quadratic Bézier through it); we flew the camera through a gear leaving the V8's valley.
2. **Focus** as above; a click on the active button releases it.
3. **Cuts** sweep in and out (0.7 s).
4. **Callouts** fade in once a view settles (1.1–1.8 s), fade out over the first 0.35 s of the next view **keeping
   the previous view's side**, and swap sets at a focus blend's midpoint faded through zero.
5. **Label side per view**: where the machine reaches the panels on one side (hero, side, top views), all labels go
   to the other side. Sub-lines stay short enough to end before the panels (about 22 characters at 8.6 px).
6. **Cursor**: arrive 0.16 s before each click, leave at least 0.25 s of travel before the next one; rest over the
   machine between clicks more than 1.2 s apart. We teleported the cursor 1,240 px between two quick clicks.
7. **Opening frame** shows the whole machine at an angle that reads (the V8's front view showed only gears).
8. `timeline.json` gets `{duration, beats: [every SCRIPT time > 0]}` (continuity.cjs writes it).

### The `window.FILM` contract (for the checks)

In `makeFilm`, expose:

```js
window.FILM = {
  DURATION, SCRIPT,
  // every quantity the eye can see move, as numbers: the camera, each subsystem's alpha, each cut plane, the cursor,
  // the input and the console's main number. continuity.cjs samples it every 0.01 s.
  sample: (t) => ({...camAt(t), alpha_block: ..., cut_block: ..., cx: cur.x, cy: cur.y, input: ..., rpm: ...}),
  floors: {az: 0.3, el: 0.3, cx: 12, cy: 12, input: 1e9},   // per-quantity jump floors (optional)
};
```

Quantities that legitimately step (a click that changes the tracked cylinder's charts) are not in `sample`.
