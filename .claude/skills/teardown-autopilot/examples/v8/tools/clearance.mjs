// Clearance between every pair of moving parts that share space, over a full 720° cycle, from kin.js alone (the same
// functions and parameter block the page poses the engine with). Negative = the parts pass through each other.
//   node tools/clearance.mjs
import * as K from '../v8-shared/kin.js';

const {E, CYL, BANK, PIN_PHASE, VALVE, GEARS, GEAR_M, gearR, IDLER_D, FIRE, GEAR_TOOTH} = K;
const D2R = Math.PI / 180;
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const out = [];
const report = (name, v, at, note = '') => out.push({name, v, at, note});

// ------------------------------------------------------------ 1. valve faces vs piston crowns (every cylinder alike)
{
  let worst = {v: 1e9};
  for (let ps = 0; ps < 720; ps += 0.25) {
    const crown = K.S_TDC - K.pistonFrac(ps) * K.STROKE + E.comp;
    for (const [kind, f] of [['intake', K.liftIn], ['exhaust', K.liftEx]]) {
      const face = E.deck - E.valve.t - f(ps) * VALVE.lift;
      if (face - crown < worst.v) worst = {v: face - crown, ps, kind};
    }
  }
  report('valve face ↔ piston crown', worst.v, `${worst.kind} at ${worst.ps}° after firing TDC`);
}

// ------------------------------------------------------------ 2. crank web (counterweight, pin boss) vs piston skirt
// the web's outline as webGeo draws it, expanded by the bevel, sampled densely
const webOutline = () => {
  const pts = [];
  const R = E.cwR + E.bevel;
  for (let i = 0; i <= 60; i++) {
    const a = -Math.PI / 2 - 1.05 + (2.1 * i) / 60;
    pts.push([R * Math.cos(a), R * Math.sin(a)]);
  }
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * i) / 40;
    pts.push([(E.bossR + E.bevel) * Math.cos(a), E.r + (E.bossR + E.bevel) * Math.sin(a)]);
  }
  return pts;
};
{
  const W = webOutline();
  const Rp = E.bore / 2 - 1.5;
  let worst = {v: 1e9};
  for (let th = 0; th < 720; th += 0.5) {
    CYL.forEach((cy, i) => {
      const B = BANK[cy.bank];
      const {s} = K.piston(i, th);
      const bottom = s + E.comp - E.pistonH;
      const a = -(th + PIN_PHASE[cy.pin]) * D2R;
      for (const dz of [-E.webDz, E.webDz]) {
        const z0 = E.pinZ[cy.pin] + dz - E.webT / 2 - E.bevel;
        const z1 = E.pinZ[cy.pin] + dz + E.webT / 2 + E.bevel;
        // the nearest z of the web to the piston axis
        const zn = Math.min(Math.max(cy.z, z0), z1) - cy.z;
        for (const P of W) {
          const q = rot(P, a);
          const d = q[0] * B.b[0] + q[1] * B.b[1];
          const w = q[0] * B.p[0] + q[1] * B.p[1];
          if (w * w + zn * zn > Rp * Rp) continue; // outside the skirt's footprint at that z
          const gap = bottom - d;
          if (gap < worst.v) worst = {v: gap, th, c: cy.c};
        }
      }
    });
  }
  report('crank web ↔ piston skirt', worst.v, `cyl ${worst.c} at crank ${worst.th}°`);
}

// ------------------------------------------------------------ 3. rod big ends vs webs and vs each other (along the crank)
report('rod big end ↔ crank web', E.webDz - E.webT / 2 - E.bevel - (E.rodOff + E.bigW / 2), 'every crank angle');
report('rod big end ↔ the other rod on its pin', 2 * E.rodOff - E.bigW, 'every crank angle');

