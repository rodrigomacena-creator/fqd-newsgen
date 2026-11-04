import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// briefing: imagens do vídeo (sobem antes do job existir); perfis: logos das empresas
const IMAGE_PATH = /^videogen\/(briefing|perfis)\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(jpg|jpeg|png|webp)$/;
// vozes: amostras de áudio para treinar uma voz no ElevenLabs (apagadas depois do envio)
const AUDIO_PATH = /^videogen\/vozes\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(mp3|wav|m4a|ogg|webm)$/;
// vídeo base: vídeo pronto do usuário que vira a trilha fixa das cenas (fica na pasta do job)
const VIDEO_PATH = /^videogen\/[a-z0-9]{16,40}\/base\/[a-z0-9-]{1,60}\.(mp4|mov|webm)$/;
// vídeo enviado para uma cena do storyboard (toca no lugar da imagem)
const CLIP_PATH = /^videogen\/[a-z0-9]{16,40}\/clipes\/[a-z0-9-]{1,60}\.(mp4|mov|webm)$/;
// áudio/vídeo enviado no passo "Quem fala" da criação (sobe antes do job existir)
const BASE_PATH = /^videogen\/base\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(mp4|mov|webm|mp3|wav|m4a|ogg)$/;
// material da marca de um template "do zero" (sobe antes do template existir; apagado com ele)
const BRAND_PATH = /^videogen\/marcas\/[a-z0-9]{8,32}\/(logo|guia|fonte|sfx|trilha|imagem)-[a-z0-9-]{1,60}\.[a-z0-9]{2,5}$/;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BRAND_RULES: Record<string, { types: string[]; maxMb: number }> = {
  logo: { types: [...IMAGE_TYPES, "image/svg+xml"], maxMb: 15 },
  guia: { types: [...IMAGE_TYPES, "image/svg+xml", "application/pdf"], maxMb: 60 },
  fonte: { types: ["font/ttf", "font/otf", "font/woff", "font/woff2"], maxMb: 10 },
  sfx: { types: [], maxMb: 25 },
  trilha: { types: [], maxMb: 25 },
  imagem: { types: IMAGE_TYPES, maxMb: 15 },
};
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_CONTENT_TYPES = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/webm"];

/** Token para o navegador subir imagens (briefing do vídeo, logo de perfil) direto pro Vercel Blob. */
export async function POST(request: Request) {
  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const brand = BRAND_PATH.exec(pathname);
        if (brand) {
          const rule = BRAND_RULES[brand[1]];
          return {
            allowedContentTypes: rule.types.length ? rule.types : AUDIO_CONTENT_TYPES,
            maximumSizeInBytes: rule.maxMb * 1024 * 1024,
            addRandomSuffix: true,
            validUntil: Date.now() + 60 * 60 * 1000,
          };
        }
        if (AUDIO_PATH.test(pathname)) {
          return {
            allowedContentTypes: AUDIO_CONTENT_TYPES,
            maximumSizeInBytes: MAX_AUDIO_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 60 * 60 * 1000,
          };
        }
        if (CLIP_PATH.test(pathname)) {
          return {
            allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 60 * 60 * 1000,
          };
        }
        if (BASE_PATH.test(pathname)) {
          return {
            allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", ...AUDIO_CONTENT_TYPES],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 60 * 60 * 1000,
          };
        }
        if (VIDEO_PATH.test(pathname)) {
          return {
            allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm"],
            maximumSizeInBytes: MAX_VIDEO_BYTES,
            addRandomSuffix: true,
            validUntil: Date.now() + 60 * 60 * 1000,
          };
        }
        if (!IMAGE_PATH.test(pathname)) throw new Error("Caminho de upload inválido.");
        return {
          allowedContentTypes: IMAGE_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload recusado." }, { status: 400 });
  }
}
