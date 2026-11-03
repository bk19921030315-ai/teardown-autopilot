// The gear as pure functions of ONE input: stroke s, 0 (down & locked) .. 1 (up & locked). No three.js, no time, no
// state: every pose, every panel number and every label in the page is read from here.
//
// Frame: millimetres. y up; the nose toward +z; so +x is the aircraft's LEFT (nose +z, up +y, right-handed). The plate
// top is y = 0. The gear on the +x side is modelled; the other side is its mirror image.
//
// Where every number comes from (SRC):
//   PROMPT   given in the request (the same figures appear in the teardown skill's example; I found no Cessna source)
//   DERIVED  computed here from other numbers, never typed
//   LAYOUT   the teardown example's geometry, which its author says was traced from a plate drawing I have not seen
//   CHOSEN   my choice where the layout left it open or contradicted itself; said where it is made
//   TYRE     standard 6.00-6 tyre size printed on the example's tyre; the 337 fitment is not verified

// ------------------------------------------------------------ the numbers
export const SRC = {};
const src = (k, s) => (SRC[k] = s);

export const MODULE = 4; src('MODULE', 'PROMPT'); // mm
export const TEETH = 32; src('TEETH', 'PROMPT');
export const RACK_TRAVEL_NOMINAL = 201; src('RACK_TRAVEL_NOMINAL', 'PROMPT'); // mm, as stated (rounded)

export const PITCH_D = MODULE * TEETH; src('PITCH_D', 'DERIVED'); // 128 mm
export const PITCH_R = PITCH_D / 2; src('PITCH_R', 'DERIVED'); // 64 mm
export const CIRC_PITCH = Math.PI * MODULE; src('CIRC_PITCH', 'DERIVED'); // 12.566 mm, tooth to tooth on the rack
export const ADDENDUM = MODULE; src('ADDENDUM', 'DERIVED'); // standard full-depth tooth: 1 m up
export const DEDENDUM = 1.25 * MODULE; src('DEDENDUM', 'DERIVED'); // 1.25 m down
// the rack travel that turns the pinion exactly half a turn: half the pitch circumference
export const RACK_TRAVEL = Math.PI * PITCH_R; src('RACK_TRAVEL', 'DERIVED'); // 201.06 mm

// layout (mm)
export const SHAFT_Y = -136.5; src('SHAFT_Y', 'LAYOUT'); // output shaft axis below the plate top
export const JOINT_X = 220; src('JOINT_X', 'LAYOUT'); // universal joint centre, outboard of the centreline
export const TUBE_LEN = 420; src('TUBE_LEN', 'CHOSEN'); // joint centre to the leg root along the side tube. The layout's 300 mm
// stows the real-size 6.00-6 tyre 79 mm into the plate; 420 is the one change that clears plate (40 mm) and rails (108)
export const LEG_LEN = 500; src('LEG_LEN', 'LAYOUT'); // leg root to axle, straight line
export const AXIS_RAW = [1, -0.6, -1]; src('AXIS_RAW', 'LAYOUT'); // side tube direction: outboard, down, aft
export const LEG0_RAW = [1, -1, 0.8]; src('LEG0_RAW', 'LAYOUT'); // leg direction when down & locked
export const ROD_END_Z0 = 120; src('ROD_END_Z0', 'CHOSEN'); // rod-end connector, gear down (moved: see rackTravel)
export const ACT_Y = 60; src('ACT_Y', 'LAYOUT'); // actuator axis above the plate top
export const ACT_ROD_FROM = -160; src('ACT_ROD_FROM', 'LAYOUT'); // where the piston rod leaves the cylinder

// tyre 6.00-6: 6.00 in section width; 17.5 in outside diameter (tyre tables for the size)
export const TYRE = {od: 17.5 * 25.4, w: 6.0 * 25.4}; src('TYRE', 'TYRE');
export const WHEEL_R = TYRE.od / 2; src('WHEEL_R', 'DERIVED'); // 222.25 mm
export const WHEEL_W = TYRE.w; src('WHEEL_W', 'DERIVED'); // 152.4 mm

// ------------------------------------------------------------ small vector kit (arrays [x, y, z])
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.sqrt(dot(a, a));
const unit = (a) => scale(a, 1 / len(a));
/** Rodrigues: v turned by angle a (radians, right hand) about the unit axis k */
export const rotate = (v, k, a) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
};
const wrapPi = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
export const V = {dot, cross, scale, add, sub, len, unit};

// ------------------------------------------------------------ fixed geometry, derived from the layout
export const X_AXIS = [1, 0, 0];
export const AXIS = unit(AXIS_RAW); // the side tube's spin axis
export const LEG0 = unit(LEG0_RAW);
export const J = [JOINT_X, SHAFT_Y, 0];
export const E0 = add(J, scale(AXIS, TUBE_LEN)); // leg root, gear down
export const TIP0 = add(E0, scale(LEG0, LEG_LEN)); // axle centre, gear down
/** the universal joint's working angle: between the shaft (x) and the side tube */
export const JOINT_ANGLE = Math.acos(dot(X_AXIS, AXIS)); // rad, 49.4°
/** plate-top height above the runway with the gear down: the tyre touches the ground */
export const GROUND = -(TIP0[1] - WHEEL_R);
// the spider's first arm at rest: in the plane of the two shafts (perpendicular to x, toward the tube)
const U0 = unit([0, AXIS[1], AXIS[2]]);
const V0 = unit(cross(AXIS, U0));

