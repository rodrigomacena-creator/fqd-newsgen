// Registro de custos do VideoGen (servidor). Cada etapa paga (roteiro, narração, imagens,
// trilha) acrescenta um CostEntry na coluna VideoJob.costs (JSON-em-string).
import { prisma } from "@/lib/prisma";
import type { CostEntry, CostStep } from "./types";

/**
 * Preço de 1 crédito do ElevenLabs em dólar. Padrão: plano Creator (US$ 22 por 100 mil créditos).
 * Mude com ELEVENLABS_USD_PER_CREDIT se o plano mudar.
 */
export const ELEVENLABS_USD_PER_CREDIT = Number(process.env.ELEVENLABS_USD_PER_CREDIT) || 22 / 100_000;

const STEPS: CostStep[] = ["script", "narration", "images", "music", "analysis"];

export function parseCosts(value: string | null): CostEntry[] {
  if (!value) return [];
  try {
    const arr = JSON.parse(value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Valida entradas vindas de fora (worker) e descarta o que não for número válido. */
export function sanitizeCosts(input: unknown): CostEntry[] {
  if (!Array.isArray(input)) return [];
  const out: CostEntry[] = [];
  for (const raw of input.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (!STEPS.includes(r.step as CostStep)) continue;
    const provider = r.provider === "elevenlabs" ? "elevenlabs" : "openrouter";
    const usd = Number(r.usd);
    const credits = Number(r.credits);
    const entry: CostEntry = { step: r.step as CostStep, provider, at: new Date().toISOString() };
    if (Number.isFinite(usd) && usd >= 0 && usd < 100) entry.usd = usd;
    if (Number.isFinite(credits) && credits >= 0 && credits < 1_000_000) entry.credits = credits;
    if (r.estimated === true) entry.estimated = true;
    if (entry.usd !== undefined || entry.credits !== undefined) out.push(entry);
  }
  return out;
}

export async function appendCosts(jobId: string, entries: CostEntry[]) {
  if (entries.length === 0) return;
  // ler e gravar na mesma transação evita perder um gasto quando duas etapas terminam juntas
  await prisma.$transaction(async (tx) => {
    const job = await tx.videoJob.findUnique({ where: { id: jobId }, select: { costs: true } });
    if (!job) return;
    await tx.videoJob.update({
      where: { id: jobId },
      data: { costs: JSON.stringify([...parseCosts(job.costs), ...entries]) },
    });
  });
}

export function costEntry(step: CostStep, provider: CostEntry["provider"], value: { usd?: number; credits?: number }): CostEntry {
  return { step, provider, ...value, at: new Date().toISOString() };
}
