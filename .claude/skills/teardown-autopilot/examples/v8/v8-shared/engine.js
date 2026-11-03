// The V8 itself, built from code in millimetres in the look of a clean study model: a gloss-black open block of
// V-shaped bulkheads, glass cylinder liners with the charge inside them, polished pistons, black rods, a cross-plane
// crank with counterweights, two valves per cylinder with coil springs under a black rocker cage and a camshaft per
// bank, white spark plugs, black exhaust bends, helical timing gears and a pulley at the front, the flywheel at the
// back, and red overlay arrows. update(th, ops) poses everything for crank angle th (degrees).
import * as THREE from 'three';
import {BANK, camProfile, chargeOf, CYL, E, FIRE, GEAR_TOOTH, GEARS, GEAR_M, gearR, IDLER_D, liftEx, liftIn, piston, pinXY, psi, PIN_PHASE, pressure, stemTip, VALVE} from './kin.js';

/** the subsystems, each with its own isolate / cut / alone controls */
export const SUBS = ['block', 'crank', 'pistons', 'valvetrain', 'heads', 'timing'];

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const DECK = E.deck;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};

// ------------------------------------------------------------ geometry helpers
function gearGeo(teeth, rOut, rRoot, width, helix = 0, holeR = 0, tooth = null) {
  const T = tooth ?? {r0: 0.2, t0: 0.33, t1: 0.62, r1: 0.75, bevel: 1.0, inward: false};
  const sh = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const da = (Math.PI * 2) / teeth;
    const pts = [
      [rRoot, a0],
      [rRoot, a0 + da * T.r0],
      [rOut, a0 + da * T.t0],
      [rOut, a0 + da * T.t1],
      [rRoot, a0 + da * T.r1],
    ];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? sh.moveTo(r * Math.cos(a), r * Math.sin(a)) : sh.lineTo(r * Math.cos(a), r * Math.sin(a))));
  }
  sh.closePath();
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 1.2, bevelSize: T.bevel, bevelOffset: T.inward ? -T.bevel : 0, bevelSegments: 1, curveSegments: 4});
  g.translate(0, 0, -width / 2);
  if (helix) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = (p.getZ(i) / width) * helix;
      const x = p.getX(i);
      const y = p.getY(i);
      p.setXY(i, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    }
  }
  g.computeVertexNormals();
  return g;
}
// a gear's blank: a plain disc at the pitch radius, the same width, bevel and bore, no teeth
function discGeo(r, width, holeR = 0, seg = 48) {
  const sh = new THREE.Shape();
  sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  if (holeR) {
    const h = new THREE.Path();
    h.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    sh.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.0, bevelSegments: 1, curveSegments: seg});
  g.translate(0, 0, -width / 2);
  return g;
}
function helixGeo(r, wire, turns, len, seg = 220) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg;
    const a = u * turns * Math.PI * 2;
    pts.push(new V3(Math.cos(a) * r, u * len, Math.sin(a) * r));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, wire, 8, false);
}
// a crank web: the main boss, the pin boss and a counterweight sector opposite the pin, in the XY plane
function webGeo(thick, cs = 28) {
  const sh = new THREE.Shape();
  const R = E.cwR;
  // the counterweight: a fat sector below the axis, flanks running up to the pin boss
  sh.moveTo(-R * Math.sin(1.05), -R * Math.cos(1.05));
  sh.absarc(0, 0, R, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05, false);
  sh.lineTo(30, 10);
  sh.absarc(0, E.r, E.bossR, 0, Math.PI, false);
  sh.lineTo(-30, 10);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, {depth: thick, bevelEnabled: true, bevelThickness: E.bevel, bevelSize: E.bevel, bevelSegments: 2, curveSegments: cs});
  g.translate(0, 0, -thick / 2);
  return g;
}
// a V bulkhead: the crank bore, two arms up to each bank's deck
function bulkheadGeo(thick, cs = 24) {
  const sh = new THREE.Shape();
  const W = 54; // arm half width across the bank
  const pts = [];
  const arm = (bank, w, d) => {
    const B = BANK[bank];
    return [d * B.b[0] + w * B.p[0], d * B.b[1] + w * B.p[1]];
  };
  pts.push([-95, -70], [95, -70]);
  pts.push(arm('L', W + 20, 40), arm('L', W, DECK - 10), arm('L', -W, DECK - 10), [0, 120]);
  pts.push(arm('R', -W, DECK - 10), arm('R', W, DECK - 10), arm('R', W + 20, 40));
  // the R arm's outward side is the -x side; walk the outline in order
  const ordered = [[-95, -70], [95, -70], arm('L', W + 18, 40), arm('L', W, DECK - 12), arm('L', -W, DECK - 12), [0, 118], arm('R', -W, DECK - 12), arm('R', W, DECK - 12), arm('R', W + 18, 40)];
  void pts;
  ordered.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 44, 0, Math.PI * 2, true);
  sh.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(sh, {depth: thick, bevelEnabled: true, bevelThickness: 2, bevelSize: 2, bevelSegments: 2, curveSegments: cs});
  g.translate(0, 0, -thick / 2);
  return g;
}

