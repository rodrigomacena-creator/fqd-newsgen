"use client";

// Capa automática + publicar no YouTube (Shorts) e no Instagram (Reels), agora ou agendado.
import { useCallback, useEffect, useState } from "react";
import type { VideoJobDTO } from "@/lib/videogen/jobs";
import type { PublicationDTO } from "@/lib/videogen/social";
import { downloadUrl } from "@/lib/videogen/types";
import { AutoTextarea, fieldClass, Icon, labelClass, primaryButton, secondaryButton, Spinner } from "./ui";

type Account = { platform: "youtube" | "instagram"; configured: boolean; connected: boolean; accountName: string | null; expiresAt: string | null };

const NAME = { youtube: "YouTube", instagram: "Instagram" } as const;
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Enviando", cls: "bg-warning/15 text-warning" },
  processing: { label: "O Instagram está processando", cls: "bg-warning/15 text-warning" },
  scheduled: { label: "Agendado", cls: "bg-surface-2 text-foreground" },
  published: { label: "Publicado", cls: "bg-success/15 text-success" },
  failed: { label: "Falhou", cls: "bg-accent-red/10 text-accent-red" },
};

function localInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function CoverPreview({ job }: { job: VideoJobDTO }) {
  if (!job.coverUrl && !job.thumbUrl) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">Capa automática</p>
      <div className="mt-2 grid grid-cols-[minmax(0,0.56fr)_minmax(0,1fr)] items-start gap-3">
        {job.coverUrl && job.format !== "16:9" && (
          <a href={downloadUrl(job.coverUrl)} download className="group block" title="Baixar capa 9:16">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={job.coverUrl} alt="Capa 9:16 do vídeo" className="aspect-[9/16] w-full rounded-lg object-cover ring-1 ring-border" />
            <span className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary group-hover:text-foreground">
              <Icon name="download" className="h-3 w-3" /> Reels/Shorts 9:16
            </span>
          </a>
        )}
        {job.thumbUrl && (
          <a href={downloadUrl(job.thumbUrl)} download className="group block" title="Baixar thumbnail 16:9">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={job.thumbUrl} alt="Thumbnail 16:9 do vídeo" className="aspect-video w-full rounded-lg object-cover ring-1 ring-border" />
            <span className="mt-1 flex items-center gap-1 text-[11px] text-text-secondary group-hover:text-foreground">
              <Icon name="download" className="h-3 w-3" /> YouTube 16:9
            </span>
          </a>
        )}
      </div>
    </div>
  );
}

