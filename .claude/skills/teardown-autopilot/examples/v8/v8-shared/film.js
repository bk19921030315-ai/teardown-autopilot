// V8 · Four-Stroke, the explorer film: the engine (engine.js) on the pale studio (stage.js) under the console
// (console.js). The crank runs at engine speed × playback; an operator walks the console: isolates the valvetrain,
// looks down the inside of the valley, tracks cylinder 5, opens the throttle, cuts the block and the heads open at
// cylinder 5 (the moving parts stay whole inside), shows the crankshaft alone and then the timing gears alone, and
// ends on the top view. A pure function of t: every state below
// (camera, focus, cuts, crank angle) is a function of the film time, and everything on screen a function of that state.
import {runSim} from 'teardown-kit/runtime.js';
import {CAMS, createConsole} from './console.js';
import {bankXY, CAM_RATIO, camAngle, CYL, cylPoint, E, GEAR_M, GEARS, IDLER_D, ORDER, piston, pinXY, pistonFrac, psi, RPM, stemTip, STROKE, VALVE, liftEx, liftIn, chargeOf} from './kin.js';
import {createV8Stage} from './stage.js';

// the operator: views, the subsystem buttons ([name, 'isolate' | 'cut' | 'alone'], each a toggle), the firing order,
// the engine speed slider
export const SCRIPT = [
  {t: 0, cam: 'open'},
  {t: 3.4, sub: ['valvetrain', 'isolate']},
  {t: 6.3, sub: ['valvetrain', 'isolate']},
  {t: 6.8, cam: 'valley'},
  {t: 9.8, track: 5},
  {t: 11.8, cam: 'side'},
  {t: 13.8, rpm: [RPM.idle, 2400, 1.4]},
  {t: 16.0, sub: ['block', 'cut']},
  {t: 16.5, sub: ['heads', 'cut']},
  {t: 17.3, cam: 'hero'},
  {t: 19.8, sub: ['crank', 'alone']},
  {t: 22.4, sub: ['timing', 'alone']},
  {t: 23.0, cam: 'front'},
  {t: 25.4, sub: ['timing', 'alone']},
  {t: 25.8, sub: ['block', 'cut']},
  {t: 26.2, sub: ['heads', 'cut']},
  {t: 27.0, cam: 'top'},
];
export const DURATION = 29.5;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'v8d', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const mm = (v) => v * 0.001;
const mod = (a, m) => ((a % m) + m) % m;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
export const PLAY = 20; // the film runs at 1/20 speed

// ------------------------------------------------------------ engine speed and the crank angle
const RPM_EV = SCRIPT.find((e) => e.rpm);
export const rpmAt = (t) => RPM_EV.rpm[0] + (RPM_EV.rpm[1] - RPM_EV.rpm[0]) * ss(RPM_EV.t, RPM_EV.t + RPM_EV.rpm[2], t);
const DT = 1 / 240;
const TH = [];
{
  let th = 12;
  for (let t = 0; t <= DURATION + 1; t += DT) {
    TH.push(th);
    th += ((rpmAt(t + DT / 2) / 60) * 360 * DT) / PLAY;
  }
}
export const thetaAt = (t) => {
  const u = Math.max(0, Math.min(TH.length - 2, t / DT));
  const i = Math.floor(u);
  return TH[i] + (TH[i + 1] - TH[i]) * (u - i);
};
export const trackAt = (t) => SCRIPT.filter((e) => e.track && e.t <= t).pop()?.track ?? 1;

// ------------------------------------------------------------ subsystem focus and cuts, from the script
export const FOCUS_T = 0.8; // a focus change blends over this long
export const CUT_T = 0.7; // a cut plane sweeps in (or back out) over this long
export const Z_FRONT = 0.4; // where a sweeping plane starts: ahead of the whole engine, metres
/** the focus at t: {from, to, k}. A click on the active button releases it (to: null); a click on another isolate or
 *  alone switches to it; either way the engine blends from the previous state to the new one by k. */
