// Is render(t) a pure function of t? Draws the given instants in the given (scrambled) order, each one twice with
// others in between, and compares the PNGs byte for byte.
//   node purity.cjs <film.html> 17.6 3.0 25.4 10.1 17.6 0.5 10.1 3.0 25.4
const {chromium} = require('playwright');
const [page, ...ts] = process.argv.slice(2);
const order = ts.length ? ts.map(Number) : [1.0, 3.0, 1.0, 5.0, 3.0, 5.0];
(async () => {
  const b = await chromium.launch({executablePath: process.env.CHROMIUM, args: ['--ignore-gpu-blocklist', '--enable-webgl']});
  const p = await b.newPage({viewport: {width: 1600, height: 900}, deviceScaleFactor: 1.2});
  p.setDefaultTimeout(900000); // a busy software renderer can take minutes per frame
  await p.addInitScript(() => (window.__CAPTURE = true));
  await p.goto(`file://${require('path').resolve(page)}`);
  await p.waitForFunction(() => window.SIM && window.SIM.ready, null, {timeout: 300000});
  const first = {};
  let bad = 0;
  for (const t of order) {
    await p.evaluate((x) => window.SIM.render(x), t);
    const buf = await p.screenshot({type: 'png'});
    if (!first[t]) first[t] = buf;
    else {
      const same = Buffer.compare(first[t], buf) === 0;
      if (!same) bad++;
      console.log(`t=${t}: redrawn after other instants -> ${same ? 'byte-identical' : 'DIFFERENT (state carried between frames)'}`);
    }
  }
  console.log(bad ? `${bad} instant(s) NOT pure` : 'render(t) is pure for every repeated instant');
  await b.close();
  process.exitCode = bad ? 1 : 0;
})();
