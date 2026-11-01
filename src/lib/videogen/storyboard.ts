// Storyboard: gera a imagem de cada cena ANTES do render, para a pessoa ver e trocar o que não gostou.
// A imagem fica em scene.preview = {url, prompt}; o worker usa essa imagem (em vez de gerar outra)
// enquanto o imagePrompt da cena continuar igual ao prompt que gerou a prévia.
import { put } from "@vercel/blob";
import type { VideoScene } from "./types";

/** Mesmo modelo de imagem do worker (VIDEOGEN_IMAGE_MODEL em worker/providers.py). */
export const VIDEOGEN_IMAGE_MODEL = process.env.VIDEOGEN_IMAGE_MODEL || "google/gemini-nano-banana-2.1";

/** Cena que precisa de imagem gerada (sem foto do usuário, sem ser "só texto", com prompt). */
export function needsGeneratedImage(sc: VideoScene): boolean {
  return !sc.imageUrl && !sc.stock && sc.layout !== "text_only" && Boolean(sc.imagePrompt.trim());
}

/** A prévia ainda vale (o prompt não mudou depois de gerada). */
export function previewIsFresh(sc: VideoScene): boolean {
  return Boolean(sc.preview && sc.preview.prompt === sc.imagePrompt);
}

/** Gera uma imagem 9:16 na OpenRouter e sobe no Blob. Devolve a URL e o custo em dólar. */
export async function generateSceneImage(jobId: string, index: number, prompt: string): Promise<{ url: string; usd: number }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY não configurada.");
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "FQD News GEN - VideoGen" },
      body: JSON.stringify({
        model: VIDEOGEN_IMAGE_MODEL,
        modalities: ["image", "text"],
        image_config: { aspect_ratio: "9:16" },
        messages: [{ role: "user", content: prompt }],
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(110_000),
    });
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
      usage?: { cost?: number };
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    } | null;
    const dataUrl = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (dataUrl?.includes(",")) {
      const buffer = Buffer.from(dataUrl.split(",", 2)[1], "base64");
      const blob = await put(`videogen/${jobId}/storyboard/cena-${index + 1}.jpg`, buffer, {
        access: "public",
        addRandomSuffix: true, // gerar de novo não pode servir a imagem antiga do cache
        contentType: "image/jpeg",
      });
      return { url: blob.url, usd: Number(data?.usage?.cost) || 0 };
    }
    lastError = data?.error?.message || `HTTP ${res.status}`;
  }
  throw new Error(`Não foi possível gerar a imagem da cena ${index + 1}: ${lastError}`);
}
