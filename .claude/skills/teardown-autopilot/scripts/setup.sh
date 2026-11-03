#!/bin/bash
# Gets the teardown skill ready: installs it if missing, installs its node packages, and finds a Chromium that works.
# Prints the CHROMIUM line to export. bash setup.sh
set -e
T=~/.claude/skills/teardown
if [ ! -f "$T/SKILL.md" ]; then
  echo "installing the teardown skill (github.com/elvarofficial/teardown)"
  npx -y skills add elvarofficial/teardown -g -a claude-code -y > /dev/null
fi
if [ ! -d "$T/node_modules/three" ]; then
  (cd "$T" && npm install --no-audit --no-fund > /dev/null)
fi
# Chromium: the playwright build if it downloaded, else the preinstalled one (the cloud container blocks the download)
C=""
if (cd "$T" && npx playwright install chromium > /dev/null 2>&1); then
  echo "playwright chromium installed"
else
  C=$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome 2>/dev/null | head -1)
  [ -z "$C" ] && C=$(command -v chromium || command -v google-chrome || true)
fi
command -v ffmpeg > /dev/null || echo "WARNING: ffmpeg not on PATH (needed for videos and sheets)"
echo "teardown ready at $T"
[ -n "$C" ] && echo "export CHROMIUM=$C"
exit 0
