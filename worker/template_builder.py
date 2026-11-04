"""Montagem de template a partir de um vídeo de referência (/videogen/templates no app).

1. Baixa o vídeo, mede a duração e os cortes de cena (ffmpeg scene detection) e tira
   12 quadros espalhados.
2. Manda os quadros + as medidas para um modelo com visão (OpenRouter), que devolve a ficha
   de estilo no formato do motor genérico (render/template_engine.py), um guia para o roteirista
   e um roteiro curto de exemplo.
3. Se a ficha pede fundo com textura, gera a textura uma vez (nano banana) e sobe no Blob.
4. Renderiza um exemplo de 5s com o próprio motor genérico (imagens + trilha, sem narração).

Template "do zero" (origin = brand): no lugar do vídeo, a IA recebe o material da marca (logos, páginas do
guia, amostras das fontes, efeitos, trilha — brand_assets.collect_material) e a ideia escrita pelo usuário.
A ficha ganha o grupo "brand" (fontes, logo/marca d'água, efeitos e trilha da marca) e o exemplo tem 8s.
Ajuste (revisionRequest): a IA recebe a ficha atual + o pedido e devolve a ficha inteira de novo; o worker
renderiza outro exemplo. Vale para os dois tipos de template.
"""
import base64
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from brand_assets import collect_material, prepare_render
from providers import download, generate_image, generate_music, silent_audio
from render import template_engine
from render.audio_fx import build_sfx_track, sfx_cues
from render.common import mix
from render.cta_fx import overlay_cta
from render.motion import default_direction
from render.timeline import build_timeline

FRAMES = 12
SAMPLE_SECONDS = 5.0
BRAND_SAMPLE_SECONDS = 8.0


def vision_model():
    return os.environ.get("VIDEOGEN_VISION_MODEL") or os.environ.get("VIDEOGEN_TEXT_MODEL") or "anthropic/claude-sonnet-5.5"


# ---------- medidas do vídeo ----------

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
                          "-of", "json", str(path)], capture_output=True, text=True, check=True)
    data = json.loads(out.stdout)
    duration = float(data["format"]["duration"])
    video = next((s for s in data.get("streams", []) if s.get("codec_type") == "video"), {})
    has_audio = any(s.get("codec_type") == "audio" for s in data.get("streams", []))
    return duration, video.get("width"), video.get("height"), has_audio


def scene_cuts(path, threshold=0.3):
    """Instantes (s) em que o ffmpeg detecta troca de cena."""
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-vf", f"select='gt(scene,{threshold})',showinfo",
                          "-an", "-f", "null", "-"], capture_output=True, text=True)
    return [float(m) for m in re.findall(r"pts_time:([\d.]+)", out.stderr)]


def mean_volume(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-vn", "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True)
    m = re.search(r"mean_volume:\s*(-?[\d.]+) dB", out.stderr)
    return float(m.group(1)) if m else None


def extract_frames(path, duration, workdir, count=FRAMES):
    frames = []
    for i in range(count):
        t = duration * (i + 0.5) / count
        out = workdir / f"quadro_{i:02d}.jpg"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
                        "-vf", "scale=432:-2", "-q:v", "4", str(out)], check=True)
        if out.exists():
            frames.append((round(t, 2), out))
    return frames


# ---------- análise com IA ----------

def _spec_reference():
    lines = []
    for key, values in template_engine.CHOICES.items():
        lines.append(f"- {key}: {' | '.join(values)}")
    fonts = "\n".join(f"- {k}: {v}" for k, v in template_engine.FONT_DESCRIPTIONS.items())
    return "\n".join(lines), fonts


HEAD_REFERENCE = """Você é diretor de arte de vídeos curtos verticais (Reels/Shorts). Analise os quadros de um
vídeo de referência e descreva o estilo de edição dele no formato que o nosso motor de render entende.
O motor é genérico: em cada cena mostra um fundo, uma imagem gerada por IA (com tratamento e movimento),
um texto curto na tela (título da cena), a legenda da narração sincronizada palavra por palavra e,
no fim, um card de CTA. Ele não reproduz vídeo filmado, pessoas reais, logos nem efeitos 3D: escolha
sempre a aproximação mais fiel dentro das opções.

Medidas do vídeo (feitas por código, confie nelas):
{measures}

Observações do usuário sobre o que aproveitar: {notes}

"""

