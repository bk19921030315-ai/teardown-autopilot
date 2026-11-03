# Stage 2 · The model

The model is the single source of truth. If the console, the labels, the schematic and the 3D parts all read the
same pure functions, nothing on screen can disagree with the motion. Every defect we found in "the numbers" came
from two definitions of the same thing (an angle set to `stroke * π` next to a rack travel set to `stroke * 201`).

## The parameter block

Put every dimension in one object at the top of `model.js` (or `kin.js`), with a source tag beside each:

```js
export const SRC = {};
const src = (k, s) => (SRC[k] = s);
export const MODULE = 4; src('MODULE', 'GIVEN');            // the user's figure
export const TEETH = 32; src('TEETH', 'GIVEN');
export const PITCH_R = (MODULE * TEETH) / 2; src('PITCH_R', 'DERIVED');
export const TUBE_LEN = 420; src('TUBE_LEN', 'CHOSEN');     // 300 stowed the tyre 79 mm into the plate
export const TYRE_OD = 17.5 * 25.4; src('TYRE_OD', 'SOURCED https://...');
```

Tags: GIVEN (the user said it), SOURCED (with the URL), DERIVED (computed from others here), ESTIMATE (a typical
value — say it is one), CHOSEN (your decision; the comment says why). Dimensions the geometry needs for collision
checks (piston height, counterweight radius, web thickness, valve head, cam lobe...) belong here too, not inline in
the geometry: that is what makes "fix it with a number" possible.

## One input, pure functions

Pick the input a person would turn to make the whole machine move: crank angle, stroke 0..1, motor angle, wind.
Derive everything else from it, link by link, the way the machine transmits motion — never set two links
independently. Example chain (rack → pinion → universal joint → tube):

```js
export const rackTravel = (s) => clamp01(s) * RACK_TRAVEL;     // mm
export const pinionTurn = (s) => rackTravel(s) / PITCH_R;      // rad, no slip
export const tubeTurn = (s) => /* the spider: v = AXIS × u, angle of v about AXIS */;
```

Where the real machine has a non-obvious relation, model the mechanism, not the intent: a Cardan joint at 49° is not
constant velocity (the leg lagged the pinion by 12°); a flat tappet needs a convex lobe; gears need their tooth
phases set so teeth sit in gaps. Check sign conventions physically (the rack on top of the pinion moving forward
turns it which way?) — one wrong sign swung a landing gear up through the airframe.

`readout(input)` returns everything the console shows, in display units.

## The hand check (`tools/check.mjs`)

Print the arithmetic a reader can follow and the tests the model passes:

```
pitch diameter  d = m·z = 4 × 32 = 128.0 mm
half a turn     π·d/2 = 201.062 mm   (the request says 201 mm)
201 mm turns the pinion 179.945°     (0.055° short)
geometric spider vs closed form tan(out)=tan(in)/cos(β): largest disagreement 4e-16 rad
```

When a stated number does not survive the check (201 mm is not exactly half a turn), say so and choose which one is
the truth (the gear), deriving the other.

## Is the number real?

Search before you build. Say plainly when a number cannot be found in a real source, and when the mechanism the user
describes does not match the real machine (a 1960s US airframe with a metric gear module; a gear "shared by both
legs" when the parts catalogue lists one actuator per leg). These go in the stage-2 stop, not buried in the report.

## The stop

Show, in the request's language:

1. A table: quantity · value · source tag · source.
2. The hand check output.
3. Anything that looked wrong, with your proposal.
4. The plan: parts list, the input, the part doing the work, the camera views, the subsystems.
5. Whether the video will be recorded.

Then wait.
