import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deleteBlobsByPrefix } from "@/lib/blobStorage";

export async function DELETE(request: Request) {
  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const ids = Array.from(new Set((body.ids ?? []).filter(Boolean)));
  if (ids.length === 0) {
    return NextResponse.json({ error: "Nenhuma notícia selecionada." }, { status: 400 });
  }

  await prisma.article.deleteMany({ where: { id: { in: ids } } });

  await Promise.all(ids.map((id) => deleteBlobsByPrefix(`generated/${id}/`)));

  return NextResponse.json({ ok: true, count: ids.length });
}