SPEC_FORMAT = """Opções válidas dos campos com lista:
{choices}

Fontes disponíveis (escolha a mais parecida com a da referência):
{fonts}

Formato da ficha "spec" (todas as cores em "#RRGGBB"; números dentro das faixas):
{{
  "palette": {{"background": cor de fundo dominante, "text": cor do texto principal, "accent": cor de destaque, "accentText": cor do texto sobre o destaque}},
  "background": {{"kind": ..., "color2": segunda cor do gradiente, "texturePrompt": se kind=texture, prompt em inglês de uma textura de fundo vertical SEM texto (papel, concreto, grade...)}},
  "image": {{"layout": ..., "filter": ..., "motion": ..., "scale": 0.4-1 (largura do card/círculo), "y": 0.04-0.96 (centro vertical do card), "cornerRadius": 0-200, "shadow": true/false, "borderColor": cor ou "", "borderWidth": 0-30}},
  "caption": {{"enabled": true/false, "font": ..., "size": 40-200 (px num quadro 1080x1920), "uppercase": true/false, "color": ..., "stroke": cor do contorno ou "", "strokeWidth": 0-14, "y": 0.04-0.96, "animation": ..., "highlight": ..., "maxWordsPerLine": 1-6, "box": fundo atrás da linha true/false, "boxColor": ...}},
  "title": {{"enabled": true/false, "font": ..., "size": 40-200, "uppercase": true/false, "color": ..., "stroke": cor do contorno ou "", "strokeWidth": 0-14, "y": 0.04-0.96, "animation": ..., "box": true/false, "boxColor": ...}},
  "transition": {{"kind": ..., "durationS": 0.05-0.9}},
  "overlay": {{"grain": 0-1, "vignette": 0-1, "tint": cor ou "", "tintStrength": 0-0.6, "letterbox": true/false}},
  "cta": {{"style": ..., "background": ..., "color": ..., "font": ...}},
  "motion": {{"energy": quanto tudo se mexe (calm = lento e elegante, medium, high = frenético), "camera": none | handheld (tremida de mão contínua) | shake_on_beat (tranco a cada corte e palavra-chave), "particles": none | dust (poeira clara) | bokeh (círculos desfocados na cor de destaque) | sparks (faíscas subindo), "beatPulse": true/false (zoom rápido a cada corte e palavra-chave), "textIdle": none | float (texto flutua) | pulse (texto respira), "textExit": true/false (texto sai antes do corte)}}
}}

"""

MOTION_REFERENCE = """Movimento é o que mais diferencia um Reels de um slideshow. Observe nos quadros e nas medidas como
a referência se mexe: zoom constante, câmera tremida, textos que entram palavra por palavra (title
"kinetic"), cortes com chicote (whip_pan), mergulho (zoom_in) ou glitch. Na dúvida, prefira mais
movimento a menos: só escolha "static", energy "calm" e camera "none" se a referência for
claramente parada e contemplativa. Varie as escolhas conforme o vídeo, não use sempre as mesmas.

"""

RESPONSE_FORMAT = """Texto sobre foto precisa ser legível: use contorno, caixa de fundo ou posicione fora da imagem.
No "sample", escreva o texto puro, sem markdown (nada de *asteriscos*).

Responda SÓ com um JSON válido (sem markdown), em português do Brasil nos textos:
{{
  "name": nome curto e descritivo do estilo (2 a 5 palavras),
  "summary": {{"tom": quando usar este estilo (uma frase), "ritmo": ritmo de cortes (ex.: "Cenas de 1–2s, corte seco"), "cenaS": [mínimo, máximo] de segundos por cena, "semNarracao": true se o vídeo é só texto na tela sem voz, "cta": como a referência fecha}},
  "guide": guia em markdown para quem escreve o roteiro deste estilo: tom de voz, tamanho das frases, como usar o texto na tela (onScreen), quantas palavras-chave destacar, e como escrever o imagePrompt (em inglês) para as imagens combinarem com a referência,
  "imageStyle": sufixo em inglês acrescentado a todo prompt de imagem (enquadramento, luz, cor, textura, o que evitar; nunca peça texto na imagem),
  "musicPrompt": prompt em inglês da trilha instrumental parecida com a da referência,
  "spec": a ficha acima,
  "sample": {{"title": título, "scenes": [2 cenas, cada uma {{"narration": até 5 palavras, "onScreen": até 4 palavras, "imagePrompt": em inglês}}], "cta": {{"onScreen": até 4 palavras}}, "keywords": [1 ou 2 palavras da narração para destacar]}} — exemplo de 5s sobre posicionamento de marca
}}"""

