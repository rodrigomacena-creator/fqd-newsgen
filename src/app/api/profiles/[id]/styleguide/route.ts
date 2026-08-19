import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractStyleguideInfo } from "@/lib/styleguide";

const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

const ALLOWED_TYPES: Record<string, "pdf" | "png" | "jpg" | "svg"> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
};

async function deleteExistingFile(styleguidePath: string | null) {
  if (!styleguidePath) return;
  try {
    await rm(path.join(process.cwd(), "public", styleguidePath), { force: true });
  } catch {
    // arquivo já não existe — ignora
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/profiles/[id]/styleguide">
) {
  const { id } = await ctx.params;

  const profile = await prisma.instructionProfile.findUnique({ where: { id } });
  if (!profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envio de arquivo inválido." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Formato não suportado. Envie um PDF, PNG, JPG ou SVG." },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "Arquivo muito grande (máximo 15MB)." }, { status: 400 });
  }

  await deleteExistingFile(profile.styleguidePath);

  const dir = path.join(process.cwd(), "public", "styleguides", id);
  await mkdir(dir, { recursive: true });

  const fileName = `styleguide.${ext}`;
  const filePath = path.join(dir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  let colors: string[] = [];
  let summary: string | null = null;
  let extractionWarning: string | undefined;
  try {
    const extracted = await extractStyleguideInfo(filePath, ext);
    colors = extracted.colors;
    summary = extracted.summary;
    if (colors.length === 0 && !summary) {
      extractionWarning =
        "Arquivo enviado, mas não encontrei cores nem texto reconhecível para usar nos prompts.";
    }
  } catch (err) {
    console.error("Falha ao extrair informações do styleguide:", err);
    extractionWarning = "Arquivo enviado, mas não foi possível analisar o conteúdo automaticamente.";
  }

  const updated = await prisma.instructionProfile.update({
    where: { id },
    data: {
      styleguideFileName: file.name,
      styleguidePath: `/styleguides/${id}/${fileName}`,
      styleguideColors: colors.length > 0 ? JSON.stringify(colors) : null,
      styleguideSummary: summary,
    },
  });

  return NextResponse.json({ ...updated, extractionWarning });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/profiles/[id]/styleguide">
) {
  const { id } = await ctx.params;

  const profile = await prisma.instructionProfile.findUnique({ where: { id } });
  if (!profile) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  await deleteExistingFile(profile.styleguidePath);

  const updated = await prisma.instructionProfile.update({
    where: { id },
    data: {
      styleguideFileName: null,
      styleguidePath: null,
      styleguideColors: null,
      styleguideSummary: null,
    },
  });

  return NextResponse.json(updated);
}