/** opts.plain: the same engine a notch simpler (the A/B film's version B): gears as toothless discs, each valve's
 *  two coil springs as one plain sleeve, no piston rings, no pulley bolts. Absent, the engine is built as before.
 *  opts.lo: the teardown A/B's version B, clearly cheaper: everything plain drops, plus flat-shaded Lambert for every
 *  material, opaque liners, a sixth of the segments on every round part, polygon discs for gears, boxes for lobes.
 *  opts.caps: a colour; with a section on, the cut gets a flat face of it wherever it passes through a solid. */
export function buildEngine(opts = {}) {
  const lo = !!opts.lo;
  const plain = !!opts.plain || lo;
  // segment counts: the film's, or a sixth of them in the low build
  const N = (n, min = 6) => (lo ? Math.max(min, Math.round(n / 6)) : n);
  const gear = (teeth, rOut, rRoot, width, helix = 0, holeR = 0) =>
    plain ? discGeo((rOut + rRoot) / 2, width, holeR, lo ? Math.max(8, Math.round((rOut + rRoot) / 24)) : 48) : gearGeo(teeth, rOut, rRoot, width, helix, holeR);
  const root = new THREE.Group();
  const M = {
    black: new THREE.MeshPhysicalMaterial({color: '#141518', roughness: 0.3, metalness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.18}),
    blackMatte: new THREE.MeshPhysicalMaterial({color: '#1b1c1f', roughness: 0.55, metalness: 0.15, clearcoat: 0.25}),
    steel: new THREE.MeshStandardMaterial({color: '#cfd2d6', roughness: 0.22, metalness: 1}),
    alu: new THREE.MeshStandardMaterial({color: '#d9dbdf', roughness: 0.3, metalness: 0.85}),
    bronze: new THREE.MeshStandardMaterial({color: '#b98a55', roughness: 0.3, metalness: 0.9}),
    ceramic: new THREE.MeshPhysicalMaterial({color: '#f3f0ea', roughness: 0.35, metalness: 0, clearcoat: 0.6}),
    glass: new THREE.MeshPhysicalMaterial({color: '#ffffff', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6}),
    red: new THREE.MeshBasicMaterial({color: '#e3172c', transparent: true, opacity: 0.9, depthWrite: false}),
  };
  if (lo) {
    // flat Lambert: no gloss, nothing to reflect; the blacks lift to graphite so the facets still read without the
    // studio's highlights, and the liners turn opaque
    const flat = (color) => new THREE.MeshLambertMaterial({color, flatShading: true});
    Object.assign(M, {black: flat('#66696f'), blackMatte: flat('#717479'), steel: flat('#b9bdc3'), alu: flat('#cfd2d6'), bronze: flat('#a37b4d'), ceramic: flat('#ece8e0'), glass: flat('#86898f')});
  }
  const add = (parent, geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // ------------------------------------------------------------ block: bulkheads, rails, pan
  const block = new THREE.Group();
  root.add(block);
  const bh = bulkheadGeo(16, N(24));
  for (const z of [236, 112, 0, -112, -236]) add(block, bh, M.black).position.z = z;
  for (const bank of ['L', 'R']) {
    const B = BANK[bank];
    // deck rails along the bank, both sides of the bores
    for (const w of [-60, 60]) {
      const r = add(block, new THREE.BoxGeometry(14, 16, 488), M.black);
      const [x, y] = [(DECK - 18) * B.b[0] + w * B.p[0], (DECK - 18) * B.b[1] + w * B.p[1]];
      r.position.set(x, y, 0);
      r.rotation.z = Math.atan2(B.b[1], B.b[0]) - Math.PI / 2;
    }
  }
  const pan = add(block, new THREE.BoxGeometry(200, 40, 470), M.blackMatte);
  pan.position.set(0, -92, 0);
  const rail = add(block, new THREE.BoxGeometry(220, 12, 500), M.black);
  rail.position.set(0, -68, 0);

  // ------------------------------------------------------------ cylinders: liner, flange, head pieces, valvetrain, plug, exhaust
  const cyl = CYL.map((cy) => {
    const B = BANK[cy.bank];
    const g = new THREE.Group();
    g.position.z = cy.z;
    g.rotation.z = Math.atan2(B.b[1], B.b[0]) - Math.PI / 2;
    root.add(g);
    // local x points across the bank; the outer side is +x on the left bank, -x on the right
    const out = cy.bank === 'L' ? 1 : -1;
    const liner = add(g, new THREE.CylinderGeometry(E.bore / 2 + 3, E.bore / 2 + 3, 118, N(48), 1, true), M.glass, false);
    liner.position.y = DECK - 59;
    liner.renderOrder = 3;
    for (const y of [DECK - 118, DECK]) {
      const ring = add(g, new THREE.TorusGeometry(E.bore / 2 + 4, 3.2, N(10, 4), N(48)), M.black);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
    }
    // the head: a black flange over the bore with a raised valve block; one group with its valves, plug and exhaust
    const head = new THREE.Group();
    g.add(head);
    const flange = add(head, new THREE.TorusGeometry(64, 10, N(16, 4), N(56)), M.black);
    flange.rotation.x = Math.PI / 2;
    flange.position.y = DECK + 6;
    const cap = add(head, new THREE.CylinderGeometry(60, 64, 12, N(56)), M.black);
    cap.position.y = DECK + 14;
    const vblock = add(head, new THREE.BoxGeometry(70, 14, 46), M.black);
    vblock.position.y = DECK + 27;
    // the charge: a column of gas between the crown and the head
    const charge = new THREE.Mesh(new THREE.CylinderGeometry(E.bore / 2 - 1, E.bore / 2 - 1, 1, N(40)), new THREE.MeshBasicMaterial({color: '#4a90e2', transparent: true, opacity: 0.35, depthWrite: false}));
    charge.renderOrder = 2;
    g.add(charge);
    // valves: intake on the valley side, exhaust outboard
    // two valves inline along the crank, each straight under its cam lobe: intake toward the front of the lobe pair
    const valves = [
      {x: -out * E.valve.x, z: -E.valve.z, kind: 'in'},
      {x: out * E.valve.x, z: E.valve.z, kind: 'ex'},
    ].map((v) => {
      const vg = new THREE.Group();
      head.add(vg);
      vg.position.set(v.x, 0, v.z);
      const stem = add(vg, new THREE.CylinderGeometry(E.valve.stemR, E.valve.stemR, E.valve.stem, N(12)), M.steel);
      stem.position.y = DECK - E.valve.t + E.valve.stem / 2;
      // the head: the wide face down toward the chamber, narrowing up into the stem
      const disc = add(vg, new THREE.CylinderGeometry(E.valve.neck, E.valve.face, E.valve.t, N(28)), M.steel);
      disc.position.y = DECK - E.valve.t / 2;
      const spring = new THREE.Group();
      head.add(spring);
      spring.position.set(v.x, DECK + 34, v.z);
      if (plain) {
        // a plain sleeve where the coils were, squeezed with the lift the same way
        const sleeve = new THREE.CylinderGeometry(E.spring.r1, E.spring.r1, 48, N(24));
        sleeve.translate(0, 24, 0);
        add(spring, sleeve, M.steel);
      } else {
        add(spring, helixGeo(E.spring.r1, E.spring.w1, 8, 48), M.steel);
        add(spring, helixGeo(E.spring.r2, E.spring.w2, 10, 48), M.bronze);
      }
      const ret = add(vg, new THREE.CylinderGeometry(E.spring.ret, E.spring.ret, 4, N(24)), M.black);
      ret.position.y = DECK + 84;
      // the roller tappet rides on the stem tip and moves with the valve: a block, two cheeks, the roller between them
      const T = E.tappet;
      const tip = stemTip(0);
      const axle = tip + T.fork + T.rr;
      const blk = add(vg, new THREE.BoxGeometry(2 * T.rr, T.fork, T.rw + 2 * T.cheek), M.blackMatte);
      blk.position.y = tip + T.fork / 2;
      for (const sz of [-1, 1]) {
        const ch = add(vg, new THREE.BoxGeometry(2 * T.rr - 4, T.rr, T.cheek), M.blackMatte);
        ch.position.set(0, tip + T.fork + T.rr / 2, sz * (T.rw / 2 + T.cheek / 2 + 0.3));
      }
      const roller = add(vg, new THREE.CylinderGeometry(T.rr, T.rr, T.rw, N(24)), M.steel);
      roller.rotation.x = Math.PI / 2;
      roller.position.y = axle;
      return {...v, vg, spring};
    });
    // the cam carrier: an open black frame over the springs; its cross bars are the camshaft's bearings, one each
    // side of the cylinder's lobe pair
    const cage = new THREE.Group();
    g.add(cage);
    const camY = E.camD - DECK;
    const postBot = 20; // the head cap's top face: the posts stand on it (they floated 40 mm above it)
    const postTop = camY + 14;
    for (const zz of [-30, 30]) {
      for (const xx of [-44, 44]) {
        const post = add(cage, new THREE.BoxGeometry(6, postTop - postBot, 6), M.black);
        post.position.set(xx, DECK + (postTop + postBot) / 2, zz);
      }
      const bar = add(cage, new THREE.BoxGeometry(94, 2 * E.cam.shaftR + 6, 6), M.black);
      bar.position.set(0, DECK + camY, zz);
    }
    // spark plug: out of the head on the intake side, leaning outboard (the exhaust leaves on the other side)
    const plug = new THREE.Group();
    head.add(plug);
    plug.position.set(out * 46, DECK + 18, -E.valve.z);
    plug.rotation.z = -out * 0.62;
    add(plug, new THREE.CylinderGeometry(6.5, 6.5, 40, N(16)), M.ceramic).position.y = 30;
    add(plug, new THREE.CylinderGeometry(8.5, 8.5, 10, 6), M.steel).position.y = 6;
    add(plug, new THREE.CylinderGeometry(2.2, 2.2, 10, N(8, 4)), M.steel).position.y = 55;
    // exhaust: a black bend out of the outboard port, down along the block
    const ez = E.valve.z;
    const pts = [new V3(out * 50, DECK + 12, ez), new V3(out * 92, DECK + 6, ez + 4), new V3(out * 122, DECK - 30, ez + 4), new V3(out * 126, DECK - 90, ez + 4)];
    add(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N(32), 15, N(18), false), M.black);
    return {cy, g, out, charge, valves, liner, head, cage};
  });

  // camshafts: one per bank through the cages, lobes over every valve
  const cams = ['L', 'R'].map((bank) => {
    const B = BANK[bank];
    const g = new THREE.Group();
    const [x, y] = [E.camD * B.b[0], E.camD * B.b[1]];
    g.position.set(x, y, 0);
    root.add(g);
    add(g, new THREE.CylinderGeometry(E.cam.shaftR, E.cam.shaftR, 520, N(20)), M.black).rotation.x = Math.PI / 2;
    // every lobe is the same profile (kin.camProfile, nose along +x), turned so the nose points down the bank at its
    // roller (−b) at the crank angle of peak lift; the cam then turns at half crank speed and the lobe rolls on it
    const down = Math.atan2(-B.b[1], -B.b[0]);
    const lobes = [];
    for (const c of cyl.filter((c) => c.cy.bank === bank)) {
      for (const v of c.valves) {
        const lg = new THREE.Group();
        // two lobes per cylinder on the shaft, phased so each peaks when its valve is fully open
        lg.position.set(0, 0, c.cy.z + v.z);
        const peak = FIRE[c.cy.c] + (v.kind === 'in' ? (VALVE.in[0] + VALVE.in[1]) / 2 : (VALVE.ex[0] + VALVE.ex[1]) / 2);
        lg.rotation.z = down + (peak / 2) * D2R;
        g.add(lg);
        const sh = new THREE.Shape(camProfile().map(([x, y]) => new THREE.Vector2(x, y)));
        // the low build turns each lobe into a box of the same footprint
        const lobeGeo = lo ? new THREE.BoxGeometry(30, 38, 14).translate(0, 4, 7) : new THREE.ExtrudeGeometry(sh, {depth: E.cam.w, bevelEnabled: true, bevelSize: E.cam.bevel, bevelOffset: -E.cam.bevel, bevelThickness: E.cam.bevel, bevelSegments: 1});
        const lobe = add(lg, lobeGeo, M.black);
        lobe.position.z = -E.cam.w / 2;
        lobes.push({lg, c, v});
      }
    }
    return {bank, g, lobes};
  });

  // ------------------------------------------------------------ crankshaft
  const crank = new THREE.Group();
  root.add(crank);
  const webG = webGeo(E.webT, N(28));
  const webs = [];
  E.pinZ.forEach((z, p) => {
    for (const dz of [-E.webDz, E.webDz]) {
      const w = add(crank, webG, M.black);
      w.position.z = z + dz;
      webs.push({w, p});
    }
  });
  const journals = [236, 112, 0, -112, -236].map((z) => {
    const j = add(crank, new THREE.CylinderGeometry(30, 30, 42, N(32)), M.steel);
    j.rotation.x = Math.PI / 2;
    j.position.z = z;
    return j;
  });
  const pins = E.pinZ.map((z) => {
    const m = add(root, new THREE.CylinderGeometry(25, 25, 52, N(28)), M.steel);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
    return m;
  });

  // ------------------------------------------------------------ pistons and rods
  const pistonGeo = new THREE.CylinderGeometry(E.bore / 2 - 1.5, E.bore / 2 - 1.5, E.pistonH, N(48));
  const ringGeo = new THREE.TorusGeometry(E.bore / 2 - 1.2, 1.6, 8, 48);
  const pist = CYL.map((cy, i) => {
    const g = new THREE.Group();
    cyl[i].g.add(g);
    const body = add(g, pistonGeo, M.alu);
    body.position.y = E.comp - E.pistonH / 2;
    for (let k = 0; k < (plain ? 0 : 3); k++) {
      const r = add(g, ringGeo, M.blackMatte);
      r.rotation.x = Math.PI / 2;
      r.position.y = E.comp - 8 - k * 7;
    }
    const pinM = add(g, new THREE.CylinderGeometry(11, 11, E.bore - 10, N(16)), M.steel);
    pinM.rotation.z = Math.PI / 2;
    pinM.rotation.y = Math.PI / 2;
    const rod = new THREE.Group();
    root.add(rod);
    const beam = add(rod, new THREE.BoxGeometry(18, 1, 12), M.black);
    const big = add(rod, new THREE.CylinderGeometry(E.bigR, E.bigR, E.bigW, N(32)), M.black);
    big.rotation.x = Math.PI / 2;
    const small = add(rod, new THREE.CylinderGeometry(17, 17, 20, N(24)), M.black);
    small.rotation.x = Math.PI / 2;
    // the red arrow riding beside the liner, pointing the way the piston moves
    const arrow = new THREE.Group();
    cyl[i].g.add(arrow);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 46, 12), M.red);
    shaft.position.y = -10;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 18), M.red);
    tip.position.y = 23;
    arrow.add(shaft, tip);
    arrow.position.set(cyl[i].out * 78, 0, 0);
    arrow.renderOrder = 5;
    return {g, rod, beam, big, small, arrow};
  });

  // ------------------------------------------------------------ front: timing gears and the pulley; rear: the flywheel
  // the timing train (kin.js GEARS): crank gear, an idler per bank, a cam gear per bank, one module, every centre on
  // its bank's axis. Teeth from the module: tip at r + m, root at r − 1.25 m. Phases (rad, in each gear's own frame)
  // put a tooth of one gear in a gap of the next along each line of centres, and the turns roll them from there.
  const front = 268;
  const D2 = Math.PI * 2;
  const spur = (n, holeR) => (plain ? gear(n, gearR(n) + GEAR_M, gearR(n) - 1.25 * GEAR_M, 22, 0, holeR) : gearGeo(n, gearR(n) + GEAR_M, gearR(n) - 1.25 * GEAR_M, 22, 0, holeR, {...GEAR_TOOTH, inward: true}));
  // gearGeo puts tooth k's centre half way between its tip corners; ph0 brings a tooth centre to angle a
  const toothAt = (n, a) => a - (((GEAR_TOOTH.t0 + GEAR_TOOTH.t1) / 2) * D2) / n;
  const bankA = (bank) => Math.atan2(BANK[bank].b[1], BANK[bank].b[0]);
  const crankGear = add(root, spur(GEARS.crank, 10), M.black);
  crankGear.position.z = front;
  crankGear.userData.ph0 = toothAt(GEARS.crank, bankA('L')); // a tooth on both lines of centres (90° = 6 pitches)
  const idlers = ['L', 'R'].map((bank) => {
    const B = BANK[bank];
    const gg = add(root, spur(GEARS.idler, 16), M.black);
    gg.position.set(IDLER_D * B.b[0], IDLER_D * B.b[1], front);
    // the idler runs on a stud from the front bulkhead (its face at z 236 + 8 + bevel); it floated 10 mm off the block
    const stud = add(root, new THREE.CylinderGeometry(14, 14, front + 14 - 244, N(20)), M.steel);
    stud.rotation.x = Math.PI / 2;
    stud.position.set(IDLER_D * B.b[0], IDLER_D * B.b[1], (front + 14 + 244) / 2);
    gg.userData.stud = stud;
    // a gap facing the crank gear's tooth: a tooth half a pitch off the line back to the crank
    gg.userData.ph0 = toothAt(GEARS.idler, bankA(bank) + Math.PI + Math.PI / GEARS.idler);
    return {gg, bank};
  });
  // the idler then shows a gap up the bank (40 teeth: the far side of the line is half a pitch off too), so the cam
  // gear brings a tooth there
  const camGears = ['L', 'R'].map((bank) => {
    const B = BANK[bank];
    const gg = add(root, spur(GEARS.cam, 14), M.black);
    gg.position.set(E.camD * B.b[0], E.camD * B.b[1], front);
    gg.userData.ph0 = toothAt(GEARS.cam, bankA(bank) + Math.PI);
    return {gg, bank};
  });
  const pulley = new THREE.Group();
  pulley.position.z = front + 44;
  root.add(pulley);
  add(pulley, new THREE.CylinderGeometry(84, 84, 34, N(64)), M.black).rotation.x = Math.PI / 2;
  const groove = add(pulley, new THREE.TorusGeometry(84, 4, N(8, 4), N(64)), M.blackMatte);
  groove.position.z = 0;
  for (let k = 0; k < (plain ? 0 : 6); k++) {
    const b = add(pulley, new THREE.CylinderGeometry(6, 6, 6, 12), M.steel);
    const a = (k / 6) * Math.PI * 2;
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 52, Math.sin(a) * 52, 18);
  }
  const hub = add(pulley, gear(18, 26, 23, 50, 0, 8), M.steel);
  hub.position.z = 30;
  const flywheel = new THREE.Group();
  flywheel.position.z = -290;
  root.add(flywheel);
  add(flywheel, new THREE.CylinderGeometry(150, 150, 22, N(72)), M.black).rotation.x = Math.PI / 2;
  add(flywheel, gear(120, 166, 158, 20, 0, 140), M.black);
  // red arcs around the pulley, turning with the crank
  const arcs = new THREE.Group();
  arcs.position.z = front + 66;
  root.add(arcs);
  for (const a0 of [0, Math.PI]) {
    const arc = new THREE.Mesh(new THREE.TorusGeometry(108, 5, 8, 48, Math.PI * 0.62), M.red);
    arc.rotation.z = a0;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(13, 30, 16), M.red);
    const ta = a0 + Math.PI * 0.62;
    tip.position.set(Math.cos(ta) * 108, Math.sin(ta) * 108, 0);
    tip.rotation.z = ta;
    arcs.add(arc, tip);
  }
  arcs.renderOrder = 5;

  const CHARGE_COL = [new THREE.Color('#3f8de0'), new THREE.Color('#5d6670'), new THREE.Color('#ff6a1f'), new THREE.Color('#8b8f95')];
  const tmp = new V3();
  // cutaway: 'glass' (clear liners), 'solid' (opaque liners), 'section' (everything on the far side of the plane cut
  // away: ahead of z by default, or past any plane given by its normal); refract: the glass catches the studio or goes
  // nearly clear
  const CLIP = new THREE.Plane(new V3(0, 0, -1), 0);
  const Z_CUT = new V3(0, 0, -1);

  // ------------------------------------------------------------ subsystems
  // every mesh carries the subsystem it belongs to; tags go outer to inner, so a valve inside a head ends up valvetrain
  const tag = (o, sub) => o.traverse((m) => m.isMesh && (m.userData.sub = sub));
  tag(block, 'block');
  for (const c of cyl) {
    tag(c.g, 'block');
    tag(c.head, 'heads');
    for (const v of c.valves) {
      tag(v.vg, 'valvetrain');
      tag(v.spring, 'valvetrain');
    }
    tag(c.cage, 'valvetrain');
    c.charge.userData.sub = 'gas';
  }
  for (const p of pist) {
    tag(p.g, 'pistons');
    tag(p.rod, 'pistons');
    tag(p.arrow, 'parrows');
  }
  for (const c of cams) tag(c.g, 'valvetrain');
  tag(crank, 'crank');
  for (const m of pins) tag(m, 'crank');
  tag(flywheel, 'crank');
  for (const g of [crankGear, pulley, ...idlers.map((x) => x.gg), ...idlers.map((x) => x.gg.userData.stud), ...camGears.map((x) => x.gg)]) tag(g, 'timing');
  tag(arcs, 'tarrows');
  // each subsystem wears its own copy of every material, so one subsystem can be cut while the rest stays whole
  const SUBMAT = new Map();
  const CLONES = new Map(Object.values(M).map((m) => [m, []]));
  const meshes = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    meshes.push(m);
    if (!CLONES.has(m.material)) return;
    const key = `${m.userData.sub}|${m.material.uuid}`;
    let c = SUBMAT.get(key);
    if (!c) {
      c = m.material.clone();
      c.userData = {sub: m.userData.sub, side0: c.side};
      SUBMAT.set(key, c);
      CLONES.get(m.material).push(c);
    }
    m.material = c;
  });
  const each = (base, fn) => CLONES.get(base).forEach(fn);

  // the isolate fade: a see-through twin of every material, worn by the parts solo puts away while they go
  const GHOST = new Map(
    [...SUBMAT.values()].map((m) => {
      const g = m.clone();
      g.transparent = true;
      g.depthWrite = false;
      return [m, g];
    }),
  );
  root.traverse((m) => m.isMesh && (m.userData.mat0 = m.material));
  const ghosted = new Set();

  // section caps (opts.caps): every solid part gets two stencil twins that count its faces beyond the cut, and a
  // plane lying on the cut paints the cap colour wherever that count says the cut runs through metal
  let cap = null;
  const helpers = [];
  if (opts.caps) {
    const inc = THREE.IncrementWrapStencilOp;
    const dec = THREE.DecrementWrapStencilOp;
    const count = (side, op) =>
      new THREE.MeshBasicMaterial({side, colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op, clippingPlanes: [CLIP]});
    helpers.push(count(THREE.BackSide, inc), count(THREE.FrontSide, dec));
    const solid = new Set([M.black, M.blackMatte, M.steel, M.alu, M.bronze, M.ceramic]);
    const parts = [];
    root.traverse((m) => m.isMesh && solid.has(m.material) && parts.push(m));
    for (const m of parts) {
      for (const mat of helpers) {
        const h = new THREE.Mesh(m.geometry, mat);
        h.renderOrder = 1;
        m.add(h);
      }
    }
    const rep = THREE.ReplaceStencilOp;
    cap = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshStandardMaterial({color: opts.caps, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: rep, stencilZFail: rep, stencilZPass: rep}),
    );
    cap.renderOrder = 1.1;
    cap.onAfterRender = (r) => r.clearStencil();
    for (const mat of [...helpers, cap.material]) mat.visible = false;
  }
  // the cap lies on the cut, centred on the engine, facing the side that was cut away
  const C0 = new V3(0, 0.1, 0);
  const placeCap = () => {
    if (!cap) return;
    cap.position.copy(C0).addScaledVector(CLIP.normal, -CLIP.distanceToPoint(C0));
    cap.quaternion.setFromUnitVectors(new V3(0, 0, 1), tmp.copy(CLIP.normal).negate());
  };

  let cutNow = 'glass';
  let subCuts = new Map();
  // every subsystem has its own section plane, so each cut can sweep in on its own; the gas rides the block's
  const PLANES = Object.fromEntries([...SUBS, 'gas'].map((s) => [s, new THREE.Plane(new V3(0, 0, -1), 10)]));
  PLANES.gas = PLANES.block;
  const planeOf = (sub) => (cutNow === 'section' ? CLIP : subCuts.has(sub === 'gas' ? 'block' : sub) ? PLANES[sub] : null);
  // a material is cut when the whole engine is sectioned or its subsystem is; cut solids draw both faces
  const applyClip = () => {
    const set = (m, sub) => {
      const pl = planeOf(sub);
      if ((m.clippingPlanes?.[0] ?? null) === pl) return;
      m.clippingPlanes = pl ? [pl] : null;
      if (m.userData.side0 !== undefined) m.side = pl ? THREE.DoubleSide : m.userData.side0;
      m.needsUpdate = true;
    };
    for (const m of SUBMAT.values()) set(m, m.userData.sub);
    for (const [m, g] of GHOST) set(g, m.userData.sub);
    for (const c of cyl) set(c.charge.material, 'gas');
  };
  /** cut subsystems: a Map of name → the plane's z (world, metres); everything of that subsystem forward of it goes */
  const setSubCuts = (cuts) => {
    for (const [sub, z] of cuts) PLANES[sub].constant = z;
    const same = cuts.size === subCuts.size && [...cuts.keys()].every((x) => subCuts.has(x));
    subCuts = new Map(cuts);
    if (!same) applyClip();
  };
  const setCut = (mode, zWorld = 0, normal = Z_CUT) => {
    CLIP.normal.copy(normal);
    CLIP.constant = zWorld;
    placeCap();
    if (mode === cutNow) return;
    cutNow = mode;
    applyClip();
    if (cap) for (const mat of [...helpers, cap.material]) mat.visible = mode === 'section';
    if (lo) {
      // the low build has no caps: cut parts show their insides, so both faces draw while the section is on
      for (const m of [...Object.values(M), ...GHOST.values()]) m.side = mode === 'section' ? THREE.DoubleSide : THREE.FrontSide;
      return;
    }
    const solid = mode === 'solid';
    each(M.glass, (g) => {
      g.color.set(solid ? '#2b2d31' : '#ffffff');
      g.opacity = solid ? 0.94 : glassOpacity;
      g.depthWrite = solid;
    });
  };
  let glassOpacity = 0.16;
  const setRefract = (on) => {
    glassOpacity = on ? 0.16 : 0.05;
    each(M.glass, (g) => {
      g.envMapIntensity = on ? 1.6 : 0.3;
      if (cutNow !== 'solid') g.opacity = glassOpacity;
    });
  };
  /** ops: charge (0..1 visibility), arrows (0..1), solo (cylinder index or -1), glass (liner opacity), fire (0..1: with
   *  the charge off, the burn alone still lights the bore for the first 60° of every power stroke), fade (0..1, with
   *  solo: how far the rest has gone; 1, the default, hides it as before, below 1 it stays see-through), explode
   *  (0..1: the engine apart along its axes) */
  /** every mesh in its see-through twin (on) or back in its own material: used only to compile the twins up front */
  const forceGhost = (on) => {
    for (const m of meshes) {
      const g = GHOST.get(m.userData.mat0);
      if (g) m.material = on ? g : m.userData.mat0;
    }
  };
  const hidden = new Set();
  const update = (th, ops = {}) => {
    for (const m of ghosted) m.material = m.userData.mat0;
    ghosted.clear();
    for (const m of hidden) m.visible = true;
    hidden.clear();
    const solo = ops.solo ?? -1;
    const all = solo < 0;
    const aRest = all ? 1 : 1 - Math.min(1, Math.max(0, ops.fade ?? 1));
    // explode: each layer leaves on its own stretch of the move, the outermost first, so nothing passes through
    // anything on the way out or back in: the rocker cage, the camshaft, the head with its valves, the pistons with
    // their rods out along each bank; the sump, then the crank with its gear, pulley and flywheel down. The engine
    // rises with the sump so the dropped parts stay clear of the floor.
    const ex = ops.explode ?? 0;
    const lay = (a) => smoother((ex - a) / 0.45);
    const eSump = lay(0);
    const eCrank = lay(0.12);
    const DG = 390 * lay(0.25);
    const DC = 300 * lay(0.33);
    const DH = 200 * lay(0.42);
    const DP = 110 * lay(0.55);
    const DK = 110 * eCrank;
    const DS = 190 * eSump;
    root.position.y = 0.17 * eSump;
    pan.position.y = -92 - DS;
    rail.position.y = -68 - DS;

    const cAng = -th * D2R; // the crank turns clockwise seen from the front
    crank.rotation.z = 0;
    crank.position.y = -DK;
    for (const {w, p} of webs) w.rotation.z = -(th + PIN_PHASE[p]) * D2R;
    E.pinZ.forEach((z, p) => {
      const [x, y] = pinXY(p, th);
      pins[p].position.set(x, y - DK, z);
    });
    const chargeOn = ops.charge ?? 1;
    const arrowsOn = ops.arrows ?? 1;
    const fireOn = ops.fire ?? 0;
    CYL.forEach((cy, i) => {
      const B = BANK[cy.bank];
      const {s, P, pin} = piston(i, th);
      const pp = pist[i];
      pp.g.position.y = s + DP;
      // the rod: crank pin to piston pin
      const a = new V3(P[0], P[1], cy.z);
      const b = new V3(pin[0], pin[1], cy.z);
      tmp.subVectors(b, a);
      const len = tmp.length();
      pp.rod.position.copy(a).add(b).multiplyScalar(0.5);
      pp.rod.position.x += DP * B.b[0];
      pp.rod.position.y += DP * B.b[1];
      pp.rod.rotation.set(0, 0, Math.atan2(tmp.y, tmp.x) - Math.PI / 2);
      pp.beam.scale.y = len - 30;
      pp.big.position.y = -len / 2;
      pp.small.position.y = len / 2;
      // the charge column and its colour by stroke
      const ps = psi(cy.c, th);
      const crown = s + E.comp;
      const col = cyl[i];
      col.head.position.y = DH;
      col.cage.position.y = DG;
      col.charge.position.y = (crown + DECK) / 2;
      col.charge.scale.y = Math.max(1, DECK - crown);
      const key = chargeOf(ps);
      col.charge.material.color.copy(CHARGE_COL[key]);
      const glow = key === 2 ? Math.min(1, pressure(ps) / 40) : 0;
      col.charge.material.opacity = chargeOn * (key === 2 ? 0.35 + 0.45 * glow : key === 0 ? 0.32 : 0.22);
      col.charge.visible = chargeOn > 0.01;
      if (fireOn > 0 && chargeOn <= 0.01 && key === 2) {
        col.charge.material.opacity = fireOn * (0.35 + 0.45 * glow);
        col.charge.visible = true;
      }
      if (!all && i !== solo) col.charge.material.opacity *= aRest;
      if (ex > 0) col.charge.visible = false;
      // valves open by their lift, springs squeeze with them
      for (const v of col.valves) {
        const L = (v.kind === 'in' ? liftIn(ps) : liftEx(ps)) * VALVE.lift;
        v.vg.position.y = -L;
        v.spring.scale.y = (48 - L) / 48;
      }
      // the arrow: along the bore, the way the piston is heading, strongest mid-stroke
      const {s: s2} = piston(i, th + 2);
      const vel = s2 - s;
      pp.arrow.position.y = DECK - 70;
      pp.arrow.rotation.z = vel > 0 ? 0 : Math.PI;
      pp.arrow.scale.setScalar(arrowsOn * Math.min(1, Math.abs(vel) / 1.2));
      pp.arrow.visible = arrowsOn * Math.abs(vel) > 0.05;
    });
    // cams at half speed, gears in ratio, pulley and flywheel with the crank
    for (const c of cams) {
      const B = BANK[c.bank];
      c.g.position.set((E.camD + DC) * B.b[0], (E.camD + DC) * B.b[1], 0);
      c.g.rotation.z = cAng / 2;
    }
    crankGear.rotation.z = crankGear.userData.ph0 + cAng;
    crankGear.position.y = -DK;
    // each mesh reverses the sense and scales by the tooth ratio: idler −crank·24/40, cam +crank·24/48 = crank/2
    idlers.forEach(({gg}) => (gg.rotation.z = gg.userData.ph0 - cAng * (GEARS.crank / GEARS.idler)));
    camGears.forEach(({gg, bank}) => {
      gg.rotation.z = gg.userData.ph0 + cAng * (GEARS.crank / GEARS.cam);
      gg.position.set((E.camD + DC) * BANK[bank].b[0], (E.camD + DC) * BANK[bank].b[1], front);
    });
    pulley.rotation.z = cAng;
    pulley.position.set(0, -DK, front + 44 + 90 * eCrank);
    flywheel.rotation.z = cAng;
    flywheel.position.set(0, -DK, -290 - 90 * eCrank);
    arcs.rotation.z = cAng * 0.25;
    arcs.position.set(0, -DK, front + 66 + 90 * eCrank);

    // solo: one cylinder with its crank and cam, everything else away
    block.visible = all;
    for (const g of [crankGear, pulley, flywheel, arcs, ...idlers.map((x) => x.gg), ...camGears.map((x) => x.gg)]) g.visible = all;
    cyl.forEach((c, i) => {
      const on = all || i === solo;
      c.g.visible = on;
      pist[i].rod.visible = on;
    });
    for (const c of cams) c.g.visible = all || CYL[solo].bank === c.bank;
    const soloPin = all ? -1 : CYL[solo].pin;
    for (const {w, p} of webs) w.visible = all || p === soloPin;
    pins.forEach((m, p) => (m.visible = all || p === soloPin));
    for (const j of journals) j.visible = all;
    arcs.visible = all && (ops.arrows ?? 1) > 0.01;
    // while solo fades the rest (fade below 1), it stays in place in the see-through twins
    if (!all && aRest > 0.001) {
      const rest = [block, crankGear, pulley, flywheel, ...idlers.map((x) => x.gg), ...journals];
      cyl.forEach((c, i) => i !== solo && rest.push(c.g, pist[i].rod));
      for (const c of cams) if (CYL[solo].bank !== c.bank) rest.push(c.g);
      for (const {w, p} of webs) if (p !== soloPin) rest.push(w);
      pins.forEach((m, p) => p !== soloPin && rest.push(m));
      for (const [m, g] of GHOST) g.opacity = (m.transparent ? m.opacity : 1) * aRest;
      for (const o of rest) {
        o.visible = true;
        o.traverse((m) => {
          if (m.isMesh && GHOST.has(m.userData.mat0)) {
            m.material = GHOST.get(m.userData.mat0);
            ghosted.add(m);
          }
        });
      }
    }
    // focus: ops.focus = {from, to, k}, each state {sub, mode} or null. A state gives every subsystem an alpha (1 solid,
    // 0.12 a see-through ghost for 'isolate', 0 hidden for 'alone'; the subsystem itself and its companions stay 1), and
    // the frame blends from the old state's alphas to the new one's by k, so switching from one subsystem alone to
    // another never flashes the rest back on. The gas stays with the block and the pistons, the red arrows with the
    // parts they ride on.
    const F = ops.focus;
    if (F && (F.to || F.from)) {
      const k = Math.min(1, Math.max(0, F.k ?? 1));
      const mate = (sub, s) => s === sub || (s === 'gas' && (sub === 'block' || sub === 'pistons')) || (s === 'parrows' && sub === 'pistons') || (s === 'tarrows' && sub === 'timing');
      const target = (st, s) => (!st || mate(st.sub, s) ? 1 : st.mode === 'alone' ? 0 : 0.12);
      const alpha = (s) => target(F.from, s) + (target(F.to, s) - target(F.from, s)) * k;
      for (const [m, g] of GHOST) g.opacity = (m.transparent ? m.opacity : 1) * alpha(m.userData.sub);
      for (const m of meshes) {
        const s = m.userData.sub;
        if (!s || !m.visible) continue;
        const a = alpha(s);
        if (a >= 0.999) continue;
        if (s === 'gas') m.material.opacity *= a;
        if (a <= 0.002 || s === 'gas') {
          if (a <= 0.002) {
            m.visible = false;
            hidden.add(m);
          }
          continue;
        }
        if (GHOST.has(m.userData.mat0)) {
          m.material = GHOST.get(m.userData.mat0);
          ghosted.add(m);
        }
      }
    }
  };
  // the engine is modelled in mm; one world unit is a metre (the cap lives in world units, outside the root)
  root.scale.setScalar(0.001);
  return {root, update, M, cyl, pist, cams, crank, pulley, flywheel, crankGear, camGears, idlers, setCut, setSubCuts, setRefract, CLIP, cap, ghosted, meshes, forceGhost};
}