export const focusAt = (t) => {
  let to = null;
  let from = null;
  let t0 = -1e9;
  for (const e of SCRIPT) {
    if (!e.sub || e.t > t || e.sub[1] === 'cut') continue;
    const [sub, mode] = e.sub;
    from = to;
    to = to && to.sub === sub && to.mode === mode ? null : {sub, mode};
    t0 = e.t;
  }
  if (!to && !from) return null;
  const k = ss(t0, t0 + FOCUS_T, t);
  return k >= 1 && !to ? null : {from, to, k};
};
/** the subsystems whose CUT button is on at t (for the console) */
export const cutsOnAt = (t) => {
  const out = new Set();
  for (const e of SCRIPT) if (e.sub && e.sub[1] === 'cut' && e.t <= t) (out.has(e.sub[0]) ? out.delete(e.sub[0]) : out.add(e.sub[0]));
  return out;
};
/** the cut planes at t: subsystem → {k, z}; each sweeps from Z_FRONT to the tracked cylinder when its button goes on,
 *  and back out when it goes off */
export const cutsAt = (t) => {
  const last = {};
  for (const e of SCRIPT) if (e.sub && e.sub[1] === 'cut' && e.t <= t) last[e.sub[0]] = {on: !last[e.sub[0]]?.on, t: e.t};
  const zc = mm(CYL[trackAt(t) - 1].z);
  const out = new Map();
  for (const [sub, {on, t: t0}] of Object.entries(last)) {
    const u = ss(t0, t0 + CUT_T, t);
    const k = on ? u : 1 - u;
    if (k > 0.0005) out.set(sub, {k, z: Z_FRONT + (zc - Z_FRONT) * k});
  }
  return out;
};

// ------------------------------------------------------------ views, each a function of u (seconds since it came on)
export const VIEW_FN = {
  // the opening: a quarter turn round the whole engine, easing in and out, pushing in a little
  open: (u) => {
    const k = smoother(u / 4.1);
    return {tx: 0, ty: 0.11, tz: -0.02, az: 24 + 34 * k, el: 18 + 9 * k, d: 2.2 - 0.25 * k, sx: -50, sy: 10, fov: 26};
  },
  hero: (u) => ({tx: 0, ty: 0.11, tz: -0.02, az: 46 + 5 * u, el: 26, d: 1.95, sx: -50, sy: 10, fov: 26}),
  // (where each view has clear space for labels: LABEL_SIDE below)
  front: (u) => ({tx: 0, ty: 0.14, tz: 0, az: -6 + 5 * u, el: 10 + 2 * u, d: 2.25, sx: -40, sy: 30, fov: 26}),
  side: (u) => ({tx: 0, ty: 0.1, tz: 0, az: 100 - 5 * u, el: 12 + 1.5 * u, d: 1.95, sx: -40, sy: 10, fov: 26}),
  top: (u) => ({tx: 0, ty: 0.1, tz: 0, az: 10 + 3 * u, el: 74, d: 2.15, sx: -40, sy: 6, fov: 26}),
  // inside the valley: the eye between the two banks, above the crank, behind the front bulkhead, looking aft down
  // the V through a wide lens: both rows of cams, springs and cages, the bulkheads, the charge in the liners
  valley: (u) => ({tx: 0, ty: 0.2, tz: -0.3, az: 5 * Math.sin(u * 0.45), el: 5, d: 0.48, sx: 0, sy: 0, fov: 62}),
};
// Moves into and out of the valley climb out of the V first: the eye rises along the centre line (x = 0, above the
// idlers, between the cam gears) to a point over the front of the engine, then swings on. A quadratic Bézier through
// that point keeps the move smooth; it never passes through a part.
// where each view has room for callouts beside the engine: in the hero, opening, side and top views the engine reaches
// the left panels, so its labels all go right
export const LABEL_SIDE = {open: 'right', hero: 'right', side: 'right', front: 'both', top: 'right', valley: 'both'};
export const VALLEY_EXIT = {tx: 0, ty: 0.42, tz: -0.12, az: 0, el: 38, d: 1.35, sx: -20, sy: 0, fov: 34};
const bez = (a, b, k) => {
  const o = {};
  for (const key in b) {
    const unwrap = (v, ref) => (key === 'az' ? ref + ((((v - ref + 540) % 360) - 180)) : v);
    const A = a[key];
    const M = unwrap(VALLEY_EXIT[key], A);
    const B = unwrap(b[key], M);
    const Cc = 2 * M - (A + B) / 2; // the control point that puts the curve through VALLEY_EXIT at k = 0.5
    o[key] = (1 - k) * (1 - k) * A + 2 * k * (1 - k) * Cc + k * k * B;
  }
  return o;
};
export const moveDur = (from, to) => (from === 'valley' || to === 'valley' ? 2.4 : 1.6);
const VIEWS = SCRIPT.filter((e) => e.cam).map((e) => [e.t, e.cam]);
const blend = (a, b, k) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 0.6 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
};
// a camera move: every parameter eased, the azimuth the short way round, backing off through a wide swing
export const camAt = (t) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const view = (j) => VIEW_FN[VIEWS[j][1]](t - VIEWS[j][0]);
  const cur = view(i);
  if (i === 0) return cur;
  const via = VIEWS[i][1] === 'valley' || VIEWS[i - 1][1] === 'valley';
  const k = ss(VIEWS[i][0], VIEWS[i][0] + moveDur(VIEWS[i - 1][1], VIEWS[i][1]), t);
  return k >= 1 ? cur : via ? bez(view(i - 1), cur, k) : blend(view(i - 1), cur, k);
};
export const camName = (t) => {
  const v = VIEWS.filter(([t0]) => t0 <= t).pop()[1];
  return v === 'open' ? 'hero' : v;
};
export const firingNow = (th) => {
  let best = 1;
  let bp = 1e9;
  for (const c of ORDER) {
    const p = psi(c, th);
    if (p < bp) {
      bp = p;
      best = c;
    }
  }
  return best;
};