export function PublishPanel({ job }: { job: VideoJobDTO }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [pubs, setPubs] = useState<PublicationDTO[]>([]);
  const [want, setWant] = useState<Record<string, boolean>>({});
  const landscape = job.format === "16:9";
  // horizontal = vídeo normal do YouTube (sem #Shorts); vertical vira Shorts
  const [title, setTitle] = useState(() => (landscape ? (job.script?.title || job.topic).slice(0, 100) : `${(job.script?.title || job.topic).slice(0, 88)} #Shorts`));
  const [caption, setCaption] = useState(() => job.script?.postCaption || "");
  const [privacy, setPrivacy] = useState("public");
  const [schedule, setSchedule] = useState(false);
  const [when, setWhen] = useState(() => localInput(new Date(Date.now() + 2 * 3600_000)));
  const [busy, setBusy] = useState(false);
  // volta do login da rede: ?conectado=youtube ou ?erro=...
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const q = new URLSearchParams(window.location.search);
    const ok = q.get("conectado");
    const err = q.get("erro");
    if (ok) return { kind: "ok", text: `${NAME[ok as "youtube"] ?? ok} conectado.` };
    if (err) return { kind: "error", text: err };
    return null;
  });

  const loadPubs = useCallback(async () => {
    const res = await fetch(`/api/videogen/jobs/${job.id}/publications`);
    if (res.ok) setPubs((await res.json()).publications);
  }, [job.id]);

  useEffect(() => {
    fetch("/api/videogen/social")
      .then((r) => r.json())
      .then((d: { accounts: Account[] }) => {
        // Reels é vertical: vídeo horizontal só vai para o YouTube
        const list = job.format === "16:9" ? d.accounts.filter((a) => a.platform !== "instagram") : d.accounts;
        setAccounts(list);
        setWant(Object.fromEntries(list.map((a) => [a.platform, a.connected])));
      })
      .catch(() => setAccounts([]));
    fetch(`/api/videogen/jobs/${job.id}/publications`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPubs(d.publications))
      .catch(() => {});
    if (window.location.search.includes("conectado=") || window.location.search.includes("erro=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [job.id, job.format]);

  // acompanha as que estão enviando/processando
  const active = pubs.some((p) => p.status === "pending" && (!p.scheduledAt || new Date(p.scheduledAt) <= new Date())) || pubs.some((p) => p.status === "processing");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(loadPubs, 6000);
    return () => clearInterval(t);
  }, [active, loadPubs]);

  async function publish() {
    setBusy(true);
    setMsg(null);
    try {
      const platforms = Object.entries(want).filter(([, v]) => v).map(([k]) => k);
      const res = await fetch(`/api/videogen/jobs/${job.id}/publications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms, title, caption, privacy, scheduledAt: schedule ? new Date(when).toISOString() : null }),
      });
      const text = await res.text();
      let data: { publications?: PublicationDTO[]; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: `O servidor respondeu HTTP ${res.status}.` };
      }
      if (!res.ok) throw new Error(data.error);
      setPubs(data.publications ?? []);
      setMsg({ kind: "ok", text: schedule ? "Agendado." : "Enviado. Acompanhe abaixo." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Erro ao publicar." });
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(p: Account["platform"]) {
    if (!window.confirm(`Desconectar o ${NAME[p]}? Publicações agendadas no Instagram deixam de sair.`)) return;
    await fetch(`/api/videogen/social/${p}`, { method: "DELETE" });
    setAccounts((a) => a?.map((x) => (x.platform === p ? { ...x, connected: false, accountName: null } : x)) ?? a);
    setWant((w) => ({ ...w, [p]: false }));
  }

  async function cancel(id: string) {
    const res = await fetch(`/api/videogen/jobs/${job.id}/publications?pub=${id}`, { method: "DELETE" });
    const data = await res.json();
    if (res.ok) setPubs(data.publications);
    else setMsg({ kind: "error", text: data.error });
  }

  const back = `/videogen/${job.id}`;
  const chosen = Object.values(want).some(Boolean);
  const ytChosen = Boolean(want.youtube);

  return (
    <div className="mt-5 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">Publicar</p>
      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-2 rounded-lg px-3 py-2 text-xs ${msg.kind === "error" ? "bg-accent-red/10 text-accent-red" : "bg-success/15 text-success"}`}>
          {msg.text}
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {(accounts ?? []).map((a) => (
          <li key={a.platform} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
            <label className="flex min-h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(want[a.platform])}
                disabled={!a.connected}
                onChange={(e) => setWant((w) => ({ ...w, [a.platform]: e.target.checked }))}
                className="h-4 w-4 accent-[var(--foreground)]"
              />
              <span className="font-medium">{NAME[a.platform]}</span>
              {a.connected && <span className="text-xs text-text-secondary">{a.accountName}</span>}
            </label>
            {a.connected ? (
              <button type="button" onClick={() => disconnect(a.platform)} className="text-xs text-text-secondary underline underline-offset-2 hover:text-foreground">
                Desconectar
              </button>
            ) : a.configured ? (
              <a href={`/api/videogen/social/${a.platform}/connect?back=${encodeURIComponent(back)}`} className={`!min-h-9 !px-3 !text-xs ${secondaryButton}`}>
                Conectar
              </a>
            ) : (
              <span className="text-[11px] text-text-secondary">Falta configurar no servidor</span>
            )}
          </li>
        ))}
        {landscape && accounts !== null && (
          <li className="text-[11px] text-text-secondary">Vídeo horizontal vai só para o YouTube. Para o Instagram, crie a versão vertical.</li>
        )}
        {accounts === null && (
          <li className="flex items-center gap-2 text-xs text-text-secondary">
            <Spinner /> Carregando contas…
          </li>
        )}
      </ul>

      {chosen && (
        <div className="mt-3 space-y-3">
          {ytChosen && (
            <div>
              <label htmlFor="pub-title" className={labelClass}>
                Título no YouTube ({title.length}/100)
              </label>
              <input id="pub-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={`mt-1 ${fieldClass}`} />
            </div>
          )}
          <div>
            <label htmlFor="pub-caption" className={labelClass}>
              Legenda / descrição
            </label>
            <AutoTextarea id="pub-caption" value={caption} minRows={3} onChange={(e) => setCaption(e.target.value)} className={`mt-1 ${fieldClass}`} />
          </div>
          {ytChosen && (
            <div>
              <label htmlFor="pub-privacy" className={labelClass}>
                Visibilidade no YouTube
              </label>
              <select id="pub-privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value)} disabled={schedule} className={`mt-1 bg-background text-foreground ${fieldClass}`}>
                <option className="bg-background text-foreground" value="public">Público</option>
                <option className="bg-background text-foreground" value="unlisted">Não listado</option>
                <option className="bg-background text-foreground" value="private">Privado</option>
              </select>
            </div>
          )}
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} className="h-4 w-4 accent-[var(--foreground)]" />
            Agendar
          </label>
          {schedule && (
            <div>
              <label htmlFor="pub-when" className={labelClass}>
                Data e hora (seu fuso)
              </label>
              <input id="pub-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`mt-1 ${fieldClass}`} />
              <p className="mt-1 text-[11px] text-text-secondary">
                O YouTube recebe o vídeo agora e libera na hora marcada. O Instagram é publicado na hora pelo servidor de render.
              </p>
            </div>
          )}
          <button type="button" onClick={publish} disabled={busy} className={`w-full ${primaryButton} !bg-foreground !text-background`}>
            {busy ? <Spinner /> : <Icon name="up" className="h-4 w-4" />}
            {busy ? "Enviando… (pode levar 1 min)" : schedule ? "Agendar publicação" : "Publicar agora"}
          </button>
        </div>
      )}

      {pubs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pubs.map((p) => {
            const st = STATUS[p.status] ?? STATUS.pending;
            const waiting = p.status === "pending" && p.scheduledAt && new Date(p.scheduledAt) > new Date();
            return (
              <li key={p.id} className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{NAME[p.platform]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${waiting ? STATUS.scheduled.cls : st.cls}`}>
                    {waiting ? "Agendado" : st.label}
                    {p.scheduledAt && (p.status === "scheduled" || waiting) ? ` · ${new Date(p.scheduledAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}
                  </span>
                </div>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-foreground underline underline-offset-2">
                    {p.url}
                  </a>
                )}
                {p.error && <p className={`mt-1 [overflow-wrap:anywhere] ${p.status === "failed" ? "text-accent-red" : "text-text-secondary"}`}>{p.error}</p>}
                {waiting && p.platform === "instagram" && (
                  <button type="button" onClick={() => cancel(p.id)} className="mt-1 text-text-secondary underline underline-offset-2 hover:text-foreground">
                    Cancelar agendamento
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
