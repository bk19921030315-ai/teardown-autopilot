# The console (1600 × 900, fixed layout)

Every panel redraws from the frame's state; **no number on screen is typed in**. Constants come from the model
(bank angle from the bank vectors, displacement from bore × stroke × cylinders, gear ratios from tooth counts, chart
scales from the model's own maxima). The only literals allowed are control settings shown on their own controls
(a ±15° step button, a slider's range).

## Layout

- **Top left**: the title, a spec line computed from the model, and the main live number big (engine speed, stroke
  %, wind...). A scale bar under it with its own ticks (0, idle, max) from the model. Under that a line of live
  values (crank and cam angle). Give this block a pale ground (rgba(248,248,249,.82)): it floats over the machine
  in close views.
- **Left**: the schematic — the mechanism redrawn in 2D from the same model, to scale (state the scale in the panel),
  with the tracked element highlighted; below it the formula and the real dimensions from the model.
- **Left, below**: the subsystems — one row each: name, a live value line (below the buttons, never under them), and
  three buttons ISOLATE · CUT · ALONE that light from state.
- **Bottom left**: transport — pause, step buttons, the input's speed slider, playback slider.
- **Right**: the state of the tracked element (big readout), live charts that move with the machine (a cursor at
  the current input; e.g. valve lift over 720°, the pressure–volume loop with the current stroke traced in its
  colour), axis ticks computed from the model.
- **Bottom right**: camera buttons (the user's views), cutaway, overlays.
- **Bottom centre**: a picker for the tracked element (firing order) and the hint line, on a pale ground.
- **Callouts**: a name, a short live sub-line, a thin leader to the part, a dot at the anchor; anchors from the
  model; two columns at x ≈ 318 and x ≈ 1150 (width ≤ 150), stacked by anchor height, side chosen per view.

## Language

The console follows the request's language. For Chinese, use a font stack that has CJK glyphs after Inter
(`Inter, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif`), drop the wide
letter-spacing on Chinese text (it reads as gaps), and keep units and numbers in Latin digits.

## Checks that caught real defects

- A label's sub-line ran 20–30 px into the chart panels (text too long for the column).
- A floating line of text was unreadable over a dark close view (no ground under it).
- A label sat on the pulley it named (the left column inside the machine's silhouette in that view).
- A typed "24 : 72" described gears that drove nothing.