PROMPT = HEAD_REFERENCE + SPEC_FORMAT + MOTION_REFERENCE + RESPONSE_FORMAT



BRAND_SPEC_EXTRA = """
Grupo extra da ficha, só para templates com material de marca (dentro de "spec"):
  "brand": {{"watermark": none | top_left | top_right | bottom_left | bottom_right (logo pequeno num canto durante o vídeo; none se a ideia não pedir ou se atrapalhar), "watermarkSize": 0.06-0.4 (largura do logo / largura do vídeo), "watermarkOpacity": 0.2-1}}
  Prefira o canto da faixa sem texto: título acima de y 0.16 ocupa a faixa de cima; legenda abaixo de y 0.7, a de baixo.
Fontes, logo, efeitos sonoros e trilha da marca entram sozinhos (não escreva URLs). Para usar uma fonte
da marca, ponha a chave dela (ex.: "marca-1a2b3c4d5e") no campo "font" de title, caption ou cta.
"""

HEAD_BRAND = """Você é diretor de arte de vídeos curtos verticais (Reels/Shorts) e vai criar, do zero, o template
de vídeo de uma marca. O motor de render é genérico: em cada cena mostra um fundo, uma imagem gerada por
IA (com tratamento e movimento), um texto curto na tela (título da cena), a legenda da narração
sincronizada palavra por palavra e, no fim, um card de CTA com o logo. Ele não reproduz vídeo filmado,
pessoas reais nem efeitos 3D: escolha sempre a aproximação mais fiel dentro das opções.

Siga a identidade da marca: cores do guia (paleta com os hex exatos quando o guia trouxer), fontes da
marca, tom de voz e o que o guia proíbe. A ideia do usuário manda no clima, nas animações e na trilha.

IDEIA DO TEMPLATE (escrita pelo usuário):
{brief}

MATERIAL DA MARCA (as imagens seguem depois deste texto):
{material}

"""

MOTION_BRAND = """Movimento é o que mais diferencia um Reels de um slideshow. Traduza as animações que o usuário
descreveu para as opções do motor (title.animation, caption.animation, transition, image.motion, motion.*).
Se ele não falou de movimento, escolha o que combina com a personalidade da marca.

"""

HEAD_REVISE = """Você é diretor de arte de vídeos curtos verticais (Reels/Shorts) e está ajustando um template de
vídeo que já existe. O usuário viu o exemplo renderizado e pediu uma alteração. Aplique o pedido na ficha
e devolva TUDO de novo no formato abaixo. Mude só o que o pedido pede (e o que for consequência direta
dele); o resto fica exatamente igual. Se o pedido não couber nas opções do motor, chegue o mais perto
possível. Acrescente na resposta o campo "note": uma ou duas frases para o usuário dizendo o que você
mudou (e o que não deu para fazer exatamente, se for o caso).

PEDIDO DE ALTERAÇÃO:
{request}

Pedidos anteriores, já aplicados (do mais antigo ao mais novo):
{history}

{origin_context}

FICHA ATUAL ("spec"):
{spec}

imageStyle atual: {image_style}
musicPrompt atual: {music_prompt}
Roteiro do exemplo atual ("sample"): {sample}

Guia atual do roteirista:
{guide}

"""


def _parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("A IA não devolveu a ficha em JSON.")
    return json.loads(text[start:end + 1])


def _ask(prompt, images, costs, step="analysis"):
    """Manda o prompt + imagens [(rótulo, caminho)] para o modelo com visão e devolve o JSON."""
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada no worker.")
    content = [{"type": "text", "text": prompt}]
    for label, path in images:
        content.append({"type": "text", "text": f"{label}:"})
        mime = "image/png" if str(path).lower().endswith(".png") else "image/jpeg"
        b64 = base64.b64encode(Path(path).read_bytes()).decode()
        content.append({"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}})
    last_err = ""
    for _ in range(2):
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "X-Title": "FQD News GEN - VideoGen"},
            json={"model": vision_model(), "messages": [{"role": "user", "content": content}],
                  "max_tokens": 10000, "temperature": 0.3, "usage": {"include": True}},
            timeout=300,
        )
        data = r.json()
        cost = (data.get("usage") or {}).get("cost")
        if cost is not None:
            costs.append({"step": step, "provider": "openrouter", "usd": float(cost)})
        if "choices" not in data:
            last_err = (data.get("error") or {}).get("message") or r.text[:300]
            continue
        try:
            return _parse_json(data["choices"][0]["message"]["content"] or "")
        except (ValueError, RuntimeError) as e:
            last_err = str(e)
    raise RuntimeError(f"A IA não conseguiu montar a ficha: {last_err}")


