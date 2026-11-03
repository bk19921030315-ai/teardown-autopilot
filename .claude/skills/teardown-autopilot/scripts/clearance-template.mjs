// Clearance between moving parts over the machine's whole input range, from the model alone (the same functions and
// parameter block the page poses the machine with). Copy to <slug>/tools/clearance.mjs and fill in the pairs.
// Negative = the parts pass through each other. Pairs that must TOUCH (a cam lobe on its follower, teeth in mesh,
// a part on its mount) are reported as contact: |gap| must stay under 0.05 mm.
//   node <slug>/tools/clearance.mjs        exit code 1 if anything fails
import * as M from '../<slug>-shared/model.js'; // ← the machine's model

// ------------------------------------------------------------ helpers (2D, millimetres)
export const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
export const segDist = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};
export const inPoly = (pt, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
/** distance from a point to a closed polygon, negative inside */
export const signedDist = (pt, poly) => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(pt, poly[i], poly[(i + 1) % poly.length]));
  return inPoly(pt, poly) ? -d : d;
};
/** the input range, sampled: e.g. sweep(0, 720, 0.25) for a four-stroke's crank angle, sweep(0, 1, 0.002) for a stroke */
export const sweep = (a, b, step) => Array.from({length: Math.floor((b - a) / step) + 1}, (_, i) => a + i * step);

// ------------------------------------------------------------ the report
const out = [];
const clear = (name, v, at, note = '') => out.push({name, v, at, note});
const contact = (name, maxGap, at) => out.push({name, v: maxGap, at, contact: true});

// ------------------------------------------------------------ the pairs (examples: replace with the machine's)
// 1. a swept part vs a fixed outline — e.g. a tyre's tread circle vs a plate's plan form, over the stroke
// {
//   let worst = {v: Infinity};
//   for (const s of sweep(0, 1, 0.0025)) {
//     for (const p of pointsOnTheTyre(s)) if (p[1] > -30 && p[1] < 4) {
//       const d = signedDist([p[0], p[2]], PLATE);
//       if (d < worst.v) worst = {v: d, s};
//     }
//   }
//   clear('tyre ↔ plate', worst.v, `stroke ${worst.s}`);
// }
//
// 2. two moving parts along one axis — e.g. valve face vs piston crown over 720°
// {
//   let worst = {v: Infinity};
//   for (const ps of sweep(0, 720, 0.25)) {
//     const gap = (M.E.deck - M.E.valve.t - M.liftEx(ps) * M.VALVE.lift) - (M.crown(ps));
//     if (gap < worst.v) worst = {v: gap, ps};
//   }
//   clear('valve face ↔ piston crown', worst.v, `${worst.ps}° after firing TDC`);
// }
//
// 3. a driver that must touch its follower — e.g. a cam lobe on a roller: distance from the roller's axle to the lobe
//    outline minus the roller radius must stay ~0 at every angle
// {
//   let lo = Infinity, hi = -Infinity;
//   for (const th of sweep(0, 720, 0.5)) {
//     const lobe = M.camProfile().map((P) => rot(P, lobeAngle(th)));
//     const axle = rollerAxle(th);
//     let d = Infinity;
//     for (let k = 0; k < lobe.length; k++) d = Math.min(d, segDist(axle, lobe[k], lobe[(k + 1) % lobe.length]));
//     lo = Math.min(lo, d - M.E.tappet.rr); hi = Math.max(hi, d - M.E.tappet.rr);
//   }
//   contact('cam lobe ↔ roller', Math.max(-lo, hi), 'over 720°');
// }
//
// 4. gears in mesh — sample each tooth outline (as the geometry draws it), place both gears at the angle, count
//    samples of one inside the other; otherwise the nearest approach (the chamfer must be cut inward)

// ------------------------------------------------------------ print
const w = Math.max(...out.map((o) => o.name.length), 10);
for (const o of out) {
  const bad = o.contact ? o.v > 0.05 : o.v < 0;
  console.log(`${o.name.padEnd(w)}  ${o.contact ? 'contact ' + o.v.toFixed(3) : (o.v >= 0 ? ' ' : '') + o.v.toFixed(2)} mm  ${o.at}${bad ? (o.contact ? '   ← LIFTS OFF OR DIGS IN' : '   ← COLLISION') : ''}${o.note ? '   ' + o.note : ''}`);
}
const bad = out.filter((o) => (o.contact ? o.v > 0.05 : o.v < 0));
console.log(bad.length ? `\n${bad.length} PROBLEM(S)` : out.length ? '\nall clear' : '\nno pairs defined yet');
process.exitCode = bad.length ? 1 : 0;
