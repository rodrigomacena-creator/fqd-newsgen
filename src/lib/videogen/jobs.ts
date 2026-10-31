import type { VideoJob } from "@/generated/prisma/client";
import { summarizeCosts, type CostEntry, type CostSummary, type NarrationWord, type VideoJobStatus, type VideoScript } from "./types";
import { ELEVENLABS_USD_PER_CREDIT, parseCosts } from "./costs";

function parseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/** Formato do job devolvido pela API (JSON-em-string já convertido, datas em ISO). */
export interface VideoJobDTO {
  id: string;
  topic: string;
  patternId: string;
  voiceId: string;
  voiceName: string;
  durationS: number;
  textModel: string;
  extraInstructions: string | null;
  status: VideoJobStatus;
  script: VideoScript | null;
  narrationUrl: string | null;
  narrationWords: NarrationWord[] | null;
  narrationDurationS: number | null;
  videoUrl: string | null;
  progress: number | null;
  error: string | null;
  costs: CostEntry[];
  /** null quando o job é anterior ao registro de custos. */
  costSummary: CostSummary | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeVideoJob(job: VideoJob): VideoJobDTO {
  return {
    ...job,
    status: job.status as VideoJobStatus,
    script: parseJson<VideoScript>(job.script),
    narrationWords: parseJson<NarrationWord[]>(job.narrationWords),
    costs: parseCosts(job.costs),
    costSummary: job.costs ? summarizeCosts(parseCosts(job.costs), ELEVENLABS_USD_PER_CREDIT) : null,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