def _fonts_text(brand_fonts=None):
    """Fontes do motor + as da marca (chave = nome do arquivo enviado)."""
    _, fonts = _spec_reference()
    extra = "\n".join(f"- {k}: fonte da marca \"{f['name']}\" (veja a amostra nas imagens)" for k, f in (brand_fonts or {}).items())
    return fonts + ("\n" + extra if extra else "")


def _brand_response():
    """Formato da resposta para template de marca: 3 cenas, exemplo de 8s sobre a própria marca."""
    return (RESPONSE_FORMAT
            .replace("[2 cenas,", "[3 cenas,")
            .replace("exemplo de 5s sobre posicionamento de marca",
                     "exemplo de 8s que apresenta a marca no estilo do template (use o nome/assunto da marca)")
            .replace("parecida com a da referência", "que combina com a ideia do usuário e a marca")
            .replace("para as imagens combinarem com a referência", "para as imagens combinarem com a identidade da marca")
            .replace("como a referência fecha", "como o vídeo fecha"))


def analyze(frames, measures, notes, costs):
    choices, _ = _spec_reference()
    prompt = PROMPT.format(measures=measures, notes=notes or "nenhuma", choices=choices, fonts=_fonts_text())
    return _ask(prompt, [(f"Quadro em {t}s", path) for t, path in frames], costs)


def analyze_brand(template, material, costs):
    choices, _ = _spec_reference()
    prompt = (HEAD_BRAND.format(brief=(template.get("brief") or "").strip() or "(sem ideia escrita: proponha o melhor para a marca)",
                                material=material["text"])
              + SPEC_FORMAT.replace("escolha a mais parecida com a da referência", "prefira as fontes da marca quando houver")
              .format(choices=choices, fonts=_fonts_text(material["fonts"]))
              + BRAND_SPEC_EXTRA.format() + MOTION_BRAND + _brand_response().format())
    return _ask(prompt, material["images"], costs)


def _guide_core(guide):
    """Guia sem as seções que o worker acrescenta (estilo das imagens, trilha): voltam no fim."""
    return re.split(r"\n\n## (?:Estilo das imagens|Trilha)\b", guide or "", maxsplit=1)[0].strip()


def analyze_revision(template, material, costs):
    state = template.get("buildState") if isinstance(template.get("buildState"), dict) else {}
    spec = template.get("spec") if isinstance(template.get("spec"), dict) else {}
    spec_view = {k: v for k, v in spec.items() if k != "brand"}
    if isinstance(spec.get("brand"), dict):  # a IA vê as escolhas da marca d'água, não as URLs
        b = spec["brand"]
        spec_view["brand"] = {k: b.get(k) for k in ("watermark", "watermarkSize", "watermarkOpacity")}
    history = [r for r in (template.get("history") or []) if isinstance(r, str) and r.strip()]
    brand = template.get("origin") == "brand"
    if brand:
        origin = ("Template de MARCA. Ideia original do usuário:\n" + ((template.get("brief") or "").strip() or "(sem ideia escrita)")
                  + "\n\nMaterial da marca (imagens depois do texto):\n" + material["text"])
    else:
        origin = "Template montado a partir de um vídeo de referência. Observações do usuário: " + (template.get("notes") or "nenhuma")
    choices, _ = _spec_reference()
    fonts = dict(material["fonts"]) if material else {}
    for k, f in ((spec.get("brand") or {}).get("fonts") or {}).items():
        fonts.setdefault(k, f)
    prompt = (HEAD_REVISE.format(
        request=template["revisionRequest"].strip(),
        history="\n".join(f"- {h}" for h in history) or "- (nenhum)",
        origin_context=origin,
        spec=json.dumps(spec_view, ensure_ascii=False),
        image_style=state.get("imageStyle") or "(não guardado)",
        music_prompt=state.get("musicPrompt") or "(não guardado)",
        sample=json.dumps(state.get("sample"), ensure_ascii=False) if state.get("sample") else "(não guardado: escreva um novo)",
        guide=_guide_core(template.get("guide")) or "(vazio)",
    ) + SPEC_FORMAT.replace("escolha a mais parecida com a da referência", "mantenha as atuais, a não ser que o pedido mude")
        .format(choices=choices, fonts=_fonts_text(fonts))
      + (BRAND_SPEC_EXTRA.format() if brand or spec.get("brand") else "")
      + (_brand_response() if brand else RESPONSE_FORMAT).format())
    return _ask(prompt, material["images"] if material else [], costs, step="revision")


