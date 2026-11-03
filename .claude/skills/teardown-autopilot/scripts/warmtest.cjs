// Did the warm-up compile every shader the page can need? Counts WebGL programs after the warm-up, then clicks every
// console button (.tb, .sb) twice, letting frames render after each, and counts again. Any increase is a compile on a
// visitor's click: a freeze on a real GPU. Needs window.LIVE.st.renderer and window.LIVE.frames.
//   node warmtest.cjs <live.html>
const {chromium} = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--ignore-gpu-blocklist', '--enable-webgl']});
  const p = await b.newPage({viewport: {width: 800, height: 450}});
  p.setDefaultTimeout(900000); // a busy software renderer can take minutes per frame
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`file://${path.resolve(process.argv[2])}`);
  await p.waitForFunction(() => window.SIM_SHOWN, null, {timeout: 300000});
  const count = () => p.evaluate(() => window.LIVE.st.renderer.info.programs.length);
  const frames = async (n) => {
    for (let i = 0; i < n; i++) {
      const f0 = await p.evaluate(() => window.LIVE.frames);
      await p.waitForFunction((f) => window.LIVE.frames > f, f0, {timeout: 180000});
    }
  };
  const base = await count();
  const n = await p.evaluate(() => document.querySelectorAll('.tb,.sb').length);
  let worst = {at: '', c: base};
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < n; i++) {
      const label = await p.evaluate((i) => {
        const el = document.querySelectorAll('.tb,.sb')[i];
        el.dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        el.click();
        return el.textContent.trim();
      }, i);
      await frames(1);
      const c = await count();
      if (c > worst.c) worst = {at: label, c};
    }
  }
  await frames(2);
  const after = await count();
  console.log(`programs after warm-up: ${base}; after clicking ${n} buttons twice: ${after}`);
  console.log(after > base ? `NOT WARM: ${after - base} program(s) compiled on clicks (first at "${worst.at}")` : 'warm: no program compiled after the warm-up');
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
  await b.close();
  process.exitCode = after > base || errs.length ? 1 : 0;
})();
