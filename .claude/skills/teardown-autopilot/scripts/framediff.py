"""Mean change between consecutive frames of each scrub (greyscale, 1/4 size), and the steps that stand out: more than
2.2x the larger of their two neighbours and above 1.5 grey levels. A jump shows up as a lone spike.
    python3 -I tools/framediff.py teardown-out/scrub-*-frames"""
import sys, os
from PIL import Image, ImageChops, ImageStat

for d in sys.argv[1:]:
    fs = sorted(f for f in os.listdir(d) if f.endswith('.png'))
    ims = [Image.open(os.path.join(d, f)).convert('L').resize((400, 225)) for f in fs]
    diffs = [ImageStat.Stat(ImageChops.difference(a, b)).mean[0] for a, b in zip(ims, ims[1:])]
    flags = []
    for i, v in enumerate(diffs):
        nb = max(diffs[i - 1] if i else 0, diffs[i + 1] if i + 1 < len(diffs) else 0)
        if v > 1.5 and v > 2.2 * nb:
            flags.append(f'{fs[i]}->{fs[i+1]} ({v:.1f} vs {nb:.1f})')
    print(f"{os.path.basename(d)}: {len(fs)} frames, step mean {sum(diffs)/max(1,len(diffs)):.2f}, max {max(diffs, default=0):.2f}"
          + (f"  SPIKES: {'; '.join(flags)}" if flags else '  no spikes'))