# ---------- exemplo ----------

def sample_job(result, spec, seconds=SAMPLE_SECONDS):
    """Roteiro de exemplo com tempos de palavra espalhados em `seconds` (sem narração de verdade)."""
    sample = result.get("sample") or {}
    scenes = [s for s in (sample.get("scenes") or []) if isinstance(s, dict)][:4] or [
        {"narration": "Sua marca precisa de foco", "onScreen": "Foco", "imagePrompt": "minimal still life"}]
    cta = sample.get("cta") if isinstance(sample.get("cta"), dict) else {}
    script = {
        "title": sample.get("title") or "Exemplo",
        "scenes": [{"narration": str(s.get("narration") or "").strip(), "onScreen": str(s.get("onScreen") or "").strip(),
                    "imagePrompt": str(s.get("imagePrompt") or "").strip(), "visual": "", "durationS": 1.5,
                    # o exemplo já mostra o movimento por cena que os roteiros novos recebem
                    "direction": default_direction(i)} for i, s in enumerate(scenes)],
        "cta": {"onScreen": str(cta.get("onScreen") or "Siga para mais").strip(), "narration": ""},
        "keywords": [str(k) for k in (sample.get("keywords") or [])][:3],
    }
    words_per_scene = [len(s["narration"].split()) for s in script["scenes"]]
    total = sum(words_per_scene)
    words = []
    cta_at = seconds - 1.7  # CTA_HOLD (1,8s) depois disso fecha no tempo pedido
    if total:
        step = (cta_at - 0.25) / total
        t = 0.15
        for s in script["scenes"]:
            for w in s["narration"].split():
                words.append([w, round(t, 3), round(t + step * 0.85, 3)])
                t += step
    else:  # estilo sem narração: cenas de duração fixa
        each = cta_at / len(script["scenes"])
        for s in script["scenes"]:
            s["durationS"] = each
    return {"script": script, "narrationWords": words, "durationS": seconds, "templateSpec": spec}


def _brand_group(spec_raw, prev_spec, material, upload):
    """Grupo "brand" da ficha: escolhas da IA (marca d'água) + arquivos da marca (nunca vindos da IA)."""
    prev = (prev_spec or {}).get("brand") if isinstance((prev_spec or {}).get("brand"), dict) else None
    if not material and not prev:
        spec_raw.pop("brand", None)  # template sem marca: a ficha fica como sempre foi
        return
    ai = spec_raw.get("brand") if isinstance(spec_raw.get("brand"), dict) else {}
    brand = dict(prev or {})
    for k in ("watermark", "watermarkSize", "watermarkOpacity"):
        if k in ai:
            brand[k] = ai[k]
    if material:
        brand["fonts"] = {k: {"url": f["url"], "name": f["name"]} for k, f in material["fonts"].items()}
        brand["sfx"] = material["sfx"]
        brand["musicUrl"] = material["music"] or ""
        if material["logo"] and not brand.get("logoUrl"):
            try:  # o logo vai em PNG (SVG já rasterizado) para o render e o fecho
                brand["logoUrl"] = upload(material["logo"], "logo")
            except Exception as e:
                print("aviso: logo da marca não subiu:", e, flush=True)
        elif not material["logo"]:
            brand["logoUrl"] = ""
    spec_raw["brand"] = brand


