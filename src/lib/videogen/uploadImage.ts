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

export const AUDIO_TYPES: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
};
export const MAX_AUDIO_MB = 25;

/** Tipo do áudio sem parâmetros ("audio/webm;codecs=opus" -> "audio/webm"). */
export function audioType(file: Blob): string {
  return file.type.split(";")[0].trim().toLowerCase();
}

export function audioProblem(file: File): string | null {
  if (!AUDIO_TYPES[audioType(file)]) return `"${file.name}" não é um áudio aceito (MP3, WAV, M4A, OGG ou WebM).`;
  if (file.size > MAX_AUDIO_MB * 1024 * 1024) return `"${file.name}" passa de ${MAX_AUDIO_MB} MB.`;
  return null;
}

/** Sobe uma amostra de voz direto do navegador pro Vercel Blob (some depois que a voz é criada). */
export async function uploadAudio(file: File): Promise<string> {
  const problem = audioProblem(file);
  if (problem) throw new Error(problem);
  const type = audioType(file);
  const blob = await upload(`videogen/vozes/${randomId()}/${slug(file.name)}.${AUDIO_TYPES[type]}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: type,
  });
  return blob.url;
}

export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
export const MAX_VIDEO_MB = 500;

export function videoProblem(file: File): string | null {
  if (!VIDEO_TYPES[file.type]) return `"${file.name}" não é um vídeo aceito (MP4, MOV ou WebM).`;
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) return `"${file.name}" passa de ${MAX_VIDEO_MB} MB.`;
  return null;
}

/** Sobe o vídeo base do usuário direto do navegador pro Vercel Blob (pasta do job). */
export async function uploadBaseVideo(file: File, jobId: string, onProgress?: (pct: number) => void): Promise<string> {
  const problem = videoProblem(file);
  if (problem) throw new Error(problem);
  const blob = await upload(`videogen/${jobId}/base/${slug(file.name)}.${VIDEO_TYPES[file.type]}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: file.type,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
  });
  return blob.url;
}

export type BaseKind = "video" | "audio";

/** Tipo do arquivo enviado como fala ("video" ou "audio"), ou null se não for aceito. */
export function baseKind(file: File): BaseKind | null {
  if (VIDEO_TYPES[file.type]) return "video";
  if (AUDIO_TYPES[audioType(file)]) return "audio";
  return null;
}

export function baseProblem(file: File): string | null {
  const kind = baseKind(file);
  if (!kind) return `"${file.name}" não é um vídeo (MP4, MOV, WebM) nem um áudio (MP3, WAV, M4A, OGG).`;
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) return `"${file.name}" passa de ${MAX_VIDEO_MB} MB.`;
  return null;
}

/** Sobe o áudio/vídeo com a fala (passo "Quem fala" da criação) direto do navegador pro Vercel Blob. */
export async function uploadBaseFile(file: File, onProgress?: (pct: number) => void): Promise<{ url: string; kind: BaseKind }> {
  const problem = baseProblem(file);
  if (problem) throw new Error(problem);
  const kind = baseKind(file)!;
  const type = kind === "video" ? file.type : audioType(file);
  const ext = kind === "video" ? VIDEO_TYPES[file.type] : AUDIO_TYPES[type];
  const blob = await upload(`videogen/base/${randomId()}/${slug(file.name)}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: type,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
  });
  return { url: blob.url, kind };
}

/** Sobe um vídeo para tocar numa cena (storyboard) direto do navegador pro Vercel Blob, na pasta do job. */
export async function uploadSceneClip(file: File, jobId: string, onProgress?: (pct: number) => void): Promise<string> {
  const problem = videoProblem(file);
  if (problem) throw new Error(problem);
  const blob = await upload(`videogen/${jobId}/clipes/${slug(file.name)}.${VIDEO_TYPES[file.type]}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: file.type,
    multipart: file.size > 20 * 1024 * 1024,
    onUploadProgress: onProgress ? (e) => onProgress(e.percentage) : undefined,
  });
  return blob.url;
}

// ---------- material da marca (templates "do zero") ----------

export type BrandUploadKind = "logo" | "guia" | "fonte" | "sfx" | "trilha" | "imagem";

const BRAND_EXT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
};

const BRAND_RULES: Record<BrandUploadKind, { exts: string[]; maxMb: number; label: string }> = {
  logo: { exts: ["png", "jpg", "jpeg", "webp", "svg"], maxMb: 15, label: "PNG, JPG, WebP ou SVG" },
  guia: { exts: ["pdf", "png", "jpg", "jpeg", "webp", "svg"], maxMb: 60, label: "PDF ou imagem" },
  fonte: { exts: ["ttf", "otf", "woff", "woff2"], maxMb: 10, label: "TTF, OTF, WOFF ou WOFF2" },
  sfx: { exts: ["mp3", "wav", "m4a", "ogg"], maxMb: 25, label: "MP3, WAV, M4A ou OGG" },
  trilha: { exts: ["mp3", "wav", "m4a", "ogg"], maxMb: 25, label: "MP3, WAV, M4A ou OGG" },
  imagem: { exts: ["png", "jpg", "jpeg", "webp"], maxMb: 15, label: "PNG, JPG ou WebP" },
};

/** Extensões aceitas por tipo de material (para o accept do input). */
export function brandAccept(kind: BrandUploadKind): string {
  return BRAND_RULES[kind].exts.map((e) => `.${e}`).join(",");
}

function extOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function brandFileProblem(file: File, kind: BrandUploadKind): string | null {
  const rule = BRAND_RULES[kind];
  if (!rule.exts.includes(extOf(file.name))) return `"${file.name}": envie ${rule.label}.`;
  if (file.size > rule.maxMb * 1024 * 1024) return `"${file.name}" passa de ${rule.maxMb} MB.`;
  return null;
}

/** Pasta do material de um template novo (todos os arquivos dele sobem para a mesma). */
export function newBrandFolder(): string {
  return randomId();
}

/** Sobe um arquivo do material da marca direto pro Vercel Blob e devolve a URL pública. */
export async function uploadBrandFile(file: File, kind: BrandUploadKind, folder: string): Promise<string> {
  const problem = brandFileProblem(file, kind);
  if (problem) throw new Error(problem);
  const ext = extOf(file.name);
  const blob = await upload(`videogen/marcas/${folder}/${kind}-${slug(file.name)}.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/videogen/uploads",
    contentType: BRAND_EXT_TYPES[ext],
    multipart: file.size > 20 * 1024 * 1024,
  });
  return blob.url;
}
