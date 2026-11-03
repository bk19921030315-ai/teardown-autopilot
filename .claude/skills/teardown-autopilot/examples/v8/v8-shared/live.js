// The V8 as a page you drive: the film's engine and console, run in real time. Five camera views, the cutaway of
// all liners (glass, section through the tracked cylinder, solid), the overlays (callouts, charge, arrows, refraction,
// charts), and for each subsystem ISOLATE (the rest goes see-through), CUT (this subsystem sectioned at the tracked
// cylinder) and ALONE (the rest hidden). The firing order picks the tracked cylinder; PAUSE and the step buttons, the
// engine speed and playback sliders, an orbit you drag, a zoom on the wheel, H to hide the console. Left alone it plays
// the film's script as an auto tour with the operator's cursor, looped; a click, drag, wheel or key hands control to
// the visitor, 25 s of quiet (by the wall clock) hands it back.
//
// Before the first frame every shader the page can ever need compiles at once (stage.warmVariants: the materials on
// screen, their see-through twins, every cut and the section), so no click ever stalls on a compile. The quality
// steps go down one measure at a time when frames run slow: ambient occlusion off, a lower pixel ratio, smaller
// shadow maps, the panels redrawn every other frame, then the floor. ?tier=N pins a step; ?perf (or P) shows the
// frame rate and the step.
import {warmComposer} from 'teardown-kit/warm.js';
import {CAMS, createConsole, CUTS, MODES, OVERLAYS, STEP} from './console.js';
import {SUBS} from './engine.js';
import {makeConsoleFrame, makeCursor, rpmAt, trackAt, camAt, camName, CUT_T, cutsAt, cutsOnAt, DURATION, FOCUS_T, focusAt, SCRIPT, VALLEY_EXIT, VIEW_FN, Z_FRONT} from './film.js';
import {CYL, ORDER, RPM} from './kin.js';
import {createV8Stage} from './stage.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
// playback steps: the film runs at 1/20
const PLAYS = [1 / 60, 1 / 40, 1 / 20, 1 / 10, 1 / 5, 1 / 2, 1];
const playText = (p) => (p >= 1 ? '1× SPEED' : `1 / ${Math.round(1 / p)} SPEED`);

