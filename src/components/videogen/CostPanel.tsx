import { COST_STEP_LABEL, type CostStep } from "@/lib/videogen/types";
import type { VideoJobDTO } from "@/lib/videogen/jobs";

const STEPS: CostStep[] = ["script", "narration", "images", "music"];

export function formatUsd(value: number) {
  return `US$ ${value < 0.01 && value > 0 ? value.toFixed(4) : value.toFixed(2)}`;
}

/** Quanto este vídeo já custou (OpenRouter em dólar, ElevenLabs em créditos convertidos). */
export function CostPanel({ job }: { job: VideoJobDTO }) {
  const s = job.costSummary;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-accent-yellow">Custo</h2>
        {s && <span className="text-lg font-semibold">≈ {formatUsd(s.totalUsd)}</span>}
      </div>
      {!s ? (
        <p className="mt-3 text-sm text-text-secondary">
          Sem registro: este vídeo foi criado antes de o VideoGen começar a contar os custos.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1 text-sm">
            {STEPS.filter((step) => s.byStep[step] !== undefined).map((step) => (
              <li key={step} className="flex justify-between gap-3">
                <span className="text-text-secondary">{COST_STEP_LABEL[step]}</span>
                <span>{formatUsd(s.byStep[step] ?? 0)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-secondary">
            OpenRouter: {formatUsd(s.openrouterUsd)} · ElevenLabs: {Math.round(s.elevenCredits).toLocaleString("pt-BR")}{" "}
            créditos (≈ {formatUsd(s.elevenUsd)} no plano Creator).
            {s.hasEstimate && " A trilha é estimada pela duração, porque o ElevenLabs não informa o custo da música."}
            {s.byStep.script === undefined && " Registro parcial: o roteiro foi gerado antes da contagem de custos."}{" "}
            Gerar de novo (roteiro, narração ou render) soma um novo gasto.
          </p>
        </>
      )}
    </section>
  );
}