// ------------------------------------------------------------ 4. valvetrain: lobe on roller, and its neighbours
{
  const prof = K.camProfile(720);
  const T = E.tappet;
  const segDist = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  let contact = {lo: 1e9, hi: -1e9};
  let block = {v: 1e9};
  for (let th = 0; th < 720; th += 0.5) {
    CYL.forEach((cy) => {
      const B = BANK[cy.bank];
      const down = Math.atan2(-B.b[1], -B.b[0]);
      for (const kind of ['in', 'ex']) {
        const peak = FIRE[cy.c] + (VALVE[kind][0] + VALVE[kind][1]) / 2;
        const a = down + (peak / 2) * D2R - (th / 2) * D2R; // lobe group + cam group (cAng / 2 = −θ / 2)
        const L = (kind === 'in' ? K.liftIn : K.liftEx)(K.psi(cy.c, th)) * VALVE.lift;
        // everything in the bank's frame: d along the bank from the crank centre, w across
        const lob = prof.map((P) => {
          const q = rot(P, a);
          const wx = E.camD * B.b[0] + q[0];
          const wy = E.camD * B.b[1] + q[1];
          return [wx * B.p[0] + wy * B.p[1], wx * B.b[0] + wy * B.b[1]];
        });
        const axle = [0, K.stemTip(L) + T.fork + T.rr];
        let dmin = 1e9;
        for (let k = 0; k < lob.length; k++) dmin = Math.min(dmin, segDist(axle, lob[k], lob[(k + 1) % lob.length]));
        const err = dmin - T.rr;
        if (err < contact.lo) contact.lo = err;
        if (err > contact.hi) contact = {...contact, hi: err, th, c: cy.c, kind};
        // the tappet block under the roller: the lobe must stay above its top face
        const top = K.stemTip(L) + T.fork;
        for (const q of lob) if (Math.abs(q[0]) < T.rr) block.v = Math.min(block.v, q[1] - top);
      }
    });
  }
  const touch = Math.max(-contact.lo, contact.hi);
  out.push({name: 'cam lobe ↔ roller: in contact', v: touch, at: `|gap| ≤ ${touch.toFixed(3)} mm on all 16 valves over 720°`, note: touch > 0.05 ? 'LIFTS OFF OR DIGS IN' : 'touching, as it must', contact: true});
  report('cam lobe ↔ tappet block', block.v, 'every valve, every angle');
  report('cam lobe ↔ cam bearing bar (along the crank)', 30 - 3 - (E.valve.z + E.cam.w / 2), 'every angle');
  report('tappet ↔ cam bearing bar (along the crank)', 30 - 3 - (E.valve.z + T.rw / 2 + T.cheek + 0.3), 'every angle');
  report('valve head ↔ the other valve head', 2 * E.valve.z - 2 * E.valve.face, 'every angle');
  report('valve spring ↔ the other spring', 2 * E.valve.z - 2 * (E.spring.r1 + E.spring.w1), 'every angle');
  report('valve head ↔ bore wall', E.bore / 2 - Math.hypot(E.valve.x, E.valve.z) - E.valve.face, 'every angle');
}