const CSS = (top) => `
html,body{background:#ecedef;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
.tb,.sb{pointer-events:auto;cursor:pointer}
.tb:hover,.sb:hover{filter:brightness(.95)}
.hit{position:absolute;pointer-events:auto;cursor:pointer}
.hit.ew{cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:62px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:21px;padding:0 11px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.chip2{position:absolute;left:800px;top:62px;transform:translateX(-50%);height:21px;padding:0 11px;display:none;align-items:center;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 8.8px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;pointer-events:none}
.perf{position:fixed;right:8px;bottom:8px;padding:4px 8px;background:rgba(22,24,27,.82);color:#fff;font:600 10px/1.35 'JetBrains Mono',monospace;letter-spacing:.4px;white-space:pre;pointer-events:none;z-index:99;display:none}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:#8b8f95;text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS(top);
  document.head.appendChild(style);
  document.title = 'V8 four-stroke explorer';
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createV8Stage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);

  // ------------------------------------------------------------ quality steps, best first; each adds one measure
  const TIERS = [
    {name: 'FULL', samples: 8, ao: true, shadow: 4096, pr: 2, panels: 1},
    {name: 'NO AMBIENT OCCLUSION', samples: 8, ao: false, shadow: 4096, pr: 2, panels: 1},
    {name: 'PIXEL RATIO 1.25', samples: 4, ao: false, shadow: 4096, pr: 1.25, panels: 1},
    {name: 'SHADOW MAP 1024', samples: 4, ao: false, shadow: 1024, pr: 1.25, panels: 1},
    {name: 'PANELS EVERY 2ND FRAME', samples: 2, ao: false, shadow: 1024, pr: 1, panels: 2},
    {name: 'FLOOR', samples: 0, ao: false, shadow: 512, pr: 0.75, panels: 2},
  ];
  const q = new URLSearchParams(location.search);
  const pinned = q.has('tier') ? clamp(Number(q.get('tier')) | 0, 0, TIERS.length - 1) : -1;
  // a phone or a small window starts three steps down
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = pinned >= 0 ? pinned : light ? 3 : 0;
  let scale = 1;
  const fit = () => {
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  // with the panels hidden, one chip says how to bring them back
  const hideChip = document.createElement('div');
  hideChip.className = 'chip2';
  hideChip.textContent = 'PANELS HIDDEN · PRESS H TO SHOW THEM';
  app.appendChild(hideChip);
  const perfBox = document.createElement('div');
  perfBox.className = 'perf';
  document.body.appendChild(perfBox);
  let showPerf = q.has('perf');
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let th = 12;
  let rpm = RPM.idle;
  let rpmTarget = RPM.idle;
  let playI = 2;
  let paused = false;
  let view = 'hero';
  let viewAt = 0;
  let cyl = 1;
  let cut = 'glass';
  const ov = {callouts: 1, charge: 1, arrows: 1, refract: 1, charts: 1};
  // the focus as a blend {from, to, t0} (each state {sub, mode} or null), the cuts as subsystem → {on, t}
  let foc = {from: null, to: null, t0: -1e9};
  let cuts = new Map();
  let prevShown = 0;
  let prevCam = 'hero';
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.open(0)};
  let ring = {t: -9, x: 0, y: 0};
  let hidden = false;
  const pulse = (x, y) => (ring = {t: T, x, y});
  const pulseBtn = (k) => pulse(...ui.spots[k]);

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  // the idle clock runs on wall time: the page clock T slows down with the frame rate (it steps at most 0.1 s a frame)
  let lastInput = performance.now();
  const touch = () => (lastInput = performance.now());
  const startTour = () => {
    AP.on = true;
    hidden = false;
    AP.t0 = T;
    AP.loop = 0;
    paused = false;
    playI = 2;
    cut = 'glass';
    Object.assign(ov, {callouts: 1, charge: 1, arrows: 1, refract: 1, charts: 1});
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    touch();
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    view = camName(cyc);
    viewAt = T - (cyc - SCRIPT.filter((e) => e.cam && e.t <= cyc).pop().t);
    if (view === 'hero' && cyc < 3.5) viewAt = T - 6;
    // the tour's subsystem state becomes the visitor's, mid-blend where it was
    const f = focusAt(cyc);
    foc = f ? {from: f.from, to: f.to, t0: T - FOCUS_T * f.k} : {from: null, to: null, t0: -1e9};
    const on = cutsOnAt(cyc);
    const sweep = cutsAt(cyc);
    cuts = new Map();
    for (const [sub, c] of sweep) cuts.set(sub, {on: on.has(sub), t: T - CUT_T * (on.has(sub) ? c.k : 1 - c.k)});
    for (const sub of on) if (!cuts.has(sub)) cuts.set(sub, {on: true, t: -1e9});
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    touch();
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });
  // a pointer moving over the page while the visitor drives is not quiet: it keeps the tour away
  addEventListener('pointermove', () => !AP.on && touch());

  // ------------------------------------------------------------ controls
  // a click into or out of the valley sends the eye up out of the V first (film.js VALLEY_EXIT), then on
  let via = -1;
  const setView = (v) => {
    prevShown = ss(1.1, 1.8, T - viewAt);
    prevCam = view;
    if ((v === 'valley') !== (view === 'valley')) via = T + 0.8;
    view = v;
    viewAt = T;
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  for (const k of CAMS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      setView(k);
    });
  for (const k of CUTS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      cut = k;
    });
  for (const k of OVERLAYS)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      ov[k] = ov[k] ? 0 : 1;
    });
  // the subsystem buttons: ISOLATE and ALONE are one focus (a second click releases it), CUT toggles per subsystem
  for (const sub of SUBS)
    for (const mode of MODES) {
      const key = `${mode}:${sub}`;
      ui.btn[key].addEventListener('click', () => {
        takeOver();
        pulseBtn(key);
        if (mode === 'cut') {
          // a click mid-sweep turns the plane round from where it is
          const c = cuts.get(sub);
          const k = c ? (c.on ? ss(c.t, c.t + CUT_T, T) : 1 - ss(c.t, c.t + CUT_T, T)) : 0;
          const on = !(c && c.on);
          cuts.set(sub, {on, t: T - CUT_T * (on ? k : 1 - k)});
        } else {
          const to = foc.to && foc.to.sub === sub && foc.to.mode === mode ? null : {sub, mode};
          foc = {from: foc.to, to, t0: T};
        }
      });
    }
  ui.btn.pause.addEventListener('click', () => {
    takeOver();
    pulseBtn('pause');
    paused = !paused;
  });
  for (const [k, d] of [['back', -STEP], ['fwd', STEP]])
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulseBtn(k);
      paused = true;
      th += d;
    });
  // the firing order: click a cylinder to track it
  ORDER.forEach((c, i) => {
    const [x, y] = ui.foSpot(i);
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x - 14}px`, top: `${y - 14}px`, width: '28px', height: '28px', borderRadius: '50%'});
    d.addEventListener('click', () => {
      takeOver();
      pulse(x, y);
      cyl = c;
      if (view === 'cyl') viewAt = T - 0.01;
    });
    ui.root.appendChild(d);
  });
  // the two sliders: drag along their tracks
  const slider = (knobAt, apply) => {
    const [x0, y] = knobAt(0);
    const [x1] = knobAt(1);
    const d = document.createElement('div');
    d.className = 'hit ew';
    Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${x1 - x0 + 16}px`, height: '22px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / (x1 - x0), 0, 1));
      touch();
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(ui.speedKnob, (k) => (rpmTarget = clamp(k * RPM.max, RPM.idle / 2, RPM.max)));
  slider(ui.playKnob, (k) => (playI = Math.round(k * (PLAYS.length - 1))));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = Object.fromEntries(CAMS.map((c, i) => [String(i + 1), c]))[key];
    takeOver();
    if (v) setView(v);
    else if (key === ' ') paused = !paused;
    else if (key === 'h') hidden = !hidden;
    else if (key === 'p') showPerf = !showPerf;
    else if (key === 'arrowleft') {
      paused = true;
      th -= STEP;
    } else if (key === 'arrowright') {
      paused = true;
      th += STEP;
    } else if (key === 'arrowup') rpmTarget = clamp(rpmTarget + RPM.idle / 2, RPM.idle / 2, RPM.max);
    else if (key === 'arrowdown') rpmTarget = clamp(rpmTarget - RPM.idle / 2, RPM.idle / 2, RPM.max);
    else return;
    e.preventDefault();
  });
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    off.az += ((e.clientX - drag.x) / scale) * 0.3;
    off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -20, 60);
    drag = {x: e.clientX, y: e.clientY};
    touch();
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.45, 2.2);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  let frames = 0;
  // frame time on the wall clock, judged in windows (6 frames and half a second, or 2 frames and 2 s on a very slow
  // machine): a window averaging over 22 ms (under 45 fps) is slow; one slow window in the first 6 s, or two in a row
  // after, steps down. The first frame (it carries the warm-up) and a return from a hidden tab are not counted.
  const perf = {n: 0, sum: 0, slow: 0, age: 0, skip: 1, ms: 0, shown: 0};
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      last = performance.now();
      Object.assign(perf, {n: 0, sum: 0, skip: 1});
    }
  });
  const frame = (now) => {
    const raw = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.1, raw);
    last = now;
    T += dt;
    frames++;
    if (perf.skip > 0) perf.skip--;
    else {
      perf.ms = perf.ms ? perf.ms * 0.9 + raw * 100 : raw * 1000;
      if (pinned < 0 && tier < TIERS.length - 1) {
        perf.age += raw;
        if (perf.age > 0.6) {
          perf.sum += raw;
          perf.n++;
          if ((perf.sum >= 0.5 && perf.n >= 6) || (perf.sum >= 2 && perf.n >= 2)) {
            perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
            perf.sum = 0;
            perf.n = 0;
            if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
              tier++;
              applyTier();
              Object.assign(perf, {age: 0, slow: 0});
            }
          }
        }
      }
    }

    let tgt;
    let cursor;
    let since;
    let fNow;
    let cutsNow;
    let cutsOn;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      view = camName(cyc);
      cyl = trackAt(cyc);
      rpmTarget = rpmAt(cyc);
      tgt = camAt(cyc);
      const t0 = SCRIPT.filter((e) => e.cam && e.t <= cyc).pop().t;
      since = cyc - t0;
      fNow = focusAt(cyc);
      cutsNow = cutsAt(cyc);
      cutsOn = cutsOnAt(cyc);
      const vs = SCRIPT.filter((e) => e.cam);
      const vi = vs.findIndex((e) => e.t === t0);
      prevShown = vi > 0 ? ss(1.1, 1.8, t0 - vs[vi - 1].t) : 0;
      prevCam = vi > 0 ? (vs[vi - 1].cam === 'open' ? 'hero' : vs[vi - 1].cam) : view;
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (performance.now() - lastInput > IDLE * 1000) startTour();
      since = T - viewAt;
      tgt = VIEW_FN[view](since, cyl);
      tgt.az += off.az;
      tgt.el = clamp(tgt.el + off.el, -10, 80);
      tgt.d *= off.k;
      if (T < via) tgt = {...VALLEY_EXIT};
      const fk = ss(foc.t0, foc.t0 + FOCUS_T, T);
      fNow = foc.to || (foc.from && fk < 1) ? {from: foc.from, to: foc.to, k: fk} : null;
      const zc = CYL[cyl - 1].z * 0.001;
      cutsNow = new Map();
      cutsOn = new Set();
      for (const [sub, c] of cuts) {
        const u = ss(c.t, c.t + CUT_T, T);
        const k = c.on ? u : 1 - u;
        if (c.on) cutsOn.add(sub);
        if (k > 0.0005) cutsNow.set(sub, {k, z: Z_FRONT + (zc - Z_FRONT) * k});
      }
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    rpm += (rpmTarget - rpm) * (1 - Math.exp(-dt / 0.35));
    if (!paused) th += (rpm / 60) * 360 * dt * PLAYS[playI];

    // the camera eases toward its target: the tour's own moves pass through, a loop restart or a click glides
    const k = 1 - Math.exp(-dt / (AP.on ? 0.18 : 0.45));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy', 'fov']) cam[key] += ((tgt[key] ?? 26) - (cam[key] ?? 26)) * k;
    st.setCut(cut, CYL[cyl - 1].z * 0.001);
    st.setSubCuts(cutsNow);
    st.eng.setRefract(!!ov.refract);
    st.frame(th, {...cam, az: cam.az * D2R, el: cam.el * D2R}, {focus: fNow, charge: ov.charge, arrows: ov.arrows});

    ui.root.style.display = hidden ? 'none' : '';
    hideChip.style.display = hidden ? 'flex' : 'none';
    // the panels: every frame, or every other frame on the lower steps (the cursor still moves every frame)
    const panelsNow = TIERS[tier].panels === 1 || frames % 2 === 0;
    if (!panelsNow) ui.pointer(cursor);
    else {
    for (const n of ui.root.querySelectorAll('[data-g="charts"]')) n.style.visibility = ov.charts ? '' : 'hidden';
    frameConsole(T, {
      th,
      cam: view,
      cyl,
      rpm,
      cursor,
      since,
      prevShown,
      prevCam,
      focus: fNow,
      cutsOn,
      live: {overlays: {...ov}, cut, paused, playText: playText(PLAYS[playI]), playK: playI / (PLAYS.length - 1)},
    });
    }
    // the tour chip: on the tour, how to take over; off it, how to come back, and a countdown for the last 10 s
    const left = IDLE - (performance.now() - lastInput) / 1000;
    const chip = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : left < 10 ? `▶ RESUME TOUR · BACK BY ITSELF IN ${Math.max(1, Math.ceil(left))} S` : '▶ RESUME TOUR';
    if (tourChip.innerHTML !== chip) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = chip;
    }
    perfBox.style.display = showPerf ? 'block' : 'none';
    if (showPerf && now - perf.shown > 400) {
      perf.shown = now;
      perfBox.textContent = `${(1000 / Math.max(1, perf.ms)).toFixed(1)} FPS · ${perf.ms.toFixed(1)} MS\nSTEP ${tier + 1}/${TIERS.length} ${TIERS[tier].name}${pinned >= 0 ? ' (PINNED)' : ''}`;
    }
    // the site page swaps its poster for the canvas on this
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  // every shader the page can need compiles at once, off the main thread, before the first frame (kit/warm.js for one
  // state of the scene, stage.warmVariants for every state a click can reach)
  st.warmVariants(() => warmComposer(st.renderer, st.composer, st.scene, st.camera)).then(() => {
    last = performance.now();
    requestAnimationFrame(frame);
  });
  window.LIVE = {
    st,
    cam,
    startTour,
    takeOver,
    TIERS,
    get tier() {
      return tier;
    },
    get T() {
      return T;
    },
    get frames() {
      return frames;
    },
    get tour() {
      return AP.on;
    },
    get hidden() {
      return hidden;
    },
    get off() {
      return {...off};
    },
    get view() {
      return view;
    },
    get frameMs() {
      return perf.ms;
    },
  };
}
