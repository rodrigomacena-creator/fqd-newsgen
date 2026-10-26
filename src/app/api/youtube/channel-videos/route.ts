import { NextResponse } from "next/server";
import { listChannelVideoUrls, YoutubeChannelError } from "@/lib/youtubeChannel";

export async function POST(request: Request) {
  try {
    const { channelUrl } = await request.json();
    if (typeof channelUrl !== "string" || !channelUrl.trim()) {
      return NextResponse.json({ error: "Informe a URL do canal." }, { status: 400 });
    }

    const { channelTitle, urls } = await listChannelVideoUrls(channelUrl);
    return NextResponse.json({ channelTitle, urls });
  } catch (error) {
    if (error instanceof YoutubeChannelError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Erro ao listar vídeos do canal:", error);
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
