---
name: teardown-autopilot
description: Turns a one-line description of a real machine or mechanism (Chinese or English — "做一个汽车雨刮器连杆的模拟器", "build a teardown of a bicycle rear derailleur", "show me how a mechanical watch escapement works as a 3D simulator") into a finished, checked, drivable 3D simulator by running the entire teardown pipeline end to end - real numbers with sources and a hand check, a model as pure functions of one input, geometry, a console, a film tour, a full review loop (clearance over the whole input range, continuity at 0.01 s, a still at every beat, 0.2 s scrubs), a live page with an auto tour, shader warm-up and quality steps, an optional 1080p60 recording and a report. It stops once, after the numbers, for the user to confirm. Use it whenever someone wants a machine simulator, 模拟器, 拆解动画, 剖面演示, 工作原理 3D 演示 or teardown and gives only a short description, says "/teardown-autopilot", "跑完整流程", "全自动", or wants the result without walking through every stage; prefer it over calling the plain `teardown` skill whenever the user expects a complete, verified result.
---

# Teardown autopilot

One sentence in, a finished simulator out. This skill drives the `teardown` skill (installed under
`~/.claude/skills/teardown`) through every stage a careful operator would, in order, checking its own work with the
scripts in `scripts/`. Each stage exists because skipping it produced a real defect before; `references/lessons.md`
lists them. Read the stage's reference file when you reach the stage, not before. `examples/` holds the finished
code from the runs this skill was built on (a V8 through every stage, a landing-gear model): copy its patterns
instead of re-deriving them — see `examples/README.md`.

The user chose these defaults; keep them unless the request says otherwise:

- **Stop once**, after the numbers and the hand check (stage 2), and wait for the user's go-ahead. Everything else
  runs without asking: record assumptions and choices as you go and put them in the report.
- **Ask about the video** at intake, every time (it costs hours here — see `references/environment.md`).
- **Language**: the console, labels and report follow the language of the request (Chinese request → Chinese UI).

## Stage 0 · Intake (one question)

From the request, pin down: the machine (as specific as it allows — a make and model beats a category), the part
doing the work (the thing the visitor should end up understanding), the language, any numbers or reference images
the user gave. Pick the closest bundled example to start from: `v8-*` for anything reciprocating or rotating with
a cycle (engines, pumps, compressors), `cessna-*` for one-degree-of-freedom linkages and gear trains that fold or
deploy, `strandbeest-*` for planar linkages solved by circle intersection.

