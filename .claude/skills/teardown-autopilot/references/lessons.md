# What went wrong before, and what caught it

Every rule in this skill came from one of these. When a stage feels skippable, look here first.

## Numbers and mechanisms

| defect | caught by | fix |
|---|---|---|
| Two definitions of one angle (θ = π·stroke beside travel = 0.201·stroke) | reading the model | derive θ from the travel |
| "201 mm turns exactly 180°" — it is 179.945° (201.06 mm is) | hand check | the gear is the truth, derive the travel |
| Numbers presented as a real aircraft's with no source (metric module on a 1960s US gear) | search | flag at the stop |
| Pinion turned against its rack (wrong sign) — would swing the legs up through the belly | model check of both swing paths | reverse the drive |
| A 49° universal joint treated as constant velocity (the leg lags the pinion by 12°) | geometric spider vs closed form | model the spider |
| Stowed tyre 79 mm inside the plate | swept-tyre clearance | side tube 300 → 420 mm |
| Counterweights 9.5 mm into the piston skirts at BDC | 720° clearance | counterweight radius 76 → 62 |
| Exhaust valve met the crown at 355° (−0.36 mm) | 720° clearance | compression height 30 → 28 |
| Cam lobe through the rocker arm (−3.5 mm) and the rocker never touched the valve (+6.5 mm) | clearance | roller-tappet valvetrain, lobe generated from the lift curve |
| Valve heads upside down | reading the geometry | swap the cone radii |
| Gear flanks overlapping by the extrusion bevel | gear outline check | bevel cut inward |
| "24 : 72" timing gears that drove nothing (cams set to ½ separately) | console audit | a real 24 : 40 : 48 train, module derived |

## Floating parts

| defect | fix |
|---|---|
| Cam carrier posts 40 mm above the head | start them on the head cap |
| Idler gears 10 mm off the block on nothing | a stud from the front bulkhead |

## Film and console

| defect | caught by | fix |
|---|---|---|
| Cursor teleported 1,240 px between two quick clicks | continuity 0.01 s | leave ≥ 0.25 s of travel |
| Switching one "alone" subsystem to another flashed the whole machine | reading the code / continuity of alphas | focus as a from→to blend |
| Cuts popped in one frame | continuity | each cut's plane sweeps over 0.7 s |
| Labels popped on a camera click | reading the code | fade out 0.35 s, keep the old side |
| Camera flew through a gear leaving the valley | beat still | Bézier through a waypoint in open space |
| Label covering the pulley / a cam gear | beat stills | label side per view |
| Sub-lines running into the chart panels | beat stills | ≤ ~22 characters |
| Text unreadable over a dark close view | beat still | pale ground under floating text |
| Front view hid the V8 behind its gear train (frame 0 = thumbnail) | beat still t=0 | open at az 24° |
| A schematic's valves drawn at the wrong side after a redesign | reading the console against the model | draw from the model's constants |

## Live page

| defect | caught by | fix |
|---|---|---|
| 12 shader programs compiled on first click (freezes) | warmtest (program count) | warm every variant |
| Idle timer on the page clock (≈50 s instead of 25 on slow machines) | reading the code | wall clock |
| Quality steps bundled (AO, pixel ratio, shadows all at once) | spec | one measure per step |
| Pixel-ratio step looked useless at DPR 1 | livecheck at DPR 2 | test at deviceScaleFactor 2 |
| H hid the only hint for getting the panels back | reading the page | a chip outside the panels |

## Tooling and environment

| defect | fix |
|---|---|
| Three renderers in parallel timed out loading (60 s fixed) | two at most, second starts after the first loads, retries |
| Even two renderers timed out on load whenever anything else ran; every retry failed | record.sh writes `capture-patient.mjs`, a copy of the capture tool with a 15 min load limit |
| Then every segment died on Playwright's 30 s screenshot limit (a busy 1080p frame takes longer) | the same copy sets `page.setDefaultTimeout(900000)`; the check scripts do too |
| `pkill -f name` killed its own shell (the pattern was in its command line) | `pkill -f "nam[e]"`, in a command of its own: a bracketed pattern still matches if the plain name appears anywhere else in the same command |
| The stills tool sorts and de-duplicates times (a purity test compared different instants) | purity.cjs drives the page directly |
| A long render died with the session | detached `setsid nohup`, resumable segments |
| A reference image named in the prompt never arrived | say so, use the closest layout, flag it |
| x.com blocked by the network policy | ask the user to paste the content |
