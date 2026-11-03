// The four-stroke explorer's console, a fixed 1600 x 900 layout around the engine. Top left: the title, the spec line
// and the live engine speed, big. Left: the front-view schematic (the tracked pin's two cylinders redrawn in 2D, to
// scale, from kin.js), the subsystems (isolate · cut · alone for each), the transport. Right: the tracked cylinder's
// state, the valve lift over 720° and the pressure-volume loop, both with a cursor at the frame's crank angle; the
// camera, cutaway and overlay buttons. Bottom: the firing order (click to track). Callouts with thin leaders into the
// parts they name.
//
// update(s) redraws every live part from the frame's state: s.theta (crank angle), s.rpm, s.cyl (tracked), s.focus,
// s.cuts, the toggles. Every number on screen is computed from kin.js or from that state; none is typed in.
import {BANK, BANK_ANGLE, CAM_RATIO, camAngle, chargeOf, CYL, CYLS, DISP_L, E, FIRE_INTERVAL, GEARS, liftEx, liftIn, ORDER, piston, PIN_PHASE, pinXY, pistonFrac, pressure, psi, RPM, S_BDC, S_TDC, STROKE, STROKES, THROW_SPACING, VALVE, volume, bankXY} from './kin.js';
import {SUBS} from './engine.js';