def _finish(result, workdir, report, costs, upload, material=None, prev_spec=None, seconds=SAMPLE_SECONDS):
    """Textura, ficha final, exemplo renderizado e payload do 'done'."""
    spec_raw = result.get("spec") if isinstance(result.get("spec"), dict) else {}
    report(40)

    # textura de fundo (uma vez por template; no ajuste, reaproveita se o prompt não mudou)
    bg = spec_raw.get("background") if isinstance(spec_raw.get("background"), dict) else {}
    prev_bg = (prev_spec or {}).get("background") or {}
    texture_path = None
    if bg.get("kind") == "texture" and bg.get("texturePrompt"):
        if prev_bg.get("textureUrl") and prev_bg.get("texturePrompt") == bg["texturePrompt"]:
            bg["textureUrl"] = prev_bg["textureUrl"]
            try:
                texture_path = download(bg["textureUrl"], workdir / "textura.jpg") if not bg["textureUrl"].startswith("asset:") else None
            except Exception as e:
                print("aviso: textura guardada falhou:", e, flush=True)
        else:
            try:
                texture_path = generate_image(
                    f"{bg['texturePrompt']}. Vertical 9:16 full-frame background texture, no text, no letters, no logos, "
                    "no people, evenly lit, seamless.", workdir / "textura.jpg", costs=costs)
                bg["textureUrl"] = upload(texture_path, "texture")
            except Exception as e:  # sem textura o motor cai para cor lisa
                print("aviso: textura falhou:", e, flush=True)
    elif prev_bg.get("textureUrl", "").startswith("asset:") and bg.get("kind") == "texture":
        bg["textureUrl"] = prev_bg["textureUrl"]  # textura fixa do worker (templates vindos dos estilos embutidos)
        from render.common import asset
        texture_path = Path(asset(Path(bg["textureUrl"][6:]).name))
    _brand_group(spec_raw, prev_spec, material, upload)
    spec = template_engine.normalize_spec(spec_raw)
    report(50)

    files = prepare_render(spec, workdir)
    job = sample_job(result, spec, seconds)
    style = str(result.get("imageStyle") or "").strip()
    images = {}
    with ThreadPoolExecutor(4) as ex:
        music_f = None if files["music"] else ex.submit(generate_music, result.get("musicPrompt"), seconds + 5,
                                                        workdir / "trilha.mp3", costs=costs)
        futs = {i: ex.submit(generate_image, f"{s['imagePrompt']}. {style}".strip(), workdir / f"cena_{i}.jpg", costs=costs)
                for i, s in enumerate(job["script"]["scenes"]) if spec["image"]["layout"] != "none" or spec["background"]["kind"] == "blurred_image"}
        for i, f in futs.items():
            try:
                images[i] = f.result()
            except Exception as e:
                print(f"aviso: imagem {i} do exemplo falhou:", e, flush=True)
        music = files["music"]
        if music_f is not None:
            try:
                music = music_f.result()
            except Exception as e:
                print("aviso: trilha do exemplo falhou:", e, flush=True)
                music = silent_audio(seconds + 1, workdir / "trilha.mp3")
    report(70)

    video_only = workdir / "exemplo_video.mp4"
    dur = template_engine.render(job, {"images": images, "spec": spec, "texture": texture_path, "fonts": files["fonts"],
                                       "watermark": files["watermark"]}, str(video_only),
                                 on_progress=lambda p: report(70 + 20 * p))
    dur = min(dur, seconds)
    tl = build_timeline(job["script"], job["narrationWords"])
    if files["logo"]:  # o fecho mostra o logo da marca, como nos vídeos
        try:
            video_only = Path(overlay_cta(str(video_only), tl.cta_start, dur, str(workdir / "exemplo_cta.mp4"),
                                          logo=str(files["logo"]), accent=spec["palette"]["accent"]))
        except Exception as e:
            print("aviso: logo no fecho do exemplo falhou:", e, flush=True)
    sfx = None
    if spec.get("brand"):  # exemplo de marca já mostra os efeitos sonoros (os da marca ou os padrões)
        try:
            sfx = build_sfx_track(sfx_cues(tl, job["script"]), dur, workdir / "efeitos.wav", custom=files["sfx"])
        except Exception as e:
            print("aviso: efeitos do exemplo falharam:", e, flush=True)
    final = workdir / "exemplo.mp4"
    mix(str(video_only), None, str(music), dur, str(final), sfx=sfx)
    report(93)
    sample_url = upload(final, "sample")

    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    guide = _guide_core(str(result.get("guide") or ""))
    if style:
        guide += f"\n\n## Estilo das imagens (acrescente ao fim de todo imagePrompt)\n{style}"
    if result.get("musicPrompt"):
        guide += f"\n\n## Trilha\nmusicPrompt de referência: {result['musicPrompt']}"
    return {
        "name": str(result.get("name") or "").strip()[:80],
        "spec": spec,
        "summary": summary,
        "guide": guide,
        "sampleUrl": sample_url,
        # o app guarda e devolve no próximo ajuste (a IA parte do que já existe)
        "buildState": {"sample": result.get("sample"), "imageStyle": style, "musicPrompt": result.get("musicPrompt") or ""},
        # ajuste: o que a IA diz que mudou (aparece na versão)
        "note": str(result.get("note") or "").strip()[:600],
    }


