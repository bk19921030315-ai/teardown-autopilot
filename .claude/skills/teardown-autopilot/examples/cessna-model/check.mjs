// Prints the hand check and tests the model against itself. node tools/check.mjs
import * as M from '../gear-shared/model.js';
// (flight.js comes from the teardown cessna example)
import {SEQ} from '../gear-shared/flight.js';
const f = (x, n = 3) => x.toFixed(n);
const C = M.CHECK;
console.log('--- hand check');
console.log(`pitch diameter  d = m·z = ${M.MODULE} × ${M.TEETH} = ${f(C.pitchD, 1)} mm`);
console.log(`half the pitch circumference  π·d/2 = ${f(C.halfCirc, 3)} mm   (prompt says 201 mm)`);
console.log(`201 mm of rack turns the pinion  201 / 64 rad = ${f(C.turnForNominal, 3)}°   (short of 180° by ${f(180 - C.turnForNominal, 3)}°)`);
console.log(`rack teeth per half turn  ${f(C.halfCirc, 3)} / (π·4) = ${f(C.teethFor180, 3)}  = z/2 = ${M.TEETH / 2}`);
console.log(`universal joint working angle  acos(x·axis) = ${f(C.jointAngle, 2)}°`);
console.log('--- model at s = 0 and s = 1');
for (const s of [0, 1]) {
  const r = M.readout(s);
  console.log(`s=${s}: rack ${f(r.rack, 2)} mm, pinion ${f(r.pinion, 3)}°, tube ${f(r.tube, 3)}°, teeth ${f(r.teeth, 3)}, axle [${r.axle.map((v) => f(v, 1))}]`);
}
console.log('--- the joint: geometric spider vs closed form tan(out)=tan(in)/cos(beta)');
let worst = 0, lead = {v: 0, s: 0};
for (let i = 0; i <= 2000; i++) {
  const s = i / 2000;
  const a = M.tubeTurn(s), b = M.tubeTurnClosed(s);
  if (Math.abs(Math.cos(M.shaftAngle(s))) > 1e-6) worst = Math.max(worst, Math.abs(a - b));
  const r = M.readout(s);
  if (Math.abs(r.lead) > Math.abs(lead.v)) lead = {v: r.lead, s};
  const {u, v} = M.spider(s);
  if (Math.abs(M.V.dot(u, v)) > 1e-12) throw new Error('spider arms not square');
}
console.log(`largest disagreement ${worst.toExponential(2)} rad; largest lead/lag of the leg ${f(lead.v, 2)}° at s=${f(lead.s, 3)}`);
console.log('--- wheel path: this model (rack forward) vs pulling the rack aft');
for (const sign of [1, -1]) {
  let maxY = -1e9, minY = 1e9, minX = 1e9;
  for (let i = 0; i <= 200; i++) {
    const s = i / 200;
    const a = sign * M.tubeTurn(s);
    const p = M.V.add(M.J, M.rotate(M.V.sub(M.TIP0, M.J), M.AXIS, a));
    maxY = Math.max(maxY, p[1]); minY = Math.min(minY, p[1]); minX = Math.min(minX, p[0]);
  }
  console.log(`${sign > 0 ? 'rack forward' : 'rack aft    '}: axle y from ${f(minY, 0)} to ${f(maxY, 0)} mm, closest to centreline x=${f(minX, 0)} mm`);
}
console.log(`ground: plate top ${f(M.GROUND, 1)} mm above the runway, gear down; wheel radius ${f(M.WHEEL_R, 2)}`);

console.log('--- tyre vs runway through each flight sequence (gap must stay >= 0)');
for (const [k, S] of Object.entries(SEQ)) {
  let worst = {gap: 1e9, t: 0};
  for (let t = 0; t <= S.dur; t += 0.005) {
    const gap = M.GROUND + S.height(t) * 1000 + M.tyreLowest(S.stroke(t));
    if (gap < worst.gap) worst = {gap, t, s: S.stroke(t), h: S.height(t)};
  }
  console.log(`${k}: smallest gap ${f(worst.gap, 1)} mm at t=${f(worst.t, 2)} s (stroke ${f(worst.s, 3)}, height ${f(worst.h * 1000, 0)} mm)`);
}
// the plate's plan form (mm, [x, z]) and its thickness band; rails and actuator as boxes
const PLATE = [[-120, 620], [120, 620], [140, 320], [420, 220], [460, 120], [440, -60], [160, -160], [140, -780], [-140, -780], [-160, -160], [-440, -60], [-460, 120], [-420, 220], [-140, 320]];
const inPoly = (x, z) => { let c = false; for (let i = 0, j = PLATE.length - 1; i < PLATE.length; j = i++) { const [xi, zi] = PLATE[i], [xj, zj] = PLATE[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c; } return c; };
console.log('--- tyre vs plate over the whole stroke (tread circle, both sidewalls)');
let hit = null, closest = 1e9;
for (let i = 0; i <= 400; i++) {
  const s = i / 400;
  const a = M.axle(s), d = M.axleDir(s);
  const e1 = M.V.unit(M.V.cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), e2 = M.V.cross(d, e1);
  for (let k = 0; k < 180; k++) for (const w of [-0.5, 0, 0.5]) {
    const t = (k / 180) * 2 * Math.PI;
    const r = w === 0 ? M.WHEEL_R : M.WHEEL_R * 0.8;
    const p = M.V.add(M.V.add(a, M.V.scale(d, w * M.WHEEL_W)), M.V.add(M.V.scale(e1, r * Math.cos(t)), M.V.scale(e2, r * Math.sin(t))));
    if (inPoly(p[0], p[2])) closest = Math.min(closest, Math.abs(p[1] + 15) - 15);
    if (!hit && p[1] < 4 && p[1] > -30 && inPoly(p[0], p[2])) hit = {s, p};
  }
}
console.log(hit ? `HIT at s=${f(hit.s, 3)}: [${hit.p.map((v) => f(v, 0))}]` : `clear; nearest approach to the plate band ${f(closest, 0)} mm`);