export const C = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(248,248,249,.94)', red: '#d6182b', blue: '#3d8fe0', grey: '#5d6670', orange: '#f05a23', exh: '#8b8f95'};
export const CAMS = ['hero', 'front', 'side', 'top', 'valley'];
export const CAM_LABEL = {hero: 'HERO', front: 'FRONT', side: 'SIDE', top: 'TOP', valley: 'IN THE VALLEY'};
export const CUTS = ['glass', 'section', 'solid'];
export const OVERLAYS = ['callouts', 'charge', 'arrows', 'refract', 'charts'];
export const SUB_LABEL = {block: 'BLOCK & LINERS', crank: 'CRANKSHAFT', pistons: 'PISTONS & RODS', valvetrain: 'VALVETRAIN', heads: 'HEADS & PLUGS', timing: 'TIMING GEARS'};
export const MODES = ['isolate', 'cut', 'alone'];
/** the step buttons' crank increment, degrees (a control setting, shown on its buttons) */
export const STEP = 15;
const CHARGE_COL = [C.blue, C.grey, C.orange, C.exh];
const CHARGE_NAME = ['AIR & FUEL', 'COMPRESSED', 'COMBUSTION', 'EXHAUST'];
const mod = (a, m) => ((a % m) + m) % m;
// the chart scales, from the model: peak cylinder pressure rounded up to the next 10 bar
const P_PEAK = Math.max(...Array.from({length: 1441}, (_, i) => pressure(i / 2)));
const P_MAX = Math.ceil(P_PEAK / 10) * 10;
const STROKE_DEG = 720 / STROKES.length;
const f1 = (x) => x.toFixed(1);

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${C.panel};border:1px solid ${C.line};box-shadow:0 1px 2px rgba(20,22,26,.04)}
.cp{font-size:9.6px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap}
.mu{color:${C.mute}}
.tb{position:absolute;height:19px;padding:0 7px;display:flex;align-items:center;justify-content:center;font-size:8.8px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${C.line};background:#fff;color:${C.ink};white-space:nowrap}
.sb{position:absolute;height:18px;display:flex;align-items:center;justify-content:center;font-size:7.8px;font-weight:700;letter-spacing:.8px;border:1px solid ${C.line};background:#fff;color:${C.ink}}
.call{position:absolute;white-space:nowrap}
.call b{display:block;font-size:11.5px;font-weight:600;letter-spacing:.1px}
.call span{display:block;font-size:8.6px;font-weight:500;letter-spacing:1.4px;color:${C.mute};text-transform:uppercase;margin-top:2px}
.cur{position:absolute;left:0;top:0;z-index:50;filter:drop-shadow(0 1px 2px rgba(0,0,0,.3))}
.ring{position:absolute;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:1.5px solid ${C.red};opacity:0;z-index:49}
`;
const el = (h) => {
  const d = document.createElement('div');
  d.innerHTML = h.trim();
  return d.firstElementChild;
};

export function createConsole(app) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const ui = el(`<div class="ui"></div>`);
  app.appendChild(ui);
  const add = (h) => {
    const n = el(h);
    ui.appendChild(n);
    return n;
  };
  const btn = {};

  // ------------------------------------------------------------ title, spec line, engine speed
  // a pale ground under the title block and the firing order, which float over the engine in close views
  add(`<div class="pn" style="left:24px;top:24px;width:428px;height:206px;background:rgba(248,248,249,.82);border-color:transparent;box-shadow:none"></div>`);
  add(`<div class="pn" style="left:596px;top:786px;width:408px;height:108px;background:rgba(248,248,249,.82);border-color:transparent;box-shadow:none"></div>`);
  add(`<div style="position:absolute;left:35px;top:33px;width:43px;height:3px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:35px;top:47px;font-size:24px;font-weight:700;letter-spacing:-.2px">V${CYLS} <span style="color:${C.red}">·</span> Four-Stroke</div>`);
  add(`<div class="cp" style="position:absolute;left:35px;top:81px;font-weight:500;letter-spacing:1.7px;font-size:9.4px">${BANK_ANGLE}° V &nbsp;•&nbsp; ${THROW_SPACING}° CROSS-PLANE &nbsp;•&nbsp; FIRING ${ORDER.join('-')} &nbsp;•&nbsp; ${DISP_L.toFixed(1)} L</div>`);
  const rpmBig = add(`<div style="position:absolute;left:33px;top:103px;font-size:56px;font-weight:800;letter-spacing:-3.2px;color:${C.red};line-height:1"></div>`);
  const BAR = {x: 35, w: 247};
  const bx = (r) => BAR.x + (r / RPM.max) * BAR.w;
  add(`<div class="cp" style="position:absolute;right:${1600 - (BAR.x + BAR.w)}px;top:141px;font-size:11px;font-weight:500;letter-spacing:0">${RPM.max}</div>`);
  add(`<div style="position:absolute;left:${BAR.x}px;top:174px;width:${BAR.w}px;height:9px;background:#e6e7e9"></div>`);
  const rpmFill = add(`<div style="position:absolute;left:${BAR.x}px;top:174px;height:9px;background:${C.red}"></div>`);
  add(`<div style="position:absolute;left:${bx(RPM.idle) - 0.5}px;top:170px;width:1px;height:17px;background:${C.ink}"></div>`);
  add(`<div class="cp mu" style="position:absolute;left:${BAR.x}px;top:188px;font-size:9px;font-weight:500">0</div>`);
  add(`<div class="cp mu" style="position:absolute;left:${bx(RPM.idle) - 10}px;top:188px;font-size:9px;font-weight:500">IDLE ${RPM.idle}</div>`);
  add(`<div class="cp" style="position:absolute;right:${1600 - (BAR.x + BAR.w)}px;top:188px;font-size:9px;font-weight:500">REV / MIN</div>`);
  add(`<div style="position:absolute;left:35px;top:206px;width:247px;height:1px;background:${C.faint}"></div>`);
  const crankLine = add(`<div style="position:absolute;left:35px;top:212px;font-size:12px;font-weight:500"></div>`);

  // ------------------------------------------------------------ schematic: the tracked pin's two cylinders, front view
  add(`<div class="pn" style="left:35px;top:236px;width:247px;height:268px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:247px;font-weight:700">FRONT VIEW</div>`);
  const scPin = add(`<div class="cp mu" style="position:absolute;right:${1600 - 271}px;top:247px;font-weight:500"></div>`);
  const sc = add(`<svg style="position:absolute;left:46px;top:262px" width="226" height="186"></svg>`);
  add(`<div style="position:absolute;left:46px;top:452px;width:226px;height:1px;background:${C.line}"></div>`);
  add(`<div style="position:absolute;left:46px;top:458px;font-size:9.5px;color:${C.mute};font-family:'JetBrains Mono',monospace">s = r·cos φ + √(L² − r² sin²φ)</div>`);
  add(`<div style="position:absolute;left:46px;top:472px;font-size:9.5px;color:${C.mute}">r <b style="color:${C.ink}">${E.r}</b> · L <b style="color:${C.ink}">${E.rod}</b> · bore <b style="color:${C.ink}">${E.bore}</b> · stroke <b style="color:${C.ink}">${STROKE}</b> mm</div>`);
  const scLive = add(`<div style="position:absolute;left:46px;top:486px;font-size:9.5px;color:${C.mute}"></div>`);

  // ------------------------------------------------------------ subsystems: isolate · cut · alone
  add(`<div class="pn" style="left:35px;top:512px;width:259px;height:254px"></div>`);
  add(`<div class="cp" style="position:absolute;left:46px;top:523px;font-weight:700">SUBSYSTEMS</div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 284}px;top:523px;font-weight:500;font-size:8.6px">ISOLATE · CUT · ALONE</div>`);
  const subVal = {};
  const SB = {isolate: [152, 46], cut: [202, 30], alone: [236, 48]};
  SUBS.forEach((k, i) => {
    const y = 543 + i * 36;
    if (i) add(`<div style="position:absolute;left:46px;top:${y - 5}px;width:238px;height:1px;background:${C.line}"></div>`);
    add(`<div style="position:absolute;left:46px;top:${y}px;font-size:10.5px;font-weight:600;letter-spacing:.2px">${SUB_LABEL[k].charAt(0)}${SUB_LABEL[k].slice(1).toLowerCase()}</div>`);
    subVal[k] = add(`<div class="cp mu" style="position:absolute;left:46px;top:${y + 21}px;font-size:7.6px;font-weight:500;letter-spacing:1px"></div>`);
    for (const m of MODES) btn[`${m}:${k}`] = add(`<div class="sb" style="left:${SB[m][0]}px;top:${y + 2}px;width:${SB[m][1]}px">${m.toUpperCase()}</div>`);
  });

  // ------------------------------------------------------------ transport
  add(`<div class="pn" style="left:35px;top:774px;width:259px;height:111px"></div>`);
  btn.pause = add(`<div class="tb" style="left:45px;top:782px;width:99px;height:26px;background:${C.red};color:#fff;border-color:${C.red};font-size:9.6px">❚❚ &nbsp;PAUSE</div>`);
  btn.back = add(`<div class="tb" style="left:149px;top:782px;width:66px;height:26px;font-size:9.6px">−${STEP}°</div>`);
  btn.fwd = add(`<div class="tb" style="left:219px;top:782px;width:66px;height:26px;font-size:9.6px">+${STEP}°</div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:818px;font-weight:500">ENGINE SPEED</div>`);
  const speedVal = add(`<div class="cp" style="position:absolute;right:${1600 - 284}px;top:818px;font-weight:700"></div>`);
  const SL = {x: 46, w: 238};
  add(`<div style="position:absolute;left:${SL.x}px;top:836px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  const speedKnob = add(`<div style="position:absolute;top:831px;width:9px;height:11px;margin-left:-4.5px;background:${C.red}"></div>`);
  add(`<div class="cp" style="position:absolute;left:45px;top:851px;font-weight:500">PLAYBACK</div>`);
  const playVal = add(`<div class="cp" style="position:absolute;right:${1600 - 284}px;top:851px;font-weight:700"></div>`);
  add(`<div style="position:absolute;left:${SL.x}px;top:869px;width:${SL.w}px;height:2px;background:#e1e3e6"></div>`);
  const playKnob = add(`<div style="position:absolute;top:864px;width:9px;height:11px;margin-left:-4.5px;background:${C.red}"></div>`);

  // ------------------------------------------------------------ legend
  add(`<div class="cp" style="position:absolute;left:598px;top:36px;display:flex;gap:16px;font-weight:500;font-size:9.6px">
    ${CHARGE_NAME.map((n, i) => `<span><i style="display:inline-block;width:15px;height:2.4px;background:${CHARGE_COL[i]};vertical-align:middle;margin-right:6px"></i>${n}</span>`).join('')}</div>`);

  // ------------------------------------------------------------ cylinder state
  add(`<div class="pn" style="left:1318px;top:36px;width:245px;height:209px"></div>`);
  const cylName = add(`<div class="cp" style="position:absolute;left:1329px;top:47px;font-weight:500"></div>`);
  const cylCrank = add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:47px;font-weight:500"></div>`);
  const strokeBig = add(`<div style="position:absolute;left:1329px;top:61px;font-size:24px;font-weight:700"></div>`);
  const strokeList = add(`<div style="position:absolute;left:1329px;top:97px"></div>`);
  add(`<div style="position:absolute;left:1329px;top:165px;width:224px;height:1px;background:${C.line}"></div>`);
  const barBig = add(`<div style="position:absolute;left:1328px;top:173px;font-size:36px;font-weight:800;letter-spacing:-1.6px;color:${C.red};line-height:1"></div>`);
  const barUnit = add(`<div style="position:absolute;top:177px;font-size:10.5px;font-weight:500;letter-spacing:1px;line-height:1.35">BAR<br><span style="color:${C.mute};letter-spacing:1.5px">CHAMBER PRESSURE</span></div>`);
  add(`<div style="position:absolute;left:1329px;top:228px;width:224px;height:5px;background:#e6e7e9"></div>`);
  const barFill = add(`<div style="position:absolute;left:1329px;top:228px;height:5px;background:${C.red}"></div>`);
  add(`<div class="cp mu" style="position:absolute;right:${1600 - 1552}px;top:235px;font-size:7.6px;font-weight:500;letter-spacing:1px">PEAK ${f1(P_PEAK)} BAR</div>`);

  // ------------------------------------------------------------ valve lift over 720°
  add(`<div class="pn" data-g="charts" style="left:1318px;top:252px;width:245px;height:184px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:263px;font-weight:700">VALVE LIFT · 720°</div>`);
  const vtCyl = add(`<div class="cp mu" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:263px;font-weight:500"></div>`);
  const vtLeg = add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:280px;font-weight:500;font-size:9px"></div>`);
  const vt = add(`<svg data-g="charts" style="position:absolute;left:1326px;top:296px" width="232" height="135"></svg>`);

  // ------------------------------------------------------------ pressure-volume loop
  add(`<div class="pn" data-g="charts" style="left:1318px;top:443px;width:245px;height:150px"></div>`);
  add(`<div class="cp" data-g="charts" style="position:absolute;left:1329px;top:455px;font-weight:700">PRESSURE · VOLUME</div>`);
  const idCyl = add(`<div class="cp mu" data-g="charts" style="position:absolute;right:${1600 - 1552}px;top:455px;font-weight:500"></div>`);
  const id = add(`<svg data-g="charts" style="position:absolute;left:1326px;top:470px" width="232" height="120"></svg>`);

  // ------------------------------------------------------------ camera, cutaway, overlays
  add(`<div class="pn" style="left:1296px;top:690px;width:268px;height:195px"></div>`);
  let gy = 698;
  const group = (title, keys, labels) => {
    add(`<div class="cp mu" style="position:absolute;left:1305px;top:${gy}px;font-weight:500">${title}</div>`);
    let x = 1305;
    let yy = gy + 15;
    keys.forEach((k) => {
      const w = Math.round(labels[k].length * 6.2 + 14);
      if (x + w > 1556) {
        x = 1305;
        yy += 23;
      }
      btn[k] = add(`<div class="tb" style="left:${x}px;top:${yy}px;width:${w}px">${labels[k]}</div>`);
      x += w + 4;
    });
    gy = yy + 30;
  };
  const UP = Object.fromEntries([...CUTS, ...OVERLAYS].map((k) => [k, k.toUpperCase()]));
  group('CAMERA', CAMS, CAM_LABEL);
  group('CUTAWAY · ALL LINERS', CUTS, UP);
  group('OVERLAYS', OVERLAYS, UP);

  // ------------------------------------------------------------ firing order
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:795px;text-align:center;font-weight:500"><span style="color:${C.ink}">FIRING ORDER</span> &nbsp;— &nbsp;CLICK TO TRACK</div>`);
  const FO = {x: 800 - (ORDER.length * 40) / 2, y: 815};
  const fo = add(`<svg style="position:absolute;left:${FO.x}px;top:${FO.y}px" width="${ORDER.length * 40}" height="34"></svg>`);
  add(`<div class="cp mu" style="position:absolute;left:0;right:0;top:852px;text-align:center;font-weight:500">ONE POWER STROKE EVERY ${FIRE_INTERVAL}° OF CRANK ROTATION</div>`);
  add(`<div class="cp" style="position:absolute;left:0;right:0;top:874px;text-align:center;font-weight:500;color:${C.faint}">DRAG TO ORBIT &nbsp;·&nbsp; SCROLL TO ZOOM &nbsp;·&nbsp; H HIDES THE OVERLAY</div>`);

  // ------------------------------------------------------------ callouts, the pointer
  const callSvg = add(`<svg data-callouts style="position:absolute;inset:0;overflow:visible" width="1600" height="900"></svg>`);
  const callG = add(`<div data-callouts style="position:absolute;inset:0"></div>`);
  const ring = add(`<div class="ring"></div>`);
  const cur = add(`<div class="cur"><svg width="22" height="22" viewBox="0 0 34 34"><path d="M4 3 L30 13.5 L17.5 17.5 L13.5 30 Z" fill="#111" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg></div>`);
  const centre = (n) => {
    const r = n.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const foSpot = (i) => [FO.x + 20 + i * 40, FO.y + 17];
  const spots = Object.fromEntries(Object.entries(btn).map(([k, n]) => [k, centre(n)]));
  const knobX = (v) => SL.x + v * SL.w;
  const pointer = (c) => {
    cur.style.display = c.x < 0 ? 'none' : 'block';
    cur.style.transform = `translate(${(c.x - 3).toFixed(2)}px, ${(c.y - 2).toFixed(2)}px) scale(${c.press ? 0.88 : 1})`;
    ring.style.left = `${c.ringX}px`;
    ring.style.top = `${c.ringY}px`;
    ring.style.opacity = String(c.ring * 0.85);
    ring.style.transform = `scale(${(0.35 + 0.9 * (1 - c.ring)).toFixed(3)})`;
  };
  const txt = (x, y, t, a = 'start', col = C.mute, size = 7) => `<text x="${x}" y="${y}" font-size="${size}" letter-spacing=".8" text-anchor="${a}" fill="${col}">${t}</text>`;
  const lit = (n, on, col) => {
    n.style.background = on ? col : '#fff';
    n.style.color = on ? '#fff' : C.ink;
    n.style.borderColor = on ? col : C.line;
  };

  return {
    spots,
    foSpot,
    speedKnob: (v) => [knobX(v), 836],
    playKnob: (v) => [knobX(v), 869],
    btn,
    root: ui,
    update(s) {
      const th = s.theta;
      const ps = psi(s.cyl, th);
      const ci = s.cyl - 1;
      rpmBig.textContent = Math.round(s.rpm);
      rpmFill.style.width = `${((s.rpm / RPM.max) * BAR.w).toFixed(1)}px`;
      crankLine.innerHTML = `Crank <b>${Math.round(mod(th, 360))}°</b> <span style="color:${C.mute}">·</span> cams <b>${Math.round(mod(camAngle(th), 360))}°</b>`;
      speedVal.textContent = `${Math.round(s.rpm)} RPM`;
      speedKnob.style.left = `${knobX(s.rpm / RPM.max).toFixed(1)}px`;
      playVal.textContent = s.playText;
      playKnob.style.left = `${knobX(s.playK).toFixed(1)}px`;
      btn.pause.innerHTML = s.paused ? '▶ &nbsp;PLAY' : '❚❚ &nbsp;PAUSE';

      // the schematic: the two cylinders on the tracked cylinder's crank pin, seen from the front (+x to the right),
      // drawn from kin.js at 0.47 px per mm: bores, liners' tops, pistons from the exact slider-crank, rods from pin
      // to pin, the charge coloured by its stroke, both valves at their lift, all four throws, the tracked one in red
      {
        const k = 0.47;
        const ox = 113;
        const oy = 130;
        const P = ([x, y]) => [ox + x * k, oy - y * k];
        const pt = (p) => P(p).map(f1).join(',');
        const poly = (pts, attr) => `<polygon points="${pts.map(pt).join(' ')}" ${attr}/>`;
        const cyPin = CYL[ci].pin;
        const pair = CYL.map((c, i) => i).filter((i) => CYL[i].pin === cyPin);
        scPin.innerHTML = `PIN <b style="color:${C.ink}">${cyPin + 1}</b> · CYL ${pair.map((i) => CYL[i].c).join(' & ')}`;
        let h = '';
        for (const bank of ['R', 'L']) h += txt(bank === 'L' ? 224 : 2, 9, `${bank} BANK`, bank === 'L' ? 'end' : 'start');
        const hb = E.bore / 2;
        for (const i of pair) {
          const cy = CYL[i];
          const B = cy.bank;
          const c = cy.c;
          const p = psi(c, th);
          const {s: sp, P: pin, pin: pp} = piston(i, th);
          const crown = sp + E.comp;
          // bore walls and the head
          for (const w of [-hb - 3, hb + 3]) h += `<line x1="${P(bankXY(B, w, S_BDC - E.comp))[0].toFixed(1)}" y1="${P(bankXY(B, w, S_BDC - E.comp))[1].toFixed(1)}" x2="${P(bankXY(B, w, E.deck))[0].toFixed(1)}" y2="${P(bankXY(B, w, E.deck))[1].toFixed(1)}" stroke="${C.ink}" stroke-width="1.1"/>`;
          h += poly([bankXY(B, -hb - 10, E.deck), bankXY(B, hb + 10, E.deck), bankXY(B, hb + 6, E.deck + 30), bankXY(B, -hb - 6, E.deck + 30)], `fill="#fff" stroke="${C.ink}" stroke-width="1.1"`);
          // the charge between the crown and the head
          const key = chargeOf(p);
          h += poly([bankXY(B, -hb, crown), bankXY(B, hb, crown), bankXY(B, hb, E.deck), bankXY(B, -hb, E.deck)], `fill="${CHARGE_COL[key]}" fill-opacity="${key === 2 ? 0.55 : 0.28}" stroke="none"`);
          // both valves sit on the bore's centre line, one behind the other along the crank, so from the front they
          // overlap: each is drawn as half of the shared face, intake (blue) and exhaust (orange), down by its lift
          for (const [w0, w1, L, col] of [[-E.valve.face, 0, liftIn(p), C.blue], [0, E.valve.face, liftEx(p), C.orange]]) {
            const d = E.deck - E.valve.t / 2 - L * VALVE.lift;
            h += `<line x1="${P(bankXY(B, w0, d))[0].toFixed(1)}" y1="${P(bankXY(B, w0, d))[1].toFixed(1)}" x2="${P(bankXY(B, w1, d))[0].toFixed(1)}" y2="${P(bankXY(B, w1, d))[1].toFixed(1)}" stroke="${col}" stroke-width="2.2"/>`;
          }
          // the piston and its pin
          h += poly([bankXY(B, -hb + 1.5, crown), bankXY(B, hb - 1.5, crown), bankXY(B, hb - 1.5, crown - E.pistonH), bankXY(B, -hb + 1.5, crown - E.pistonH)], `fill="#f4f4f5" stroke="${c === s.cyl ? C.red : C.ink}" stroke-width="${c === s.cyl ? 1.6 : 1.1}"`);
          // the rod: crank pin to piston pin
          h += `<line x1="${P(pin)[0].toFixed(1)}" y1="${P(pin)[1].toFixed(1)}" x2="${P(pp)[0].toFixed(1)}" y2="${P(pp)[1].toFixed(1)}" stroke="${C.ink}" stroke-width="3"/>`;
          h += `<circle cx="${P(pp)[0].toFixed(1)}" cy="${P(pp)[1].toFixed(1)}" r="2.6" fill="#fff" stroke="${C.ink}" stroke-width="1.2"/>`;
          // cylinder number above its head
          const [nx, ny] = P(bankXY(B, 0, E.deck + 48));
          h += txt(nx.toFixed(1), ny.toFixed(1), String(c), 'middle', c === s.cyl ? C.red : C.ink, 9);
        }
        // the crank: its circle, all four throws (faint), the tracked pin's throw in red
        h += `<circle cx="${ox}" cy="${oy}" r="${(E.r * k).toFixed(1)}" fill="none" stroke="${C.faint}" stroke-dasharray="2 2"/>`;
        PIN_PHASE.forEach((_, pIdx) => {
          const [x, y] = P(pinXY(pIdx, th));
          const on = pIdx === cyPin;
          h += `<line x1="${ox}" y1="${oy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${on ? C.red : C.faint}" stroke-width="${on ? 2.4 : 1.4}"/>`;
          h += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 3.6 : 2.4}" fill="${on ? C.red : '#fff'}" stroke="${on ? C.red : C.faint}"/>`;
        });
        h += `<circle cx="${ox}" cy="${oy}" r="3.4" fill="#fff" stroke="${C.ink}" stroke-width="1.3"/>`;
        h += txt(2, 182, `TO SCALE · ${k} PX / MM`);
        sc.innerHTML = h;
        const sNow = (S_TDC - piston(ci, th).s).toFixed(1);
        scLive.innerHTML = `cyl ${s.cyl}: φ <b style="color:${C.ink}">${Math.round(mod(ps, 360))}°</b> after TDC · <b style="color:${C.ink}">${sNow}</b> mm down`;
      }

      // subsystems: each row's live value and its three buttons
      {
        const p = pressure(ps);
        const vals = {
          block: `BORE ${E.bore} MM · ${CYLS} LINERS`,
          crank: `${Math.round(mod(th, 360))}° · ${PIN_PHASE.length} THROWS AT ${THROW_SPACING}°`,
          pistons: `CYL ${s.cyl} · ${(pistonFrac(ps) * STROKE).toFixed(1)} MM DOWN`,
          valvetrain: `CAM ${Math.round(mod(camAngle(th), 360))}° · IN ${(liftIn(ps) * VALVE.lift).toFixed(1)} · EX ${(liftEx(ps) * VALVE.lift).toFixed(1)} MM`,
          heads: `CYL ${s.cyl} · ${p < 10 ? p.toFixed(1) : Math.round(p)} BAR`,
          timing: `${GEARS.crank} : ${GEARS.idler} : ${GEARS.cam} · CAMS ×${CAM_RATIO}`,
        };
        for (const k of SUBS) {
          subVal[k].textContent = vals[k];
          lit(btn[`isolate:${k}`], s.focus?.sub === k && s.focus.mode === 'isolate', C.red);
          lit(btn[`alone:${k}`], s.focus?.sub === k && s.focus.mode === 'alone', C.red);
          lit(btn[`cut:${k}`], s.cuts.has(k), C.ink);
        }
      }

      // cylinder state
      const stroke = STROKES[Math.floor(mod(ps, 720) / STROKE_DEG)];
      cylName.innerHTML = `CYLINDER <b>${s.cyl}</b>`;
      cylCrank.innerHTML = `<b style="color:${C.ink}">${Math.round(mod(ps, 720))}°</b> OF 720`;
      strokeBig.textContent = stroke.charAt(0) + stroke.slice(1).toLowerCase();
      strokeBig.style.color = stroke === 'POWER' ? C.red : C.ink;
      const cycle = [...STROKES.slice(2), ...STROKES.slice(0, 2)]; // intake, compression, power, exhaust
      strokeList.innerHTML = cycle.map((n) => `<div class="cp" style="height:16.5px;display:flex;align-items:center;gap:10px;font-weight:500;color:${n === stroke ? C.ink : C.mute}"><i style="display:block;width:31px;height:2px;background:${n === stroke ? C.red : C.line}"></i>${n}</div>`).join('');
      const bar = pressure(ps);
      barBig.textContent = bar < 10 ? bar.toFixed(1) : Math.round(bar);
      barUnit.style.left = `${1334 + barBig.getBoundingClientRect().width + 8}px`;
      barFill.style.width = `${Math.min(224, (bar / P_MAX) * 224).toFixed(1)}px`;

      // valve lift over the 720° cycle, in millimetres; the piston's travel behind it; a cursor at the cylinder's phase
      {
        vtCyl.innerHTML = `CYL <b style="color:${C.ink}">${s.cyl}</b>`;
        const W = 232;
        const X = (d) => 26 + (d / 720) * (W - 34);
        const Y = (mm) => 108 - (mm / VALVE.lift) * 92;
        let h = txt(2, 12, 'mm', 'start', C.mute, 6.5);
        for (const v of [0, VALVE.lift / 2, VALVE.lift]) h += txt(22, (Y(v) + 2).toFixed(1), String(+v.toFixed(1)), 'end', C.mute, 6.5);
        STROKES.forEach((n, i) => (h += txt(X(i * STROKE_DEG + STROKE_DEG / 2), 10, n === 'COMPRESSION' ? 'COMPR' : n, 'middle', C.mute, 6.2)));
        const seg = Math.floor(mod(ps, 720) / STROKE_DEG);
        h += `<rect x="${X(seg * STROKE_DEG)}" y="${Y(VALVE.lift)}" width="${X(STROKE_DEG) - X(0)}" height="92" fill="${STROKES[seg] === 'POWER' ? 'rgba(214,24,43,.1)' : 'rgba(20,22,26,.05)'}"/>`;
        for (let i = 1; i < STROKES.length; i++) h += `<line x1="${X(i * STROKE_DEG)}" x2="${X(i * STROKE_DEG)}" y1="${Y(VALVE.lift)}" y2="${Y(0)}" stroke="${C.line}" stroke-width=".8"/>`;
        h += `<line x1="${X(0)}" x2="${X(720)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
        const curve = (fn, col, w, dash = '') => {
          let p = '';
          for (let d = 0; d <= 720; d += 4) p += `${d ? 'L' : 'M'}${X(d).toFixed(1)} ${Y(fn(d)).toFixed(1)}`;
          return `<path d="${p}" fill="none" stroke="${col}" stroke-width="${w}" ${dash}/>`;
        };
        h += curve((d) => (1 - pistonFrac(d)) * VALVE.lift, C.faint, 1.1, 'stroke-dasharray="3 2"');
        h += curve((d) => liftEx(d) * VALVE.lift, C.orange, 1.6) + curve((d) => liftIn(d) * VALVE.lift, C.blue, 1.6);
        const cx = X(mod(ps, 720));
        h += `<line x1="${cx}" x2="${cx}" y1="${Y(VALVE.lift) - 4}" y2="${Y(0)}" stroke="${C.red}" stroke-width="1.4"/>`;
        h += `<circle cx="${cx}" cy="${Y(liftIn(ps) * VALVE.lift)}" r="2.4" fill="${C.blue}"/><circle cx="${cx}" cy="${Y(liftEx(ps) * VALVE.lift)}" r="2.4" fill="${C.orange}"/>`;
        for (let i = 0; i <= STROKES.length; i++) h += txt(X(i * STROKE_DEG), Y(0) + 10, String(i * STROKE_DEG), 'middle', C.mute, 6.5);
        h += txt(X(720), Y(0) + 20, 'CRANK ° AFTER FIRING TDC', 'end', C.mute, 6.2);
        vt.innerHTML = h;
        vtLeg.innerHTML = `<span style="color:${C.blue}">—</span> IN <b>${(liftIn(ps) * VALVE.lift).toFixed(1)}</b> &nbsp; <span style="color:${C.orange}">—</span> EX <b>${(liftEx(ps) * VALVE.lift).toFixed(1)}</b> &nbsp; <span style="color:${C.mute}">┄</span> PISTON <b>${Math.round((1 - pistonFrac(ps)) * 100)}</b>%`;
      }
      // the pressure-volume loop of the tracked cylinder, the dot where it is now
      {
        idCyl.innerHTML = `CYL <b style="color:${C.ink}">${s.cyl}</b>`;
        const W = 232;
        const X = (v) => 22 + ((v - 1) / (E.cr - 1)) * (W - 34);
        const Y = (p) => 98 - Math.min(1, p / P_MAX) * 82;
        let loop = '';
        for (let d = 0; d <= 720; d += 3) loop += `${d ? 'L' : 'M'}${X(volume(d)).toFixed(1)} ${Y(pressure(d)).toFixed(1)}`;
        let h = txt(2, 12, 'bar', 'start', C.mute, 6.5);
        for (const v of [0, P_MAX / 2, P_MAX]) h += txt(17, (Y(v) + 2).toFixed(1), String(v), 'end', C.mute, 6.5);
        h += `<line x1="${X(1)}" x2="${X(E.cr)}" y1="${Y(0)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/><line x1="${X(1)}" x2="${X(1)}" y1="${Y(P_MAX)}" y2="${Y(0)}" stroke="${C.ink}" stroke-width=".8"/>`;
        h += `<path d="${loop} Z" fill="rgba(214,24,43,.12)" stroke="${C.ink}" stroke-width="1.3"/>`;
        // the part of the loop the cylinder has drawn this stroke, in its charge colour
        let trail = '';
        const seg0 = Math.floor(mod(ps, 720) / STROKE_DEG) * STROKE_DEG;
        for (let d = seg0; d <= mod(ps, 720); d += 2) trail += `${d === seg0 ? 'M' : 'L'}${X(volume(d)).toFixed(1)} ${Y(pressure(d)).toFixed(1)}`;
        if (trail) h += `<path d="${trail}" fill="none" stroke="${CHARGE_COL[chargeOf(ps)]}" stroke-width="2.2"/>`;
        h += `<circle cx="${X(volume(ps)).toFixed(1)}" cy="${Y(pressure(ps)).toFixed(1)}" r="3.2" fill="${C.red}"/>`;
        h += txt(X(1), Y(0) + 10, 'TDC', 'start', C.mute, 6.2) + txt(X(E.cr), Y(0) + 10, 'BDC', 'end', C.mute, 6.2) + txt(X(E.cr), Y(0) + 19, `VOLUME ×VC · 1 → ${E.cr}`, 'end', C.mute, 6);
        id.innerHTML = h;
      }

      // firing order: the tracked cylinder ringed, the one firing now lit
      {
        let h = '';
        ORDER.forEach((c, i) => {
          const x = 20 + i * 40;
          if (i) h += `<line x1="${x - 28}" x2="${x - 12}" y1="17" y2="17" stroke="${C.faint}"/>`;
          const firing = c === s.firing;
          const tracked = c === s.cyl;
          h += `<circle cx="${x}" cy="17" r="11.5" fill="${firing ? 'rgba(214,24,43,.55)' : '#fff'}" stroke="${tracked ? C.red : C.faint}" stroke-width="${tracked ? 1.8 : 1}"/>`;
          if (tracked) h += `<circle cx="${x}" cy="17" r="15" fill="none" stroke="${C.red}" stroke-width=".8" opacity=".55"/>`;
          h += `<text x="${x}" y="20.5" font-size="10" text-anchor="middle" font-weight="600" fill="${firing ? '#fff' : C.ink}">${c}</text>`;
        });
        fo.innerHTML = h;
      }

      // toggles
      for (const k of CAMS) lit(btn[k], s.cam === k, C.ink);
      for (const k of CUTS) lit(btn[k], s.cut === k, C.ink);
      for (const k of OVERLAYS) lit(btn[k], !!s.overlays[k], C.red);

      // callouts: a label, a thin leader to its point in the engine
      let lh = '';
      let ch = '';
      for (const c of s.callouts) {
        if (c.o < 0.02 || !c.at) continue;
        const [ax, ay] = c.at;
        const [lx, ly] = c.label;
        const end = c.w ? (lx > ax ? lx : lx + c.w) : lx;
        lh += `<polyline points="${ax.toFixed(1)},${ay.toFixed(1)} ${end.toFixed(1)},${(ly + 16).toFixed(1)}${c.w ? ` ${(end === lx ? lx + c.w : lx).toFixed(1)},${(ly + 16).toFixed(1)}` : ''}" fill="none" stroke="${C.mute}" stroke-width=".8" opacity="${c.o.toFixed(2)}"/>`;
        if (c.w) lh += `<circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="2" fill="${C.red}" opacity="${c.o.toFixed(2)}"/>`;
        if (c.name) ch += `<div class="call" style="left:${lx.toFixed(1)}px;top:${(ly - 10).toFixed(1)}px;opacity:${c.o.toFixed(2)}"><b>${c.name}</b><span>${c.sub}</span></div>`;
      }
      callSvg.innerHTML = lh;
      callG.innerHTML = ch;
      pointer(s.cursor);
    },
    pointer,
  };
}