def build(template, workdir, report, costs, upload):
    """Monta (ou ajusta) o template. upload(path, file_kind) -> url pública. Devolve o payload do 'done'."""
    workdir.mkdir(parents=True, exist_ok=True)
    brand = template.get("origin") == "brand"
    if template.get("revisionRequest") and isinstance(template.get("spec"), dict):
        material = collect_material(template.get("brandAssets"), workdir / "marca") if brand else None
        report(15)
        result = analyze_revision(template, material, costs)
        return _finish(result, workdir, report, costs, upload, material, template["spec"],
                       BRAND_SAMPLE_SECONDS if brand else SAMPLE_SECONDS)
    if brand:
        material = collect_material(template.get("brandAssets"), workdir / "marca")
        report(15)
        result = analyze_brand(template, material, costs)
        return _finish(result, workdir, report, costs, upload, material, None, BRAND_SAMPLE_SECONDS)

    if template.get("sourceUrl"):  # link do YouTube/Pinterest: o worker baixa o vídeo
        from link_download import download_link
        ref, _title = download_link(template["sourceUrl"], workdir / "referencia.mp4")
    else:
        ref = download(template["referenceUrl"], workdir / "referencia.mp4")
    report(8)

    duration, width, height, has_audio = probe(ref)
    if duration > 600:
        raise RuntimeError("O vídeo de referência passa de 10 minutos. Envie um trecho menor.")
    cuts = scene_cuts(ref)
    volume = mean_volume(ref) if has_audio else None
    scene_count = len(cuts) + 1
    measures = (
        f"- duração: {duration:.1f}s; resolução {width}x{height}\n"
        f"- trocas de cena detectadas: {len(cuts)} (média de {duration / scene_count:.2f}s por cena)"
        + (f"; instantes: {', '.join(f'{c:.1f}' for c in cuts[:40])}" if cuts else "") + "\n"
        f"- áudio: {'sim' if has_audio else 'não'}" + (f", volume médio {volume:.0f} dB" if volume is not None else "")
    )
    frames = extract_frames(ref, duration, workdir)
    if not frames:
        raise RuntimeError("Não consegui extrair quadros do vídeo de referência.")
    report(15)

    result = analyze(frames, measures, template.get("notes"), costs)
    return _finish(result, workdir, report, costs, upload)


def build_local(video, out_dir, notes=""):
    """Teste local sem o app: python3 worker.py --template-video ref.mp4|URL --out pasta/"""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    costs = []

    def upload(path, kind):
        dest = out_dir / Path(path).name
        dest.write_bytes(Path(path).read_bytes())
        return dest.resolve().as_uri()

    if str(video).startswith(("http://", "https://")):  # link do YouTube/Pinterest
        template = {"sourceUrl": str(video), "referenceUrl": str(video), "notes": notes}
    else:
        template = {"referenceUrl": Path(video).resolve().as_uri(), "notes": notes}
    result = build(template, out_dir / "work", lambda p: print(f"{p:.0f}%", flush=True), costs, upload)
    (out_dir / "template.json").write_text(json.dumps({**result, "costs": costs}, ensure_ascii=False, indent=2))
    return result


def build_template_local(template_file, out_dir):
    """Teste local de template de marca / ajuste: python3 worker.py --template-file t.json --out pasta/
    t.json = o que o claim manda ({origin: "brand", brief, brandAssets com URLs file://...}; para ajustar,
    acrescente revisionRequest + spec/guide/buildState/history de um template.json anterior)."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    costs = []

    def upload(path, kind):
        dest = out_dir / f"{kind}{Path(path).suffix}"
        dest.write_bytes(Path(path).read_bytes())
        return dest.resolve().as_uri()

    template = json.loads(Path(template_file).read_text(encoding="utf-8"))
    result = build(template, out_dir / "work", lambda p: print(f"{p:.0f}%", flush=True), costs, upload)
    (out_dir / "template.json").write_text(json.dumps({**result, "costs": costs}, ensure_ascii=False, indent=2))
    return result
