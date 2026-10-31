"""Chamadas aos provedores pagos (OpenRouter e ElevenLabs) e downloads, usadas pelo render
dos vídeos (worker.py) e pela montagem de templates (template_builder.py)."""
import base64
import os
import subprocess

import requests


# Lidos na hora da chamada (o worker.py carrega o .env depois de importar este módulo).
def image_model():
    return os.environ.get("VIDEOGEN_IMAGE_MODEL", "google/gemini-nano-banana-2.1")


def music_credits_per_second():
    # Trilha: o ElevenLabs não informa o custo da música na resposta. Medido em 31/10/2026 pela
    # API de uso (plano Creator, music_v1): ~13,75 créditos por segundo pedido (10s = 138, 22s = 302).
    return float(os.environ.get("VIDEOGEN_MUSIC_CREDITS_PER_SECOND") or 13.75)


def generate_image(prompt, out_path, attempts=2, costs=None):
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY não configurada no worker.")
    last = ""
    for _ in range(attempts):
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "X-Title": "FQD News GEN - VideoGen"},
                json={
                    "model": image_model(),
                    "modalities": ["image", "text"],
                    "image_config": {"aspect_ratio": "9:16"},
                    "messages": [{"role": "user", "content": prompt}],
                    "usage": {"include": True},
                },
                timeout=240,
            )
            data = r.json()
            cost = (data.get("usage") or {}).get("cost")
            if costs is not None and cost is not None:
                costs.append({"step": "images", "provider": "openrouter", "usd": float(cost)})
            url = data["choices"][0]["message"]["images"][0]["image_url"]["url"]
            out_path.write_bytes(base64.b64decode(url.split(",", 1)[1]))
            return out_path
        except Exception:
            last = r.text[:200] if "r" in locals() else "sem resposta"
    raise RuntimeError(f"imagem falhou: {last}")


def generate_music(prompt, seconds, out_path, costs=None):
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY não configurada no worker.")
    prompt = (prompt or "Dark minimal electronic underscore, tense, subtle pulse").strip()
    if "no vocals" not in prompt.lower():
        prompt = "Instrumental only, no vocals. " + prompt
    length = max(10, seconds + 2)
    r = requests.post(
        "https://api.elevenlabs.io/v1/music",
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        json={"prompt": prompt, "music_length_ms": int(length * 1000), "model_id": "music_v1"},
        timeout=300,
    )
    if r.status_code != 200:
        raise RuntimeError(f"trilha falhou: HTTP {r.status_code} {r.text[:200]}")
    if costs is not None:
        costs.append({"step": "music", "provider": "elevenlabs", "credits": round(length * music_credits_per_second()),
                      "estimated": True})
    out_path.write_bytes(r.content)
    return out_path


def download(url, out_path):
    if url.startswith("file://"):  # testes locais
        from urllib.parse import unquote, urlparse
        out_path.write_bytes(open(unquote(urlparse(url).path), "rb").read())
        return out_path
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    out_path.write_bytes(r.content)
    return out_path


def silent_audio(seconds, out_path):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
                    "-t", str(seconds), str(out_path)], check=True)
    return out_path
