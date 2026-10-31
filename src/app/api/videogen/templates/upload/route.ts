import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

const MAX_REFERENCE_BYTES = 300 * 1024 * 1024;
const REFERENCE_PATH = /^videogen\/templates\/ref-[a-z0-9]{8,32}\/referencia\.(mp4|mov|webm|m4v)$/;

/**
 * Gera o token para o navegador subir o vídeo de referência direto pro Vercel Blob
 * (o arquivo passa do limite de corpo das funções). Só aceita vídeo, no caminho esperado.
 */
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
        if (!REFERENCE_PATH.test(pathname)) throw new Error("Caminho de upload inválido.");
        return {
          allowedContentTypes: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
          maximumSizeInBytes: MAX_REFERENCE_BYTES,
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
