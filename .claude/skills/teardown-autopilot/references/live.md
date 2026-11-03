# Stage 5 · The live page

Start from the example's `live.js` and keep its structure; these are the requirements and the parts we had to fix.

## Behaviour

- **The tour** plays the film's `SCRIPT` with the operator's cursor walking to each button and pressing it, looped.
  Every state (view, focus, cuts, tracked element, input) comes from the film's functions at the tour's time.
- **Hand-off**: any `pointerdown` (click or drag start), `wheel`, or key without a modifier takes over. On takeover
  the tour's state becomes the visitor's, mid-blend where it was (focus `{from, to, t0}`, cuts with their sweep).
- **Quiet**: 25 s by the **wall clock** (`performance.now()`), not the page clock — the page clock steps at most
  0.1 s per frame, so on a slow machine 25 page-seconds can be a minute. Pointer movement counts as activity.
  The tour chip shows "▶ RESUME TOUR" and, in the last 10 s, a countdown. Resuming restores hidden panels.
- **Orbit** on drag, **zoom** on the wheel, **H** hides the panels (a small chip outside the panels says how to get
  them back), **P** or `?perf` shows frames per second and the current quality step, `?tier=N` pins a step.
- Camera clicks into or out of the machine's interior use the same waypoint as the film.

## Shader warm-up

`warmComposer` (kit/warm.js) compiles what the scene shows at load. Clicks then switch materials to see-through twins
(isolate, alone), add clipping planes (cut, section) — each a new program, compiled mid-frame on first click: a
freeze. `stage.warmVariants(compile)` puts the engine in each state for a moment and compiles it, never drawn:

```js
await compile();                                  // as loaded
eng.forceGhost(true); await compile(); eng.forceGhost(false);
setSubCuts(allSubsystemsCut); await compile();
eng.forceGhost(true); await compile(); eng.forceGhost(false);
setSubCuts(none); setCut('section', 0); await compile(); setCut('glass', 0);
```

Verify with `scripts/warmtest.cjs <live.html>`: it clicks every button twice and counts programs; the count after
warm-up must not change (the V8 went 12 → 24 before the fix, 24 → 24 after).

## Quality steps

Best first; each adds one measure, so a slow machine loses as little as possible:

| step | AO | MSAA | shadow map | pixel ratio cap | panels |
|---|---|---|---|---|---|
| 1 FULL | on | 8 | 4096 | 2 | every frame |
| 2 NO AMBIENT OCCLUSION | off | 8 | 4096 | 2 | every frame |
| 3 PIXEL RATIO 1.25 | off | 4 | 4096 | 1.25 | every frame |
| 4 SHADOW MAP 1024 | off | 4 | 1024 | 1.25 | every frame |
| 5 PANELS EVERY 2ND FRAME | off | 2 | 1024 | 1 | every 2nd frame (cursor every frame) |
| 6 FLOOR | off | 0 | 512 | 0.75 | every 2nd frame |

Phones and small windows start at step 4. Judge frame time on the wall clock in windows (6 frames and 0.5 s, or
2 frames and 2 s on very slow machines); a window averaging over 22 ms is slow; one slow window in the first 6 s, or
two in a row after, steps down; never step up. Skip the first frame (it carries the warm-up) and the first frame back
from a hidden tab.

The pixel-ratio step does nothing on a device-pixel-ratio-1 screen; test it at deviceScaleFactor 2.

## Verify (`scripts/livecheck.cjs <live.html>`)

Needs `window.LIVE` getters: `tour`, `hidden`, `off`, `view`, `tier`, `TIERS`, `frames`. Reports the cost of each
pinned step, the automatic step-down sequence, and the hand-off: click → takeover, quiet → tour back (~25 s),
drag → orbit, wheel → zoom, H, P, a number key → view, a key during the tour → takeover, the countdown chip.

There is no GPU in the cloud container. Say so, report the software-renderer numbers as relative costs only, and
tell the user how to test on their own machine (`?perf`, `?tier=N`).
