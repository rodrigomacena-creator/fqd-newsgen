import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// briefing: imagens do vídeo (sobem antes do job existir); perfis: logos das empresas
const IMAGE_PATH = /^videogen\/(briefing|perfis)\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(jpg|jpeg|png|webp)$/;
// vozes: amostras de áudio para treinar uma voz no ElevenLabs (apagadas depois do envio)
const AUDIO_PATH = /^videogen\/vozes\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(mp3|wav|m4a|ogg|webm)$/;
// vídeo base: vídeo pronto do usuário que vira a trilha fixa das cenas (fica na pasta do job)
const VIDEO_PATH = /^videogen\/[a-z0-9]{16,40}\/base\/[a-z0-9-]{1,60}\.(mp4|mov|webm)$/;
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
        if (AUDIO_PATH.test(pathname)) {
          return {
            allowedContentTypes: AUDIO_CONTENT_TYPES,
            maximumSizeInBytes: MAX_AUDIO_BYTES,
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
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
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