// ------------------------------------------------------------ 5. timing gears: tooth outlines of every meshing pair
{
  const outline = (n) => {
    const ro = gearR(n) + GEAR_M;
    const rr = gearR(n) - 1.25 * GEAR_M;
    const da = (2 * Math.PI) / n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a0 = i * da;
      const T = GEAR_TOOTH;
      const P = [[rr, a0], [rr, a0 + da * T.r0], [ro, a0 + da * T.t0], [ro, a0 + da * T.t1], [rr, a0 + da * T.r1]];
      for (let k = 0; k < P.length; k++) {
        const [r1, b1] = P[k];
        const [r2, b2] = P[(k + 1) % P.length] ?? [rr, a0 + da];
        for (let u = 0; u < 1; u += 0.125) {
          const r = r1 + (r2 - r1) * u;
          const b = b1 + (b2 - b1) * u;
          pts.push([r * Math.cos(b), r * Math.sin(b)]);
        }
      }
    }
    return pts;
  };
  const inPoly = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const toothAt = (n, a) => a - (((GEAR_TOOTH.t0 + GEAR_TOOTH.t1) / 2) * 2 * Math.PI) / n;
  const bankA = (b) => Math.atan2(BANK[b].b[1], BANK[b].b[0]);
  const G = (n, c, ph0, k) => ({n, c, ph0, k, o: outline(n)});
  const gears = {
    crank: G(GEARS.crank, [0, 0], toothAt(GEARS.crank, bankA('L')), 1),
    idlerL: G(GEARS.idler, [IDLER_D * BANK.L.b[0], IDLER_D * BANK.L.b[1]], toothAt(GEARS.idler, bankA('L') + Math.PI + Math.PI / GEARS.idler), -GEARS.crank / GEARS.idler),
    idlerR: G(GEARS.idler, [IDLER_D * BANK.R.b[0], IDLER_D * BANK.R.b[1]], toothAt(GEARS.idler, bankA('R') + Math.PI + Math.PI / GEARS.idler), -GEARS.crank / GEARS.idler),
    camL: G(GEARS.cam, [E.camD * BANK.L.b[0], E.camD * BANK.L.b[1]], toothAt(GEARS.cam, bankA('L') + Math.PI), GEARS.crank / GEARS.cam),
    camR: G(GEARS.cam, [E.camD * BANK.R.b[0], E.camD * BANK.R.b[1]], toothAt(GEARS.cam, bankA('R') + Math.PI), GEARS.crank / GEARS.cam),
  };
  const place = (g, th) => {
    const a = g.ph0 + -th * D2R * g.k; // cAng = −θ; each gear turns k × cAng (engine.js)
    return g.o.map((p) => {
      const q = rot(p, a);
      return [q[0] + g.c[0], q[1] + g.c[1]];
    });
  };
  {
    const d = Math.hypot(gears.idlerL.c[0] - gears.idlerR.c[0], gears.idlerL.c[1] - gears.idlerR.c[1]);
    report('gear idlerL ↔ idlerR (tips, not meshed)', d - 2 * (gearR(GEARS.idler) + GEAR_M), 'every angle');
  }
  for (const [a, b] of [['crank', 'idlerL'], ['crank', 'idlerR'], ['idlerL', 'camL'], ['idlerR', 'camR']]) {
    let worst = {v: 1e9};
    for (let th = 0; th < 60; th += 0.25) {
      const A = place(gears[a], th);
      const Bp = place(gears[b], th);
      // penetration: a sample of one outline inside the other; otherwise the nearest approach
      let pen = 0;
      for (const p of A) if (inPoly(p, Bp)) pen++;
      for (const p of Bp) if (inPoly(p, A)) pen++;
      let near = 1e9;
      const cA = gears[a].c;
      const cB = gears[b].c;
      const mid = [(cA[0] + cB[0]) / 2, (cA[1] + cB[1]) / 2];
      const closeA = A.filter((p) => Math.hypot(p[0] - cB[0], p[1] - cB[1]) < gearR(gears[b].n) + 2 * GEAR_M);
      const closeB = Bp.filter((p) => Math.hypot(p[0] - cA[0], p[1] - cA[1]) < gearR(gears[a].n) + 2 * GEAR_M);
      for (const p of closeA) for (const q of closeB) near = Math.min(near, Math.hypot(p[0] - q[0], p[1] - q[1]));
      // the chamfer is cut inward (engine.js), so the flanks are the outlines themselves
      const v = pen ? -pen : near;
      void mid;
      if (v < worst.v) worst = {v, th, pen};
    }
    report(`gear ${a} ↔ ${b}`, worst.v, worst.pen ? `${worst.pen} outline samples inside the other at crank ${worst.th}°` : `nearest at crank ${worst.th}°`, worst.pen ? 'TEETH CLASH' : '');
  }
}

const w = Math.max(...out.map((o) => o.name.length));
for (const o of out) console.log(`${o.name.padEnd(w)}  ${o.contact ? '  0.00' : (o.v >= 0 ? ' ' : '') + o.v.toFixed(2)} mm  ${o.at}${o.note ? '   ← ' + o.note : o.v < 0 ? '   ← COLLISION' : ''}`);
const bad = out.filter((o) => (o.contact ? o.v > 0.05 : o.v < 0));
console.log(bad.length ? `\n${bad.length} PROBLEM(S)` : '\nall clear');
process.exitCode = bad.length ? 1 : 0;
