// V8 kinematics for the four-stroke explorer: a 90° cross-plane crank, firing order 1-8-4-3-6-5-7-2, the piston of
// every cylinder from the exact slider-crank, valve lift over the 720° cycle, and a chamber pressure model good
// enough to draw the indicator diagram. Engine space is millimetres: crank axis on z (front = +z), y up.
export const E = {bore: 101.6, r: 44.5, rod: 145, comp: 30, deck: 226, pinZ: [168, 56, -56, -168], rodOff: 11, cr: 10.2};
// the parts the clearance check (tools/clearance.mjs) needs, mm: piston height; crank web counterweight radius, pin boss
// radius, web thickness and offset from its pin, bevel; rod big end radius and width; valve head (face radius, neck
// radius, thickness), stem length and radius, its offset across the bank; cam lobe (ellipse semi-axes, offset, width,
// bevel) and its offset along the crank from the cylinder; rocker arm (width, height, length, height above the deck)
// Collision fixes (tools/clearance.mjs found them): comp 30 → 28 (the exhaust valve met the crown at 355°, −0.36 mm);
// cwR 76 → 62 (the counterweights swept 9.5 mm into the piston skirts at BDC; 62 leaves 2.5 mm). The valvetrain is direct-acting: two
// valves inline along the crank under the cam, a roller tappet on each stem, the lobe's shape generated from the lift
// curve (camProfile) so it touches the roller at every crank angle. The example's rocker arms neither met the lobes
// (which cut 3.5 mm through them) nor the stems (6.5 mm short); no single dimension could make them drive the valves.
E.comp = 28;
Object.assign(E, {
  pistonH: 62,
  cwR: 62,
  bossR: 31,
  webT: 18,
  webDz: 34,
  bevel: 2,
  bigR: 33,
  bigW: 20,
  // valve head (face radius, neck radius, thickness), stem; across the bank (x) and along the crank (z) from the bore axis
  valve: {face: 16, neck: 6, t: 6, stem: 120, stemR: 3.5, x: 0, z: 18},
  // springs (outer and inner coil radius, wire), the retainer radius
  spring: {r1: 14, w1: 2.4, r2: 9.5, w2: 1.7, ret: 15},
  // roller tappet: roller radius and width, the fork from the stem tip to the roller axle, its cheeks
  tappet: {rr: 8, rw: 10, fork: 4, cheek: 2.5},
  // cam: the base pitch radius (cam axis to roller axle, valve shut), the lobe width and bevel, the shaft radius
  cam: {r0: 30, w: 14, bevel: 0.6, shaftR: 9},
});
/** the cam axis along the bank from the crank centre: stem tip (valve shut) + fork + roller radius + base pitch radius */
E.camD = E.deck - E.valve.t + E.valve.stem + E.tappet.fork + E.tappet.rr + E.cam.r0;
export const STROKE = 2 * E.r;
const S = Math.SQRT1_2;
// bank frames in the XY plane: b along the cylinder axis, p outward across the bank
export const BANK = {
  L: {b: [S, S], p: [S, -S], sign: 1},
  R: {b: [-S, S], p: [-S, -S], sign: -1},
};
// cylinders 1..8: odd on the left bank (+x), even on the right; 1 at the front
export const CYL = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
  const odd = c % 2 === 1;
  const pin = Math.floor((c - 1) / 2);
  return {c, bank: odd ? 'L' : 'R', pin, z: E.pinZ[pin] + (odd ? E.rodOff : -E.rodOff)};
});
export const FIRE = {1: 0, 8: 90, 4: 180, 3: 270, 6: 360, 5: 450, 7: 540, 2: 630};
export const ORDER = [1, 8, 4, 3, 6, 5, 7, 2];
// cross-plane crank: pin angles clockwise from +y, seen from the front
export const PIN_PHASE = [45, 135, -45, 225];
const mod = (a, m) => ((a % m) + m) % m;