Then ask exactly one AskUserQuestion with: record a 1080p60 video at the end (yes / no), and — only if no reference
was attached — whether they can attach one (a photo, a manual's cutaway). Do not wait on the reference; it improves
the result but its absence is not a blocker.

## Stage 1 · Setup

Run `bash <this skill>/scripts/setup.sh`. It installs `teardown` if missing, runs its `npm install`, and finds a
Chromium that works (in the cloud container `npx playwright install` is blocked; the preinstalled one is used).
It prints the `CHROMIUM=...` line to export for every capture command.

Work in `/home/user/<slug>/` with the example's layout: `<slug>-shared/` (the machine), `<slug>-live/main.js`,
`<slug>-film/main.js` + `timeline.json`, `<slug>-test/main.js` (a test bench), `tools/`. Import the kit as
`teardown-kit/...`; build with `node ~/.claude/skills/teardown/sims/build.mjs ./<slug>/<slug>-live ...`.

## Stage 2 · Numbers and the model — then stop

Read `references/model.md`. In short:

1. Find the real numbers (WebSearch; the user's numbers first). Tag every constant with where it came from:
   GIVEN (the user), SOURCED (a URL), DERIVED (computed here), ESTIMATE (typical value, say so), CHOSEN (your
   decision, with the reason). Never present a number as real that you did not find.
2. Write the model as pure functions of **one input** in a file with no three.js (`model.js` / `kin.js`). Every
   pose, readout, label and chart will read from it; nothing is ever typed into the UI.
3. Write `tools/check.mjs` that prints the hand check (the arithmetic a reader can follow) and tests the model
   against itself (a geometric construction against its closed form, end states, ranges).
4. Write `tools/clearance.mjs` from `scripts/clearance-template.mjs`: every pair of moving parts that share space,
   over the whole input range. Negative clearance is a collision; fix it with a number in the parameter block and
   record the change as CHOSEN.

**Stop here.** Show the user: the numbers table with sources, the hand check, what looked wrong in the request (if
anything — say it plainly), the plan (parts, input, the part doing the work, views), and the video choice. Wait for
their go-ahead or corrections. This is the only stop.

## Stage 3 · Build

Read `references/build.md` (geometry, stage, console, film) and `references/console-spec.md`.

- Geometry: every dimension from the parameter block, every pose from the model. Parts that move together are
  grouped; every part sits on a mount (no floating parts); subsystems are tagged for isolate / cut / alone.
- Console: the spec in `references/console-spec.md` — title and the main live number top left, live charts, a 2D
  schematic redrawn from the model, isolate / cut / alone per subsystem, camera buttons, callouts with leaders, no
  number typed in.
- Film: a `SCRIPT` of operator moves, `render(t)` pure. The transition rules in `references/build.md` (blended
  focus, sweeping cuts, label sides per view, fades, cursor spacing, camera paths that never pass through parts)
  are each the fix for a defect we shipped once. Expose `window.FILM` (see the contract there) so the checks can
  sample it.

## Stage 4 · Review loop

Read `references/review.md`. Run, read, fix, rerun, until a full pass finds nothing:

1. `node <slug>/tools/clearance.mjs` → all clear.
2. `node <this skill>/scripts/continuity.cjs <film.html> <timeline.json>` → no jumps (it also writes the beats).
3. Every beat: `capture.mjs <film> --stills beats --timeline ...` and **read every frame full size**: a part through
   another, a part off its mount, a label over what it names, a number that disagrees with the pose, text over a
   dark background, text running into a panel.
4. Every transition at 0.2 s: `capture.mjs ... --stills every:0.2 --from A --to B`, then
   `python3 -I <this skill>/scripts/framediff.py <frames dirs>` and read the sheets.
5. `node <this skill>/scripts/purity.cjs <film.html> 3.1 9.7 ...` → every redraw byte-identical.

Fix collisions with a number in the parameter block, never with the camera. Run at most two renderers at once.

## Stage 5 · The live page

Read `references/live.md`. The page plays the tour with its cursor, hands over on any click / drag / scroll / key,
takes back after 25 s of quiet by the wall clock, orbits, zooms, hides the panels on H, shows the frame rate on P or
`?perf`, pins a quality step with `?tier=N`, warms every shader variant before the first frame, and steps down in
quality one measure at a time. Verify with `scripts/warmtest.cjs` (no shader compiled after warm-up) and
`scripts/livecheck.cjs` (hand-off, idle return, orbit, zoom, keys, step costs, automatic step-down).

## Stage 6 · Recording (only if the user said yes)

`bash <this skill>/scripts/record.sh <film-name> <duration>` started detached (`setsid nohup ... &`): resumable 2 s
segments, two workers, retries, joined without re-encoding, H.264 yuv420p +faststart, 1920×1080 at 60 fps. Watch it
with a background `until grep -q "REC DONE" ...` loop. Then the beat sheet from the encoded file:
`node ~/.claude/skills/teardown/sheet.mjs --video <mp4> --timeline <timeline.json>` — and read it.

## Stage 7 · Report

Use `references/report-template.md`, in the request's language. Send the page, the beat sheet and the key stills
with SendUserFile. Say what was checked, what was found and fixed (with before/after numbers), every ESTIMATE and
CHOSEN, and what could not be tested here (no GPU in the cloud container).

## When something blocks

- A site is blocked by the network policy: say which host, read `read_documentation` (environment.network), carry on
  with what can be done, ask the user to paste the content.
- The request contradicts itself or the real machine (a metric gear on a 1960s US airframe, a valley on a single
  cylinder): say so in the stage-2 stop, propose the fix, and let the user choose.
- A collision no single number can fix (the mechanism itself does not work): redesign that part so it is driven by
  the model (as the roller-tappet valvetrain was), mark it CHOSEN, and explain it at the stop or in the report.
