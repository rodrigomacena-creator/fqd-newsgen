// Vídeo pronto do usuário como trilha base (só servidor): a fala do vídeo vira a narração e o
// roteiro é montado em cima dela (cenas = pedaços da fala, na ordem, sem mudar palavras).
import type { VideoJob } from "@/generated/prisma/client";
import { generateVideoScript } from "./generateScript";
import { recentFreeStyles, resolveStyle } from "./templates";
import { jobProfiles, parseBriefingImages } from "./profiles";
import { articleSource } from "./articleSource";
import { realignToTranscript } from "./avatar";
import type { NarrationWord, VideoScript } from "./types";

/** Roteiro dividido em cenas a partir da fala transcrita do vídeo base. */
export async function scriptFromTranscript(job: VideoJob, words: NarrationWord[], durationS: number): Promise<{ script: VideoScript; usd: number }> {
  const style = await resolveStyle(job.patternId);
  if (!style) throw new Error("O estilo deste vídeo não existe mais.");
  const { person, company } = await jobProfiles(job);
  const text = words.map((w) => w[0]).join(" ");
  const { script, usd } = await generateVideoScript({
    person,
    company,
    briefingImages: parseBriefingImages(job.briefingImages),
    pattern: style.pattern,
    guide: style.guide,
    topic: job.topic,
    durationS: Math.max(5, Math.round(durationS)),
    extraInstructions: job.extraInstructions,
    styleNotes: job.styleNotes,
    recentStyles: style.pattern.kind === "free" ? await recentFreeStyles() : [],
    model: job.textModel,
    sourceText: (await articleSource(job.articleId))?.text,
    format: job.format === "16:9" ? "16:9" : "9:16",
    fixedNarration: text,
  });
  // a narração do roteiro precisa ser exatamente a transcrição (é o que liga legenda e cortes ao tempo)
  const pieces = realignToTranscript([...script.scenes.map((s) => s.narration), script.cta.narration], words.map((w) => w[0]));
  script.scenes = script.scenes.map((s, i) => ({ ...s, narration: pieces[i] }));
  script.cta = { ...script.cta, narration: pieces[pieces.length - 1] };
  // cena sem fala nenhuma não tem tempo próprio: some
  script.scenes = script.scenes.filter((s, i) => s.narration || i === 0);
  if (script.scenes[0]) script.scenes[0].avatar = true;
  return { script, usd };
}

/** Palavras da transcrição no formato da narração ([palavra, início, fim], sem espaço dentro). */
export function transcriptWords(words: { text: string; start: number; end: number }[]): NarrationWord[] {
  return words
    .map((w) => [w.text.replace(/\s+/g, ""), Math.round(w.start * 1000) / 1000, Math.round(w.end * 1000) / 1000] as NarrationWord)
    .filter((w) => w[0]);
}
