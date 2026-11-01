"use client";

import { upload } from "@vercel/blob/client";

export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_IMAGE_MB = 15;

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function slug(name: string) {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "imagem"
  );
}

/** Mensagem de erro se o arquivo não puder subir (tipo/tamanho), senão null. */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES[file.type]) return `"${file.name}" não é JPG, PNG ou WebP.`;
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) return `"${file.name}" passa de ${MAX_IMAGE_MB} MB.`;
  return null;
}

/** Sobe a imagem direto do navegador pro Vercel Blob e devolve a URL pública. */
export async function uploadImage(file: File, folder: "briefing" | "perfis"): Promise<string> {
  const problem = imageProblem(file);
  if (problem) throw new Error(problem);
  const blob = await upload(`videogen/${folder}/${randomId()}/${slug(file.name)}.${IMAGE_TYPES[file.type]}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: file.type,
  });
  return blob.url;
}
