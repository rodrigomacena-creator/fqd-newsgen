import { CHART_COLORS, formatChartValue, type RichBlock } from "@/lib/richBlocks";

// Server component: elementos visuais (tabela, gráfico, infográficos...) de uma seção da
// matéria. Gráficos são SVG/CSS puro, sem biblioteca, pra funcionar nos dois temas.

const BOX = "my-6 rounded-2xl border border-border bg-surface p-5";
const TITLE = "mb-4 text-sm font-bold text-accent-yellow";

function BarChart({ block }: { block: Extract<RichBlock, { type: "chart" }> }) {
  const max = Math.max(...block.values.map((v) => Math.abs(v)), 1);
  return (
    <ul className="space-y-3">
      {block.labels.map((label, i) => (
        <li key={i}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span>{label}</span>
            <span className="font-semibold">{formatChartValue(block.values[i], block.unit)}</span>
          </div>
          <div className="h-3 w-full rounded-full bg-surface-2">
            <div
              className="h-3 rounded-full"
              style={{
                width: `${Math.max((Math.abs(block.values[i]) / max) * 100, 1)}%`,
                background: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LineChart({ block }: { block: Extract<RichBlock, { type: "chart" }> }) {
  const W = 320;
  const H = 150;
  const pad = { l: 8, r: 8, t: 12, b: 8 };
  const min = Math.min(...block.values, 0);
  const max = Math.max(...block.values, 1);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (block.values.length - 1);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min || 1)) * (H - pad.t - pad.b);
  const points = block.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={block.title ?? "Gráfico de linha"}>
        <polyline points={points} fill="none" stroke={CHART_COLORS[0]} strokeWidth="2.5" strokeLinejoin="round" />
        {block.values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={CHART_COLORS[0]} />
        ))}
      </svg>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary sm:grid-cols-3">
        {block.labels.map((label, i) => (
          <li key={i}>
            {label}: <span className="font-semibold text-foreground">{formatChartValue(block.values[i], block.unit)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PieChart({ block }: { block: Extract<RichBlock, { type: "chart" }> }) {
  const total = block.values.reduce((s, v) => s + v, 0) || 1;
  const fracs = block.values.map((v) => v / total);
  const slices = fracs.map((frac, i) => {
    const before = fracs.slice(0, i).reduce((sum, f) => sum + f, 0);
    const start = -Math.PI / 2 + before * 2 * Math.PI;
    const end = start + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const p = (a: number) => `${50 + 48 * Math.cos(a)} ${50 + 48 * Math.sin(a)}`;
    const full = frac >= 0.9999;
    return {
      d: full ? "" : `M50 50 L${p(start)} A48 48 0 ${large} 1 ${p(end)} Z`,
      frac,
      color: CHART_COLORS[i % CHART_COLORS.length],
      full,
    };
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <svg viewBox="0 0 100 100" className="h-40 w-40 shrink-0" role="img" aria-label={block.title ?? "Gráfico de pizza"}>
        {slices.map((s, i) =>
          s.full ? <circle key={i} cx="50" cy="50" r="48" fill={s.color} /> : <path key={i} d={s.d} fill={s.color} />
        )}
      </svg>
      <ul className="w-full space-y-1.5 text-sm">
        {block.labels.map((label, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: slices[i].color }} />
            <span className="flex-1">{label}</span>
            <span className="font-semibold">
              {(slices[i].frac * 100).toFixed(1).replace(".", ",")}%
              {block.unit !== "%" && ` · ${formatChartValue(block.values[i], block.unit)}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RichBlocks({ blocks }: { blocks: RichBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        const title = "title" in block && block.title ? <p className={TITLE}>{block.title}</p> : null;

        if (block.type === "table") {
          return (
            <div key={index} className={`${BOX} overflow-x-auto`}>
              {title}
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr>
                    {block.headers.map((h, i) => (
                      <th key={i} className="border-b-2 border-accent-yellow px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td key={c} className="border-b border-border px-3 py-2">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "chart") {
          return (
            <div key={index} className={BOX}>
              {title}
              {block.chartType === "line" ? <LineChart block={block} /> : block.chartType === "pie" ? <PieChart block={block} /> : <BarChart block={block} />}
            </div>
          );
        }

        if (block.type === "stats") {
          return (
            <div key={index} className={BOX}>
              {title}
              <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
                {block.items.map((item, i) => (
                  <div key={i} className="rounded-xl bg-surface-2 p-4 text-center">
                    <div className="text-3xl font-extrabold leading-tight text-accent-yellow">{item.value}</div>
                    <div className="mt-1 text-sm text-text-secondary">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (block.type === "timeline") {
          return (
            <div key={index} className={BOX}>
              {title}
              <ol className="ml-2 space-y-4 border-l-2 border-accent-yellow pl-5">
                {block.items.map((item, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full bg-accent-yellow" />
                    <div className="text-sm font-bold text-accent-yellow">{item.date}</div>
                    <div className="text-sm">{item.text}</div>
                  </li>
                ))}
              </ol>
            </div>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={index} className="my-6 border-l-4 border-accent-yellow pl-5 text-lg italic">
              {block.text}
              {block.author && <cite className="mt-2 block text-sm not-italic text-text-secondary">— {block.author}</cite>}
            </blockquote>
          );
        }

        return (
          <aside key={index} className={BOX}>
            <p className={TITLE}>{block.title}</p>
            <p className="text-sm leading-relaxed">{block.text}</p>
          </aside>
        );
      })}
    </>
  );
}
