// A test bench, not part of the page: crank angle = 12 + 36·t, a fixed camera, focus and cuts from the config.
import {runSim} from 'teardown-kit/runtime.js';
import {CYL} from '../v8-shared/kin.js';
import {createV8Stage} from '../v8-shared/stage.js';

const D2R = Math.PI / 180;
const DEFAULTS = {duration: 10, fps: 60, theme: 'light', hud: {enabled: false}, director: {enabled: false}, cam: {tx: 0, ty: 0.2, tz: -0.3, az: 0, el: 5, d: 0.48, sx: 0, sy: 0, fov: 62}, focus: null, cuts: [], cyl: 6};
runSim(DEFAULTS, async ({cfg, canvas}) => {
  const st = createV8Stage({canvas});
  const resize = () => st.resize(1600, 900, 1);
  resize();
  return {
    resize,
    render(t) {
      const c = cfg.cam;
      st.setCut('glass', CYL[cfg.cyl - 1].z * 0.001);
      st.setSubCuts(new Map(cfg.cuts.map((sub) => [sub, {k: 1, z: CYL[cfg.cyl - 1].z * 0.001}])));
      st.frame(12 + 36 * t, {...c, az: c.az * D2R, el: c.el * D2R}, {focus: cfg.focus ? {from: null, to: cfg.focus, k: 1} : null});
      return {};
    },
  };
});
