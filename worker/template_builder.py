"""Montagem de template a partir de um vídeo de referência (/videogen/templates no app).

1. Baixa o vídeo, mede a duração e os cortes de cena (ffmpeg scene detection) e tira
   12 quadros espalhados.
2. Manda os quadros + as medidas para um modelo com visão (OpenRouter), que devolve a ficha
   de estilo no formato do motor genérico (render/template_engine.py), um guia para o roteirista
   e um roteiro curto de exemplo.
3. Se a ficha pede fundo com textura, gera a textura uma vez (nano banana) e sobe no Blob.
4. Renderiza um exemplo de 5s com o próprio motor genérico (imagens + trilha, sem narração).
"""
import base64
import json
import os
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

from providers import download, generate_image, generate_music, silent_audio
from render import template_engine
from render.common import mix

FRAMES = 12
SAMPLE_SECONDS = 5.0


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


PROMPT = """Você é diretor de arte de vídeos curtos verticais (Reels/Shorts). Analise os quadros de um
vídeo de referência e descreva o estilo de edição dele no formato que o nosso motor de render entende.
O motor é genérico: em cada cena mostra um fundo, uma imagem gerada por IA (com tratamento e movimento),
um texto curto na tela (título da cena), a legenda da narração sincronizada palavra por palavra e,
no fim, um card de CTA. Ele não reproduz vídeo filmado, pessoas reais, logos nem efeitos 3D: escolha
sempre a aproximação mais fiel dentro das opções.

Medidas do vídeo (feitas por código, confie nelas):
{measures}

Observações do usuário sobre o que aproveitar: {notes}

Opções válidas dos campos com lista:
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

Movimento é o que mais diferencia um Reels de um slideshow. Observe nos quadros e nas medidas como
a referência se mexe: zoom constante, câmera tremida, textos que entram palavra por palavra (title
"kinetic"), cortes com chicote (whip_pan), mergulho (zoom_in) ou glitch. Na dúvida, prefira mais
movimento a menos: só escolha "static", energy "calm" e camera "none" se a referência for
claramente parada e contemplativa. Varie as escolhas conforme o vídeo, não use sempre as mesmas.

Texto sobre foto precisa ser legível: use contorno, caixa de fundo ou posicione fora da imagem.
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


def _parse_json(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise RuntimeError("A IA não devolveu a ficha em JSON.")
    return json.loads(text[start:end + 1])


def analyze(frames, measures, notes, costs):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada no worker.")
    choices, fonts = _spec_reference()
    prompt = PROMPT.format(measures=measures, notes=notes or "nenhuma", choices=choices, fonts=fonts)
    content = [{"type": "text", "text": prompt}]
    for t, path in frames:
        content.append({"type": "text", "text": f"Quadro em {t}s:"})
        b64 = base64.b64encode(path.read_bytes()).decode()
        content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
    last_err = ""
    for _ in range(2):
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "X-Title": "FQD News GEN - VideoGen"},
            json={"model": vision_model(), "messages": [{"role": "user", "content": content}],
                  "max_tokens": 8000, "temperature": 0.3, "usage": {"include": True}},
            timeout=300,
        )
        data = r.json()
        cost = (data.get("usage") or {}).get("cost")
        if cost is not None:
            costs.append({"step": "analysis", "provider": "openrouter", "usd": float(cost)})
        if "choices" not in data:
            last_err = (data.get("error") or {}).get("message") or r.text[:300]
            continue
        try:
            return _parse_json(data["choices"][0]["message"]["content"] or "")
        except (ValueError, RuntimeError) as e:
            last_err = str(e)
    raise RuntimeError(f"Análise do vídeo falhou: {last_err}")


# ---------- exemplo de 5s ----------

def sample_job(result, spec):
    """Roteiro de exemplo com tempos de palavra espalhados em 5s (sem narração de verdade)."""
    sample = result.get("sample") or {}
    scenes = [s for s in (sample.get("scenes") or []) if isinstance(s, dict)][:3] or [
        {"narration": "Sua marca precisa de foco", "onScreen": "Foco", "imagePrompt": "minimal still life"}]
    cta = sample.get("cta") if isinstance(sample.get("cta"), dict) else {}
    script = {
        "title": sample.get("title") or "Exemplo",
        "scenes": [{"narration": str(s.get("narration") or "").strip(), "onScreen": str(s.get("onScreen") or "").strip(),
                    "imagePrompt": str(s.get("imagePrompt") or "").strip(), "visual": "", "durationS": 1.5} for s in scenes],
        "cta": {"onScreen": str(cta.get("onScreen") or "Siga para mais").strip(), "narration": ""},
        "keywords": [str(k) for k in (sample.get("keywords") or [])][:3],
    }
    words_per_scene = [len(s["narration"].split()) for s in script["scenes"]]
    total = sum(words_per_scene)
    words = []
    cta_at = 3.3  # CTA_HOLD (1,8s) depois disso fecha em ~5s
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
    return {"script": script, "narrationWords": words, "durationS": 5, "templateSpec": spec}


def build(template, workdir, report, costs, upload):
    """Monta o template. upload(path, file_kind) -> url pública. Devolve o payload do 'done'."""
    workdir.mkdir(parents=True, exist_ok=True)
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
    spec_raw = result.get("spec") if isinstance(result.get("spec"), dict) else {}
    report(40)

    # textura de fundo (uma vez por template)
    bg = spec_raw.get("background") if isinstance(spec_raw.get("background"), dict) else {}
    texture_path = None
    if bg.get("kind") == "texture" and bg.get("texturePrompt"):
        try:
            texture_path = generate_image(
                f"{bg['texturePrompt']}. Vertical 9:16 full-frame background texture, no text, no letters, no logos, "
                "no people, evenly lit, seamless.", workdir / "textura.jpg", costs=costs)
            bg["textureUrl"] = upload(texture_path, "texture")
        except Exception as e:  # sem textura o motor cai para cor lisa
            print("aviso: textura falhou:", e, flush=True)
    spec = template_engine.normalize_spec(spec_raw)
    report(50)

    job = sample_job(result, spec)
    style = str(result.get("imageStyle") or "").strip()
    images = {}
    with ThreadPoolExecutor(4) as ex:
        music_f = ex.submit(generate_music, result.get("musicPrompt"), 10, workdir / "trilha.mp3", costs=costs)
        futs = {i: ex.submit(generate_image, f"{s['imagePrompt']}. {style}".strip(), workdir / f"cena_{i}.jpg", costs=costs)
                for i, s in enumerate(job["script"]["scenes"]) if spec["image"]["layout"] != "none" or spec["background"]["kind"] == "blurred_image"}
        for i, f in futs.items():
            try:
                images[i] = f.result()
            except Exception as e:
                print(f"aviso: imagem {i} do exemplo falhou:", e, flush=True)
        try:
            music = music_f.result()
        except Exception as e:
            print("aviso: trilha do exemplo falhou:", e, flush=True)
            music = silent_audio(SAMPLE_SECONDS + 1, workdir / "trilha.mp3")
    report(70)

    video_only = workdir / "exemplo_video.mp4"
    dur = template_engine.render(job, {"images": images, "spec": spec, "texture": texture_path}, str(video_only),
                                 on_progress=lambda p: report(70 + 20 * p))
    final = workdir / "exemplo.mp4"
    mix(str(video_only), None, str(music), min(dur, SAMPLE_SECONDS), str(final))
    report(93)
    sample_url = upload(final, "sample")

    summary = result.get("summary") if isinstance(result.get("summary"), dict) else {}
    guide = str(result.get("guide") or "").strip()
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
    }


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
