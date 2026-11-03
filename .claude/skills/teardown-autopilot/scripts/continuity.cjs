// Samples every quantity the film exposes in window.FILM.sample(t) every 0.01 s and flags a jump: a step more than
// 6x the larger of its two neighbours and above a floor (window.FILM.floors[key], else 0.002). Also writes the tour's
// beats (every SCRIPT time > 0) into the timeline file.
//   node continuity.cjs <film.html> <film timeline.json>
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const [page, timeline] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--ignore-gpu-blocklist', '--enable-webgl']});
  const p = await b.newPage({viewport: {width: 1600, height: 900}});
  p.setDefaultTimeout(900000); // a busy software renderer can take minutes per frame
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => (window.__CAPTURE = true));
  await p.goto(`file://${path.resolve(page)}`);
  await p.waitForFunction(() => window.FILM && window.SIM, null, {timeout: 300000});
  const res = await p.evaluate(() => {
    const F = window.FILM;
    if (typeof F.sample !== 'function') return {error: 'window.FILM.sample(t) is missing (see references/build.md)'};
    const rows = [];
    for (let i = 0; i <= Math.round(F.DURATION * 100); i++) rows.push({t: i / 100, ...F.sample(i / 100)});
    return {rows, beats: F.SCRIPT.map((e) => e.t).filter((x) => x > 0), dur: F.DURATION, floors: F.floors || {}};
  });
  if (res.error) {
    console.log(res.error);
    process.exit(2);
  }
  if (timeline) fs.writeFileSync(timeline, JSON.stringify({duration: res.dur, beats: res.beats}) + '\n');
  const keys = Object.keys(res.rows[0]).filter((k) => k !== 't');
  const flags = [];
  for (const k of keys) {
    const v = res.rows.map((r) => r[k]);
    const fl = res.floors[k] ?? 0.002;
    for (let i = 1; i < v.length - 1; i++) {
      const d = Math.abs(v[i + 1] - v[i]);
      const nb = Math.max(Math.abs(v[i] - v[i - 1]), i + 2 < v.length ? Math.abs(v[i + 2] - v[i + 1]) : 0);
      if (d > fl && d > 6 * nb + 1e-9) flags.push(`${k} jumps ${d.toFixed(4)} between t=${res.rows[i].t.toFixed(2)} and ${res.rows[i + 1].t.toFixed(2)} (neighbours ${nb.toFixed(4)})`);
    }
  }
  console.log(`sampled ${res.rows.length} instants x ${keys.length} quantities${timeline ? `; beats written: ${res.beats.join(', ')}` : ''}`);
  console.log(flags.length ? flags.join('\n') : 'no jumps');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
  process.exitCode = flags.length || errs.length ? 1 : 0;
})();