export const bankXY = (bank, w, d) => {
  const B = BANK[bank];
  return [d * B.b[0] + w * B.p[0], d * B.b[1] + w * B.p[1]];
};
export const pinXY = (p, th) => {
  const a = ((th + PIN_PHASE[p]) * Math.PI) / 180;
  return [E.r * Math.sin(a), E.r * Math.cos(a)];
};
/** cylinder index i (0-based): the piston pin's distance along the bank axis, the crank pin, the pin point */
export const piston = (i, th) => {
  const cy = CYL[i];
  const B = BANK[cy.bank];
  const P = pinXY(cy.pin, th);
  const pb = P[0] * B.b[0] + P[1] * B.b[1];
  const pp = P[0] * B.p[0] + P[1] * B.p[1];
  const s = pb + Math.sqrt(E.rod * E.rod - pp * pp);
  return {s, P, pin: [s * B.b[0], s * B.b[1]]};
};
// the pin distance at TDC and BDC (the same for every cylinder)
export const S_TDC = E.r + E.rod;
export const S_BDC = E.rod - E.r;
/** four-stroke phase of cylinder c in degrees after its firing TDC: 0-180 power, 180-360 exhaust, 360-540 intake, 540-720 compression */
export const psi = (c, th) => mod(th - FIRE[c], 720);
export const STROKES = ['POWER', 'EXHAUST', 'INTAKE', 'COMPRESSION'];
export const strokeOf = (ps) => STROKES[Math.floor(mod(ps, 720) / 180)];