// ------------------------------------------------------------ the chain, link by link, all functions of s
const clamp01 = (s) => Math.min(1, Math.max(0, s));
/** 1. rack travel, mm FORWARD (+z). CHOSEN: the actuator pushes the rack forward to raise the gear. With the rack on
 *  top of the pinion, pulling it aft instead (the example) turns the legs the other way round, up through the belly:
 *  the axle would pass 120 mm above the plate top. tools/check.mjs prints both paths. */
export const rackTravel = (s) => clamp01(s) * RACK_TRAVEL;
/** 2. pinion turn, rad, from the rack with no slip: arc length on the pitch circle = rack travel */
export const pinionTurn = (s) => rackTravel(s) / PITCH_R;
/** the shaft's angle about +x (right hand). The rack sits on TOP of the pinion and moves forward (+z); a positive
 *  turn about +x carries the top of the pitch circle toward +z at the same speed, so the teeth roll without slipping */
export const shaftAngle = (s) => pinionTurn(s);
/** teeth that have rolled past the mesh point: travel / circular pitch */
export const teethRolled = (s) => rackTravel(s) / CIRC_PITCH;
/** 3. the universal joint. Input arm u is fixed to the shaft yoke; the output arm v must be perpendicular to u (the
 *  spider is a rigid cross) and to the tube axis (its yoke turns about that axis): v = AXIS × u. Nothing else. */
export const spider = (s) => {
  const u = rotate(U0, X_AXIS, shaftAngle(s));
  const v = unit(cross(AXIS, u));
  return {u, v};
};
/** 4. the side tube's (and the leg's) turn about its own axis, rad: the angle from v0 to v about AXIS, kept continuous
 *  with the shaft angle (a Cardan joint returns to step every half turn, never further than 90° apart) */
export const tubeTurn = (s) => {
  const {v} = spider(s);
  const raw = Math.atan2(dot(cross(V0, v), AXIS), dot(V0, v));
  const sh = shaftAngle(s);
  return sh + wrapPi(raw - sh);
};
/** the closed form for the same joint, used only to check tubeTurn: tan(out) = tan(in) / cos(angle) */
export const tubeTurnClosed = (s) => {
  const a = shaftAngle(s);
  const k = Math.round(a / Math.PI);
  return k * Math.PI + Math.atan(Math.tan(a - k * Math.PI) / Math.cos(JOINT_ANGLE));
};
/** 5. where everything on the tube ends up: a point p fixed to the tube when down, at stroke s */
export const onTube = (p, s) => add(J, rotate(sub(p, J), AXIS, tubeTurn(s)));
export const legRoot = (s) => onTube(E0, s);
export const axle = (s) => onTube(TIP0, s);
/** the wheel's axle direction: along x when down, carried round with the tube */
export const axleDir = (s) => rotate(X_AXIS, AXIS, tubeTurn(s));
/** the lowest point of the tyre (mm, plate frame): the axle less the radius, shortened by how far the axle tilts */
export const tyreLowest = (s) => {
  const a = axle(s);
  const d = axleDir(s);
  return a[1] - WHEEL_R * Math.sqrt(Math.max(0, 1 - d[1] * d[1]));
};
/** the actuator: rod-end position (z) and the exposed piston rod length */
export const rodEndZ = (s) => ROD_END_Z0 + rackTravel(s);
export const rodOut = (s) => rodEndZ(s) - ACT_ROD_FROM;

/** everything the console shows, in display units */
export const readout = (s) => {
  const d = rackTravel(s);
  const pin = (pinionTurn(s) * 180) / Math.PI;
  const tube = (tubeTurn(s) * 180) / Math.PI;
  const ax = axle(s);
  return {
    s: clamp01(s),
    rack: d,
    pinion: pin,
    tube,
    lead: tube - pin, // how far the leg runs ahead of the pinion (the Cardan joint's error)
    teeth: teethRolled(s),
    axle: ax,
    axleBelowPlate: -ax[1],
    track: 2 * ax[0], // wheel centre to wheel centre
  };
};

// ------------------------------------------------------------ the hand check, as numbers (printed by check.mjs)
export const CHECK = {
  pitchD: PITCH_D, // m·z
  halfCirc: (Math.PI * PITCH_D) / 2, // π·d / 2
  turnForNominal: ((RACK_TRAVEL_NOMINAL / PITCH_R) * 180) / Math.PI, // what 201 mm gives
  nominalShortBy: RACK_TRAVEL - RACK_TRAVEL_NOMINAL,
  teethFor180: RACK_TRAVEL / CIRC_PITCH, // must be z/2
  jointAngle: (JOINT_ANGLE * 180) / Math.PI,
};