// ------------------------------------------------------------ the operator's pointer
const REST = [[820, 470], [700, 430], [900, 520], [760, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).map((e) => {
    if (e.rpm) return {t: e.t, spot: ui.speedKnob(e.rpm[0] / RPM.max), to: ui.speedKnob(e.rpm[1] / RPM.max), drag: e.rpm[2]};
    if (e.track) return {t: e.t, spot: ui.foSpot(ORDER.indexOf(e.track)), drag: 0};
    if (e.sub) return {t: e.t, spot: ui.spots[`${e.sub[1]}:${e.sub[0]}`], drag: 0};
    return {t: e.t, spot: ui.spots[e.cam], drag: 0};
  });
  const WP = [[0, 980, 640]];
  EV.forEach((e, i) => {
    const next = EV[i + 1];
    WP.push([e.t - 0.16, ...e.spot]);
    if (e.drag) {
      for (let k = 0; k <= 12; k++) {
        const tt = e.t + (k / 12) * e.drag;
        WP.push([tt + 0.02, ...ui.speedKnob(rpmAt(tt) / RPM.max)]);
      }
      WP.push([e.t + e.drag + 0.3, ...e.to]);
    } else {
      // hold on the button, but leave at least a quarter second to travel to the next one
      const hold = next ? Math.min(0.24, Math.max(0.06, next.t - 0.16 - 0.25 - e.t)) : 0.24;
      WP.push([e.t + hold, ...e.spot]);
    }
    // a quick second click goes straight there; otherwise the hand rests over the engine
    if (!next || next.t - e.t > 1.2) WP.push([e.t + e.drag + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const lin = t1 - t0 < 0.2;
    const k = lin ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = lin ? 0 : Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + Math.max(0.09, e.drag + 0.1)) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ callouts: what each subsystem names, anchored in kin.js
// Each returns parts in engine millimetres for the frame's crank angle th and tracked cylinder index ci. The overview
// set shows when nothing is in focus; a subsystem in focus shows its own.
const CHARGE_NAME = ['AIR & FUEL', 'COMPRESSED', 'COMBUSTION', 'EXHAUST'];
const deg = (x) => `${Math.round(mod(x, 360))}°`;
const CALLOUTS = {
  overview: (th) => [
    {name: 'Camshaft', sub: `${deg(camAngle(th))} · 1/${1 / CAM_RATIO} CRANK SPEED`, at: [...bankXY('L', 0, E.camD), -60]},
    {name: 'Flywheel', sub: 'STORES THE PULSES', at: [120, -40, -290]},
    {name: 'Timing gears', sub: `${GEARS.crank}:${GEARS.idler}:${GEARS.cam} · MODULE ${GEAR_M.toFixed(2)}`, at: [...bankXY('L', 0, IDLER_D), 268]},
  ],
  block: (th, ci) => [
    {name: 'Glass liner', sub: `BORE ${E.bore} · CYL ${CYL[ci].c}`, at: cylPoint(ci, E.bore / 2 + 3, E.deck - 40)},
    {name: 'Charge', sub: CHARGE_NAME[chargeOf(psi(CYL[ci].c, th))], at: cylPoint(ci, 0, (piston(ci, th).s + E.comp + E.deck) / 2)},
  ],
  crank: (th, ci) => {
    const p = CYL[ci].pin;
    return [
      {name: 'Crank pin', sub: `THROW ${p + 1} · ${deg(th)}`, at: [...pinXY(p, th), E.pinZ[p]]},
      {name: 'Flywheel', sub: 'STORES THE PULSES', at: [120, -40, -290]},
    ];
  },
  pistons: (th, ci) => {
    const {s, P, pin} = piston(ci, th);
    const z = CYL[ci].z;
    return [
      {name: 'Piston', sub: `CYL ${CYL[ci].c} · ${(pistonFrac(psi(CYL[ci].c, th)) * STROKE).toFixed(1)} MM DOWN`, at: cylPoint(ci, 0, s + E.comp - 15)},
      {name: 'Connecting rod', sub: `${E.rod} MM CENTRES`, at: [(P[0] + pin[0]) / 2, (P[1] + pin[1]) / 2, z]},
    ];
  },
  valvetrain: (th, ci) => {
    const ps = psi(CYL[ci].c, th);
    const B = CYL[ci].bank;
    return [
      {name: 'Intake valve', sub: `LIFT ${(liftIn(ps) * VALVE.lift).toFixed(1)} MM`, at: [...cylPoint(ci, 0, E.deck + 40).slice(0, 2), CYL[ci].z - E.valve.z]},
      {name: 'Roller tappet', sub: `EXHAUST · ${(liftEx(ps) * VALVE.lift).toFixed(1)} MM`, at: [...cylPoint(ci, 0, stemTip(liftEx(ps) * VALVE.lift) + E.tappet.fork + E.tappet.rr).slice(0, 2), CYL[ci].z + E.valve.z]},
      {name: 'Camshaft', sub: `${deg(camAngle(th))} · 1/${1 / CAM_RATIO} CRANK SPEED`, at: [...bankXY(B, 0, E.camD), CYL[ci].z + 60]},
    ];
  },
  heads: (th, ci) => [
    {name: 'Spark plug', sub: `CYL ${CYL[ci].c} · ${CHARGE_NAME[chargeOf(psi(CYL[ci].c, th))]}`, at: [...cylPoint(ci, 46, E.deck + 40).slice(0, 2), CYL[ci].z - E.valve.z]},
    {name: 'Exhaust port', sub: `VALVE ${(liftEx(psi(CYL[ci].c, th)) * VALVE.lift).toFixed(1)} MM OPEN`, at: [...cylPoint(ci, 96, E.deck - 10).slice(0, 2), CYL[ci].z + E.valve.z + 4]},
  ],
  timing: (th) => [
    {name: 'Crank gear', sub: `${GEARS.crank} TEETH · ${deg(th)}`, at: [0, -40, 268]},
    {name: 'Idler', sub: `${GEARS.idler} TEETH · ${deg((-th * GEARS.crank) / GEARS.idler)}`, at: [...bankXY('R', 0, IDLER_D), 268]},
    {name: 'Cam gear', sub: `${GEARS.cam} TEETH · ${deg(camAngle(th))}`, at: [...bankXY('L', 0, E.camD), 268]},
  ],
};

// ------------------------------------------------------------ the console's data for a frame
export function makeConsoleFrame(ui, st) {
  const P = ([x, y, z]) => st.project(mm(x), mm(y), mm(z));
  // live: the page's own state (overlays, cutaway, playback, pause); absent in the film
  return (t, {th, cam, prevCam = cam, cyl, rpm, cursor, since, prevShown = 0, focus, cutsOn, live}) => {
    const ci = cyl - 1;
    const callOn = live && !live.overlays.callouts ? 0 : 1;
    // labels fade in once a view has settled, and out over the first moments of the next view (prevShown: how far
    // they had come in on the view before), so a camera click never pops them
    const viewVis = since < 0.35 ? prevShown * (1 - since / 0.35) : ss(1.1, 1.8, since);
    // a focus change swaps the set at the blend's midpoint, faded through zero
    const dom = !focus ? null : focus.k > 0.5 ? focus.to : focus.from;
    const swap = focus && (focus.from?.sub ?? null) !== (focus.to?.sub ?? null) ? Math.abs(2 * focus.k - 1) : 1;
    const vis = viewVis * swap * callOn;
    const set = dom ? CALLOUTS[dom.sub](th, ci) : CALLOUTS.overview(th, ci);
    // two columns beside the engine, each stacked by the anchors' heights so no two labels touch
    const pts = set.map((c) => ({c, at: P(c.at)})).filter((x) => x.at && x.at[0] > 300 && x.at[0] < 1290 && x.at[1] > 90 && x.at[1] < 760);
    const callouts = [];
    const stack = (col, x, w) => {
      let y = 120;
      for (const p of col.sort((a, b) => a.at[1] - b.at[1])) {
        y = Math.max(y, Math.min(700, p.at[1] - 24));
        callouts.push({name: p.c.name, sub: p.c.sub, at: p.at, label: [x, y], w, o: vis});
        y += 44;
      }
    };
    const right = LABEL_SIDE[since < 0.35 ? prevCam : cam] === 'right';
    stack(pts.filter((p) => !right && p.at[0] < 800), 318, 150);
    stack(pts.filter((p) => right || p.at[0] >= 800), 1150, 140);
    // leaders from the panels into the engine: the rev counter to the crank nose, the charts to the tracked bore
    const isAlone = (st) => (st && st.mode === 'alone' ? 1 : 0);
    const alone = focus ? isAlone(focus.from) + (isAlone(focus.to) - isAlone(focus.from)) * focus.k : 0;
    const lead = callOn * (1 - alone);
    callouts.push({name: '', sub: '', at: P([0, 0, 312]), label: [282, 152], w: 0, o: lead});
    callouts.push({name: '', sub: '', at: P(cylPoint(ci, 0, E.deck - 40)), label: [1318 - 0.01, 501], w: 0, o: 0.9 * lead * (live && !live.overlays.charts ? 0 : 1)});
    ui.update({
      rpm,
      playText: live ? live.playText : `1 / ${PLAY} SPEED`,
      playK: live ? live.playK : 0.33,
      paused: live ? live.paused : false,
      theta: th,
      cyl,
      firing: firingNow(th),
      cam,
      cut: live ? live.cut : 'glass',
      overlays: live ? live.overlays : {callouts: 1, charge: 1, arrows: 1, refract: 1, charts: 1},
      focus: focus ? focus.to : null,
      cuts: cutsOn,
      callouts,
      cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createV8Stage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.V8 = st;
    // the film's pure functions, for the continuity checks (tools/continuity.cjs)
    // sample(t): every quantity the eye can see move, as numbers (the autopilot's continuity check samples it)
    const SUBS_ALL = ['block', 'heads', 'crank', 'pistons', 'valvetrain', 'timing'];
    const target = (st, s) => (!st || st.sub === s ? 1 : st.mode === 'alone' ? 0 : 0.12);
    const sample = (t) => {
      const f = focusAt(t);
      const cuts = cutsAt(t);
      const cur = cursorAt(t);
      const r = {...camAt(t), rpm: rpmAt(t), cx: cur.x, cy: cur.y};
      for (const s of SUBS_ALL) {
        r[`alpha_${s}`] = f ? target(f.from, s) + (target(f.to, s) - target(f.from, s)) * f.k : 1;
        r[`cut_${s}`] = cuts.get(s)?.z ?? Z_FRONT;
      }
      return r;
    };
    const floors = {az: 0.3, el: 0.3, d: 0.01, sx: 1, sy: 1, fov: 0.3, rpm: 30, cx: 12, cy: 12, ...Object.fromEntries(SUBS_ALL.map((s) => [`alpha_${s}`, 0.05]))};
    window.FILM = {SCRIPT, DURATION, camAt, focusAt, cutsAt, cutsOnAt, thetaAt, rpmAt, trackAt, cursorAt, VIEWS, sample, floors};
    return {
      resize,
      render(t) {
        const th = thetaAt(t);
        const cyl = trackAt(t);
        const c = camAt(t);
        const t0 = VIEWS.filter(([a]) => a <= t).pop()[0];
        const focus = focusAt(t);
        st.setCut('glass', mm(CYL[cyl - 1].z));
        st.setSubCuts(cutsAt(t));
        st.frame(th, {...c, az: c.az * D2R, el: c.el * D2R}, {focus});
        const vi = VIEWS.findIndex(([a]) => a === t0);
        const prevShown = vi > 0 ? ss(1.1, 1.8, t0 - VIEWS[vi - 1][0]) : 0;
        frame(t, {th, cam: camName(t), prevCam: vi > 0 ? (VIEWS[vi - 1][1] === 'open' ? 'hero' : VIEWS[vi - 1][1]) : camName(t), cyl, rpm: rpmAt(t), cursor: cursorAt(t), since: t - t0, prevShown, focus, cutsOn: cutsOnAt(t)});
        return {};
      },
    };
  };
}
void CAMS;

export const run = () => runSim(DEFAULTS, makeFilm());