// valves: lift 0..1 as a smooth bump between opening and closing (degrees after firing TDC)
export const VALVE = {ex: [140, 380], in: [340, 580], lift: 10.5};
const bump = (ps, [a, b]) => {
  const x = (mod(ps - a, 720)) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
export const liftEx = (ps) => bump(ps, VALVE.ex);
export const liftIn = (ps) => bump(ps, VALVE.in);
/** piston position as a fraction of the stroke from TDC (0 at TDC, 1 at BDC), at phase ps */
export const pistonFrac = (ps) => {
  const a = (ps * Math.PI) / 180;
  const sp = E.r * Math.cos(a) + Math.sqrt(E.rod * E.rod - (E.r * Math.sin(a)) ** 2);
  return (S_TDC - sp) / STROKE;
};
/** cylinder volume in units of the clearance volume (1 at TDC, cr at BDC) */
export const volume = (ps) => 1 + (E.cr - 1) * pistonFrac(ps);
/** chamber pressure in bar: a polytropic compression, a fast burn just after TDC, a polytropic expansion */
export const pressure = (ps) => {
  ps = mod(ps, 720);
  const V = volume(ps);
  if (ps >= 360 && ps < 540) return 0.9;
  if (ps >= 180 && ps < 360) return 1.1 + 0.4 * Math.max(0, 1 - (ps - 180) / 40);
  if (ps >= 540) return Math.max(0.9, 0.95 * Math.pow(E.cr / V, 1.32));
  // power: the burn rises over the first 10 degrees, then the gas expands
  const comp = 0.95 * Math.pow(E.cr / V, 1.32);
  const burn = 54 * Math.pow(1 / V, 1.28);
  const k = Math.min(1, ps / 10);
  return Math.max(1.1, comp + (burn - comp) * (k * k * (3 - 2 * k)));
};
/** the charge colour key: 0 air & fuel, 1 compressed, 2 combustion, 3 exhaust */
export const chargeOf = (ps) => {
  ps = mod(ps, 720);
  if (ps < 60) return 2;
  if (ps < 360) return 3;
  if (ps < 540) return 0;
  return 1;
};

// ------------------------------------------------------------ numbers the console shows, all derived here
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
export const CYLS = CYL.length;
/** the angle between the two banks' cylinder axes */
export const BANK_ANGLE = (Math.acos(dot2(BANK.L.b, BANK.R.b)) * 180) / Math.PI; // 90
/** swept volume of all cylinders, litres */
export const DISP_L = (CYLS * (Math.PI / 4) * E.bore * E.bore * STROKE) / 1e6; // 5.77
/** crank degrees between one firing and the next */
export const FIRE_INTERVAL = 720 / ORDER.length; // 90
/** the throws' angular spacing (cross-plane: 90°) */
export const THROW_SPACING = (() => {
  const s = [...PIN_PHASE].map((a) => ((a % 360) + 360) % 360).sort((a, b) => a - b);
  return Math.min(...s.map((a, i) => (i ? a - s[i - 1] : a + 360 - s[s.length - 1])));
})();
// engine speed range of the controls (the example's slider: idle 700, scale to 8000)
export const RPM = {idle: 700, max: 8000};

// the timing train at the front: crank gear → an idler per bank → a cam gear per bank, all spur gears of one module,
// centres on each bank's axis. The cam gear has twice the crank gear's teeth, so the cams turn at exactly half speed;
// the idlers only carry the drive up the bank and reverse it twice. The module is whatever fits the train into the
// distance from the crank to the camshaft.
export const GEARS = {crank: 24, idler: 40, cam: 48};
export const GEAR_M = (2 * E.camD) / (GEARS.crank + 2 * GEARS.idler + GEARS.cam); // 4.447 mm
export const gearR = (n) => (GEAR_M * n) / 2;
export const CAM_RATIO = GEARS.crank / GEARS.cam; // 0.5
export const IDLER_D = gearR(GEARS.crank) + gearR(GEARS.idler); // idler centre along the bank
/** the camshaft's angle (degrees, the crank's sense) */
export const camAngle = (th) => th * CAM_RATIO;
/** the stem tip, along the bank from the crank centre, at lift L (mm) */
export const stemTip = (L) => E.deck - E.valve.t + E.valve.stem - L;

// The cam lobe for a roller follower on the valve's axis, directly under the cam axis. In the lobe's own frame the nose
// points along +x. Seen from the cam, the follower sits at angle γ (CCW from the nose) and its roller axle at the pitch
// radius r(γ) = r0 + lift: the crank has turned 2γ past peak lift since the nose passed (cams run at half speed). The
// lobe surface is that pitch curve offset inward by the roller radius, so the two touch at every angle by construction.
/** lift (mm) seen at lobe angle γ (rad), the same curve the valves follow */
export const lobeLift = (g) => VALVE.lift * liftIn((VALVE.in[0] + VALVE.in[1]) / 2 + (2 * g * 180) / Math.PI);
export const camProfile = (n = 360) => {
  const pitch = (g) => E.cam.r0 + lobeLift(g);
  const pts = [];
  const h = 1e-4;
  for (let i = 0; i < n; i++) {
    const g = -Math.PI + (2 * Math.PI * i) / n;
    const r = pitch(g);
    const dr = (pitch(g + h) - pitch(g - h)) / (2 * h);
    const P = [r * Math.cos(g), r * Math.sin(g)];
    const T = [dr * Math.cos(g) - r * Math.sin(g), dr * Math.sin(g) + r * Math.cos(g)];
    const tl = Math.hypot(T[0], T[1]);
    const N = [T[1] / tl, -T[0] / tl]; // outward normal of a CCW curve
    pts.push([P[0] - E.tappet.rr * N[0], P[1] - E.tappet.rr * N[1]]);
  }
  return pts;
};

// the timing gears' tooth: where the flanks start and end as fractions of a pitch (root, tip, tip, root), the bevel
export const GEAR_TOOTH = {r0: 0.2, t0: 0.33, t1: 0.62, r1: 0.75, bevel: 1.0};

/** a point in a cylinder's own frame (lx across the bank, outboard positive on both banks, since each bank's p
 *  points outboard; ly up the bore) to engine mm */
export const cylPoint = (i, lx, ly) => {
  const cy = CYL[i];
  const [x, y] = bankXY(cy.bank, lx, ly);
  return [x, y, cy.z];
};
