// The live page's behaviour, measured in a browser: the cost of each quality step, the automatic step-down, and the
// hand-off between the tour and the visitor. Needs window.LIVE getters: tour, hidden, off, view, tier, TIERS, frames.
//   node livecheck.cjs <live.html>
const {chromium} = require('playwright');
const page = require('path').resolve(process.argv[2]);
const launch = () => chromium.launch({executablePath: process.env.CHROMIUM, args: ['--ignore-gpu-blocklist', '--enable-webgl']});
const open = async (b, qs) => {
  const p = await b.newPage({viewport: {width: 1600, height: 900}});
  p.setDefaultTimeout(900000); // a busy software renderer can take minutes per frame
  p.errs = [];
  p.on('pageerror', (e) => p.errs.push(e.message));
  await p.goto(`file://${page}${qs}`);
  await p.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 300000});
  return p;
};
const frames = (p, n) => p.evaluate((n) => new Promise((res) => {
  const ts = [];
  const f = (t) => {
    ts.push(t);
    if (ts.length > n) res(ts.slice(1).map((x, i) => x - ts[i]));
    else requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), n);
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

(async () => {
  const b = await launch();
  // 1. each step pinned: mean frame time over 3 frames after 2 to settle
  console.log('--- 1. cost of each quality step (software renderer, 1600 x 900, device pixel ratio 1)');
  let names = null;
  for (let k = 0; names === null || k < names.length; k++) {
    const p = await open(b, `?tier=${k}`);
    names = names || (await p.evaluate(() => window.LIVE.TIERS.map((t) => t.name)));
    await frames(p, 2);
    const ms = avg(await frames(p, 3));
    console.log(`step ${k + 1} ${names[k].padEnd(24)} ${ms.toFixed(0).padStart(6)} ms/frame${p.errs.length ? '  errors: ' + p.errs.join(' | ') : ''}`);
    await p.close();
  }
  // 2. unpinned: the page should walk down the steps on its own
  console.log('--- 2. automatic step-down, unpinned');
  {
    const p = await open(b, '');
    const t0 = Date.now();
    let last = -1;
    while (Date.now() - t0 < 300000) {
      const tier = await p.evaluate(() => window.LIVE.tier);
      if (tier !== last) {
        console.log(`  ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s: step ${tier + 1} ${names[tier]}`);
        last = tier;
      }
      if (tier === names.length - 1) break;
      await p.waitForTimeout(2000);
    }
    await p.close();
  }
  // 3. the hand-off, on the lowest step so frames come quickly
  console.log('--- 3. tour and visitor');
  {
    const p = await open(b, `?tier=${names.length - 1}`);
    const L = () => p.evaluate(() => ({tour: window.LIVE.tour, hidden: window.LIVE.hidden, off: window.LIVE.off, view: window.LIVE.view}));
    const settle = () => frames(p, 2);
    const say = (k, v) => console.log(`  ${k.padEnd(46)} ${v}`);
    await settle();
    say('on load, the tour runs', (await L()).tour);
    const chipText = () => p.evaluate(() => document.querySelector('.tourchip').textContent);
    say('tour chip', await chipText());
    // a click on the engine takes over
    await p.mouse.click(800, 450);
    await settle();
    say('after a click on the engine: tour', (await L()).tour);
    // quiet for 26 s: the tour comes back
    const tq = Date.now();
    await p.waitForFunction(() => window.LIVE.tour, null, {timeout: 60000});
    say('tour back after quiet of', `${((Date.now() - tq) / 1000).toFixed(1)} s`);
    // a drag orbits and takes over
    const o0 = (await L()).off;
    await p.mouse.move(800, 450);
    await p.mouse.down();
    await p.mouse.move(1000, 400, {steps: 4});
    await p.mouse.up();
    await settle();
    let s1 = await L();
    say('after a drag: tour / orbit offset', `${s1.tour} / az ${o0.az.toFixed(0)}° → ${s1.off.az.toFixed(0)}°, el ${o0.el.toFixed(0)}° → ${s1.off.el.toFixed(0)}°`);
    // the wheel zooms
    await p.mouse.move(800, 450);
    await p.mouse.wheel(0, 400);
    await settle();
    let s2 = await L();
    say('after a scroll: zoom factor', `${s1.off.k.toFixed(2)} → ${s2.off.k.toFixed(2)}`);
    // keys: H hides the panels (a chip says how to get them back), P shows the frame rate, 3 picks a view
    await p.keyboard.press('h');
    await settle();
    const chipShown = await p.evaluate(() => getComputedStyle(document.querySelector('.chip2')).display);
    say('H: panels hidden / hint chip', `${(await L()).hidden} / ${chipShown}`);
    await p.keyboard.press('h');
    await settle();
    say('H again: panels hidden', (await L()).hidden);
    await p.keyboard.press('p');
    await settle();
    await p.waitForTimeout(500);
    await settle();
    say('P: frame-rate readout', JSON.stringify(await p.evaluate(() => document.querySelector('.perf').textContent)));
    const v0 = (await L()).view;
    await p.keyboard.press('3');
    await settle();
    say('key 3: view', `${v0} -> ${(await L()).view}`);
    // a key during the tour takes over too; and a hidden overlay comes back with the tour
    await p.keyboard.press('h');
    await settle();
    await p.waitForFunction(() => window.LIVE.tour, null, {timeout: 60000});
    await settle();
    say('tour back: panels hidden', (await L()).hidden);
    await p.waitForTimeout(100);
    await p.keyboard.press('ArrowUp');
    await settle();
    say('a key during the tour: tour', (await L()).tour);
    // countdown in the chip near the end of the quiet
    await p.waitForFunction(() => /BACK BY ITSELF/.test(document.querySelector('.tourchip').textContent), null, {timeout: 60000});
    say('chip in the last 10 s', await chipText());
    console.log('  page errors:', p.errs.length ? p.errs.join(' | ') : 'none');
    await p.close();
  }
  await b.close();
})();
