import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
// briefing: imagens do vídeo (sobem antes do job existir); perfis: logos das empresas
const IMAGE_PATH = /^videogen\/(briefing|perfis)\/[a-z0-9]{8,32}\/[a-z0-9-]{1,60}\.(jpg|jpeg|png|webp)$/;

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
