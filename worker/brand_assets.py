"""Material da marca (templates "do zero", /videogen/templates no app).

Dois usos:
- prepare_render(spec, workdir): no render (vídeo ou exemplo), baixa o que a ficha pede em spec["brand"]
  (fontes, logo da marca d'água, efeitos sonoros, trilha) e devolve os caminhos locais.
- collect_material(assets, workdir): na montagem do template, baixa tudo que o usuário enviou e prepara
  para a IA: logos em PNG (SVG é rasterizado), páginas do guia de marca (PDF vira imagens + texto),
  amostra de cada fonte desenhada, duração dos efeitos e da trilha.
"""
import hashlib
import json
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from providers import download

SFX_ROLE = {"transicao": "whoosh", "impacto": "impact", "subida": "riser"}
MAX_GUIDE_PAGES = 6
MAX_GUIDE_TEXT = 8000


def _key(url):
    return hashlib.sha1(url.encode()).hexdigest()[:10]


def _ext(url, default):
    ext = Path(url.split("?")[0]).suffix.lower()
    return ext if 1 < len(ext) <= 6 else default


def _cached(url, cache_dir, default_ext):
    """Baixa uma vez (fontes e efeitos se repetem em todo vídeo do template)."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{_key(url)}{_ext(url, default_ext)}"
    if path.exists() and path.stat().st_size > 0:
        return path
    return download(url, path)


def font_ok(path):
    try:
        ImageFont.truetype(str(path), 40)
        return True
    except Exception:
        return False


def prepare_render(spec, workdir, cache_dir=None, log=print):
    """{"fonts": {chave: Path}, "watermark": Path|None, "logo": Path|None, "sfx": {papel: [Path]}, "music": Path|None}.
    Ficha sem spec["brand"] devolve tudo vazio (render igual ao de antes). Falha em um arquivo = segue sem ele."""
    out = {"fonts": {}, "watermark": None, "logo": None, "sfx": {}, "music": None}
    brand = (spec or {}).get("brand") if isinstance(spec, dict) else None
    if not isinstance(brand, dict):
        return out
    cache_dir = Path(cache_dir or workdir / "marca")
    for key, f in (brand.get("fonts") or {}).items():
        try:
            path = _cached(f["url"], cache_dir, ".ttf")
            if font_ok(path):
                out["fonts"][key] = path
            else:
                log(f"fonte da marca {f.get('name') or key}: arquivo não abre, usando a padrão")
        except Exception as e:
            log(f"fonte da marca {f.get('name') or key}: {e} (usando a padrão)")
    if brand.get("logoUrl"):
        try:
            out["logo"] = _cached(brand["logoUrl"], cache_dir, ".png")
            if (brand.get("watermark") or "none") != "none":
                out["watermark"] = out["logo"]
        except Exception as e:
            log(f"logo da marca: {e} (segue sem)")
    for role, urls in (brand.get("sfx") or {}).items():
        files = []
        for u in urls:
            try:
                files.append(_cached(u, cache_dir, ".mp3"))
            except Exception as e:
                log(f"efeito sonoro da marca: {e} (usando o padrão)")
        if files:
            out["sfx"][role] = files
    if brand.get("musicUrl"):
        try:
            out["music"] = _cached(brand["musicUrl"], cache_dir, ".mp3")
        except Exception as e:
            log(f"trilha da marca: {e} (gerando uma)")
    return out


# ---------- montagem do template: material para a IA ----------

def _duration(path):
    try:
        out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                             capture_output=True, text=True, check=True)
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return None


def _fit(im, max_side=1024):
    im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    return im


def _on_white(im):
    """Logo com transparência sobre fundo xadrez claro (a IA enxerga logo branco e escuro)."""
    if im.mode != "RGBA":
        return im.convert("RGB")
    bg = Image.new("RGB", im.size, (236, 236, 236))
    d = ImageDraw.Draw(bg)
    s = 24
    for y in range(0, im.height, s):
        for x in range(0, im.width, s):
            if (x // s + y // s) % 2:
                d.rectangle((x, y, x + s - 1, y + s - 1), fill=(200, 200, 200))
    bg.paste(im, (0, 0), im)
    return bg


def _pdf_pages(path, out_dir, max_pages=MAX_GUIDE_PAGES):
    """(texto, [imagens das páginas]) de um PDF. Sem PyMuPDF instalado: nada (a IA usa o resto)."""
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            return "", []
    doc = pymupdf.open(str(path))
    text, pages = [], []
    n = doc.page_count
    # páginas espalhadas pelo documento (guias costumam ter cores/tipografia no meio)
    pick = sorted({0, *[round(i * (n - 1) / max(max_pages - 1, 1)) for i in range(max_pages)]}) if n else []
    for i, page in enumerate(doc):
        if sum(len(t) for t in text) < MAX_GUIDE_TEXT:
            text.append(page.get_text().strip())
        if i in pick:
            zoom = 1024 / max(page.rect.width, page.rect.height, 1)
            pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom))
            out = out_dir / f"{path.stem}_p{i + 1}.jpg"
            pix.save(str(out))
            pages.append((i + 1, out))
    return "\n".join(t for t in text if t)[:MAX_GUIDE_TEXT], pages


def _svg_png(path, out):
    try:
        import pymupdf
    except ImportError:
        try:
            import fitz as pymupdf
        except ImportError:
            return None
    doc = pymupdf.open(str(path))
    page = doc[0]
    zoom = 1200 / max(page.rect.width, page.rect.height, 1)
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=True)
    pix.save(str(out))
    return out


def font_specimen(path, name, out):
    """Amostra da fonte desenhada (a IA vê o desenho da letra, não só o nome do arquivo)."""
    im = Image.new("RGB", (1024, 360), (255, 255, 255))
    d = ImageDraw.Draw(im)
    try:
        big = ImageFont.truetype(str(path), 96)
        small = ImageFont.truetype(str(path), 48)
    except Exception:
        return None
    d.text((32, 24), "Aa Bb Rr 123", font=big, fill=(0, 0, 0))
    d.text((32, 170), "Ação é tudo: VÍDEO", font=small, fill=(0, 0, 0))
    d.text((32, 300), name[:60], font=ImageFont.load_default(), fill=(120, 120, 120))
    im.save(out, quality=88)
    return out


def collect_material(assets, workdir, log=print):
    """Baixa e prepara o material enviado. Devolve:
    {"text": descrição para o prompt, "images": [(rótulo, Path jpg/png)], "fonts": {chave: {"url","name","path"}},
     "logo": Path|None (PNG do logo principal), "sfx": {papel: [url]}, "music": url|None}"""
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    assets = assets if isinstance(assets, dict) else {}
    lines, images, fonts, sfx = [], [], {}, {}
    logo = None
    music = None

    for n, item in enumerate(assets.get("logos") or []):
        try:
            src = download(item["url"], workdir / f"logo_{n}{_ext(item['url'], '.png')}")
            if src.suffix.lower() == ".svg":
                src = _svg_png(src, workdir / f"logo_{n}.png")
                if src is None:
                    lines.append(f"- Logo {n + 1} ({item.get('name')}): SVG não pôde ser lido aqui; envie em PNG.")
                    continue
            im = _fit(Image.open(src), 1200)
            png = workdir / f"logo_{n}_ok.png"
            im.save(png)
            if logo is None:
                logo = png
            view = workdir / f"logo_{n}_ver.jpg"
            _on_white(_fit(im, 768)).save(view, quality=88)
            images.append((f"Logo {n + 1} ({item.get('name') or 'logo'})" + (" — logo principal" if logo == png else ""), view))
        except Exception as e:
            log(f"logo {item.get('name')}: {e}")
            lines.append(f"- Logo {n + 1} ({item.get('name')}): não consegui abrir.")

    guide_text = []
    for n, item in enumerate(assets.get("guides") or []):
        try:
            src = download(item["url"], workdir / f"guia_{n}{_ext(item['url'], '.pdf')}")
            if src.suffix.lower() == ".pdf":
                text, pages = _pdf_pages(src, workdir)
                if text:
                    guide_text.append(f"[{item.get('name') or 'guia'}]\n{text}")
                for p, img in pages:
                    images.append((f"Guia de marca \"{item.get('name') or 'guia'}\", página {p}", img))
                if not text and not pages:
                    lines.append(f"- Guia {item.get('name')}: PDF sem leitura neste servidor.")
            else:
                if src.suffix.lower() == ".svg":
                    src = _svg_png(src, workdir / f"guia_{n}.png") or src
                view = workdir / f"guia_{n}_ver.jpg"
                _on_white(_fit(Image.open(src))).save(view, quality=88)
                images.append((f"Guia de marca \"{item.get('name') or 'guia'}\"", view))
        except Exception as e:
            log(f"guia {item.get('name')}: {e}")
            lines.append(f"- Guia {item.get('name')}: não consegui abrir.")

    for n, item in enumerate(assets.get("images") or []):
        try:
            src = download(item["url"], workdir / f"ref_{n}{_ext(item['url'], '.jpg')}")
            view = workdir / f"ref_{n}_ver.jpg"
            _on_white(_fit(Image.open(src))).save(view, quality=86)
            images.append((f"Imagem de referência {n + 1} ({item.get('name') or 'imagem'})", view))
        except Exception as e:
            log(f"imagem de referência {item.get('name')}: {e}")

    for n, item in enumerate(assets.get("fonts") or []):
        name = str(item.get("name") or f"Fonte {n + 1}")
        try:
            src = download(item["url"], workdir / f"fonte_{n}{_ext(item['url'], '.ttf')}")
            if not font_ok(src):
                lines.append(f"- Fonte \"{name}\": o arquivo não abre (use .ttf, .otf, .woff ou .woff2).")
                continue
            key = f"marca-{_key(item['url'])}"
            fonts[key] = {"url": item["url"], "name": Path(name).stem[:80], "path": src}
            spec_img = font_specimen(src, name, workdir / f"fonte_{n}.jpg")
            if spec_img:
                images.append((f"Fonte da marca {key} ({Path(name).stem})", spec_img))
        except Exception as e:
            log(f"fonte {name}: {e}")

    for item in assets.get("sfx") or []:
        role = SFX_ROLE.get(item.get("role") or "", "impact")
        sfx.setdefault(role, []).append(item["url"])
    if sfx:
        nomes = {"whoosh": "transição (whoosh nos cortes)", "impact": "impacto (abertura, palavras-chave, CTA)",
                 "riser": "subida (antes do CTA)"}
        lines.append("- Efeitos sonoros da marca (já entram sozinhos no vídeo): "
                     + "; ".join(f"{nomes[r]}: {len(u)} arquivo(s)" for r, u in sfx.items()))

    for item in (assets.get("music") or [])[:1]:
        try:
            src = download(item["url"], workdir / f"trilha{_ext(item['url'], '.mp3')}")
            dur = _duration(src)
            music = item["url"]
            lines.append(f"- Trilha da marca \"{item.get('name')}\"" + (f" ({dur:.0f}s)" if dur else "")
                         + ": entra em todos os vídeos (repete se o vídeo for maior). O musicPrompt fica só de reserva.")
        except Exception as e:
            log(f"trilha {item.get('name')}: {e}")

    if logo:
        lines.append("- Há logo da marca: ele aparece no fecho (CTA) e pode virar marca d'água num canto (spec.brand.watermark).")
    if fonts:
        lines.append("- Fontes da marca (use as chaves nos campos font de title/caption/cta): "
                     + "; ".join(f"{k} = {f['name']}" for k, f in fonts.items()))
    if guide_text:
        lines.append("- Texto extraído do guia de marca:\n" + "\n\n".join(guide_text)[:MAX_GUIDE_TEXT])
    return {"text": "\n".join(lines) or "- (nenhum arquivo enviado)", "images": images, "fonts": fonts, "logo": logo,
            "sfx": sfx, "music": music}
