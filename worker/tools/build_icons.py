"""Gera assets/icons/lucide.json.gz: os ícones do Lucide (ISC) como linhas (pontos) para o motor desenhar
traço a traço (render/mograph.py). Roda uma vez, fora do VPS:
  npm pack lucide-static && tar xzf lucide-static-*.tgz
  pip install svgelements && python3 tools/build_icons.py package/
"""
import gzip
import json
import sys
from pathlib import Path

from svgelements import SVG, Path as SvgPath, Shape

src = Path(sys.argv[1])
tags = json.loads((src / "tags.json").read_text())
out = {}
for svg_file in sorted((src / "icons").glob("*.svg")):
    name = svg_file.stem
    strokes = []
    for el in SVG.parse(str(svg_file)).elements():
        if not isinstance(el, Shape):
            continue
        whole = el if isinstance(el, SvgPath) else SvgPath(el)
        for sub in whole.as_subpaths():
            path = SvgPath(sub)
            length = path.length(error=1e-3)
            n = max(2, min(80, int(length * 2.2)))
            pts = [path.point(i / (n - 1)) for i in range(n)]
            flat = []
            for p in pts:
                flat += [round(float(p.x), 2), round(float(p.y), 2)]
            closed = bool(abs(pts[0].x - pts[-1].x) < 0.01 and abs(pts[0].y - pts[-1].y) < 0.01)
            strokes.append({"p": flat, "c": closed} if closed else flat)
    if strokes:
        out[name] = {"s": strokes, "t": tags.get(name, [])[:8]}
dest = Path(__file__).resolve().parent.parent / "assets" / "icons" / "lucide.json.gz"
dest.write_bytes(gzip.compress(json.dumps(out, separators=(",", ":")).encode()))
print(len(out), "ícones,", dest.stat().st_size // 1024, "KB")
