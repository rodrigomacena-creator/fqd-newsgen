import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { OPENROUTER_IMAGE_MODEL } from "./openrouter";

interface OpenRouterImageResponse {
  data: { b64_json: string; media_type?: string }[];
}

async function requestImage(
  prompt: string,
  model: string,
  aspectRatio?: string
): Promise<Buffer> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY não configurada. Adicione sua chave no arquivo .env."
    );
  }

  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Falha ao gerar imagem (${res.status}): ${errText.slice(0, 300)}`
    );
  }

  const json = (await res.json()) as OpenRouterImageResponse;
  const image = json.data?.[0];
  if (!image?.b64_json) {
    throw new Error("A API de imagens não retornou nenhuma imagem.");
  }

  return Buffer.from(image.b64_json, "base64");
}

export async function generateAndSaveImage(
  prompt: string,
  articleId: string,
  fileName: string,
  model: string = OPENROUTER_IMAGE_MODEL,
  aspectRatio?: string
): Promise<string> {
  const buffer = await requestImage(prompt, model, aspectRatio);

  const dir = path.join(process.cwd(), "public", "generated", articleId);
  await mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${fileName}.png`);
  await writeFile(filePath, buffer);

  return `/generated/${articleId}/${fileName}.png`;
}
