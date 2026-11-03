# The cloud container

- **No GPU.** Chromium renders WebGL with SwiftShader on the CPU: ~8 s per 1600×900 still, ~16 s per 1920×1080
  frame at full quality, a live page at ~0.2 frames/s. A 30 s 1080p60 recording is ~1,800 frames ≈ 7 hours.
  Measure, then tell the user the estimate before starting anything long.
- **Chromium**: `npx playwright install` is blocked by the network policy (`cdn.playwright.dev`). Use the
  preinstalled build: `export CHROMIUM=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome | head -1)`.
  `scripts/setup.sh` does this.
- **Parallel renders**: 4 cores; SwiftShader already uses them. Two renderers give ~12% more throughput than one;
  three starve each other's page load past the capture tool's fixed 60 s timeout. For anything long, use a copy of
  the capture tool with a longer load limit (`scripts/record.sh` makes `capture-patient.mjs`), and avoid running
  other renders while a recording is going.
- **Long jobs** die with the session's worker: run them detached (`setsid nohup bash job.sh > log 2>&1 < /dev/null &`),
  make them resumable (keep only complete outputs), and watch them with a background `until grep ...; do sleep 60;
  done` (re-arm it after 2 h).
- **The container is temporary**: anything worth keeping (the skill, the simulator source) belongs in a git repo or
  is sent to the user with SendUserFile. Built pages are single HTML files (~800 KB), easy to send.
- **Network**: some hosts are blocked (x.com, cdn.playwright.dev). Ask for pasted content; read
  `read_documentation` (environment.network) when blocked.
- **Fonts**: Inter and JetBrains Mono are bundled; CJK text falls back to system fonts (WenQuanYi Zen Hei here).
