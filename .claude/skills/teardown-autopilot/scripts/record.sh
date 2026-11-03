#!/bin/bash
# Records a film at 1920x1080, 60 fps: render(t) is pure, so the film is cut into segments drawn frame by frame in
# headless Chrome and piped into ffmpeg (libx264, yuv420p, +faststart, by the teardown capture tool) by two workers.
# A segment is kept only when it holds the right number of frames, so a restart resumes where it stopped; a failed
# load is retried. When every segment is in they are joined without re-encoding.
#   setsid nohup bash record.sh <film-name> <duration-s> [segment-s=2] [out.mp4] > rec.log 2>&1 < /dev/null &
# then watch: until grep -qE "REC DONE|INCOMPLETE" rec.log; do sleep 60; done
NAME=$1
DUR=$2
SEG=${3:-2}
OUT=${4:-$PWD/teardown-out/$NAME.mp4}
FPS=60
[ -z "$NAME" ] || [ -z "$DUR" ] && { echo "usage: record.sh <film-name> <duration-s> [segment-s] [out.mp4]"; exit 2; }
export CHROMIUM=${CHROMIUM:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux64/chrome 2>/dev/null | head -1)}
# the capture tool allows a page 60 s to load and Playwright 30 s per screenshot, too little on a busy software
# renderer (a 1080p frame can take longer): use a copy that allows 15 min for both
C=~/.claude/skills/teardown/sims/capture-patient.mjs
sed -e 's/{timeout: 60000}/{timeout: 900000}/' -e '/const page = await browser.newPage(/a page.setDefaultTimeout(900000);' ~/.claude/skills/teardown/sims/capture.mjs > $C
R=$(dirname "$OUT")/rec-$NAME
N=$(python3 -c "import math; print(math.ceil($DUR/$SEG - 1e-9))")
mkdir -p "$R"
rm -rf "$R"/lock-* "$R"/tmp-*.mp4 "$R"/seg-*.log   # stale logs would open the second worker's gate early
frames_of() { ffprobe -v error -select_streams v:0 -count_packets -show_entries stream=nb_read_packets -of csv=p=0 "$1" 2>/dev/null; }
span() { python3 -c "f=$1*$SEG; t=min(f+$SEG,$DUR); print(f, t, round((t-f)*$FPS))"; }
ok() { read -r f t n <<<"$(span $1)"; [ -f "$R/seg-$1.mp4" ] && [ "$(frames_of "$R/seg-$1.mp4")" = "$n" ]; }
worker() {
  for i in $(seq 0 $((N - 1))); do
    ok $i && continue
    mkdir "$R/lock-$i" 2>/dev/null || continue
    read -r f t n <<<"$(span $i)"
    for try in 1 2 3; do
      echo "$(date +%T) segment $i: $f-$t s, $n frames, try $try"
      node $C "$NAME" --size 1600x900 --dpr 1.2 --fps $FPS --from $f --to $t --out "$R/tmp-$i.mp4" > "$R/seg-$i.log" 2>&1 && mv "$R/tmp-$i.mp4" "$R/seg-$i.mp4"
      ok $i && break
    done
    ok $i && echo "$(date +%T) segment $i done" || echo "$(date +%T) segment $i FAILED (see $R/seg-$i.log)"
  done
}
worker &
# the second worker starts once the first is past its page load (the capture tool allows a page 60 s to load)
until grep -qs "frames" "$R"/seg-*.log; do sleep 5; done
worker &
wait
for i in $(seq 0 $((N - 1))); do ok $i || { echo "INCOMPLETE: segment $i missing"; exit 1; }; done
: > "$R/list.txt"
for i in $(seq 0 $((N - 1))); do echo "file 'seg-$i.mp4'" >> "$R/list.txt"; done
ffmpeg -loglevel error -y -f concat -safe 0 -i "$R/list.txt" -c copy -movflags +faststart "$OUT"
echo "$(date +%T) REC DONE: $(frames_of "$OUT") frames -> $OUT"
