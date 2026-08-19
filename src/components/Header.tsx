import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-4xl items-start justify-between px-6 py-5">
        <div>
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight">FQD</span>
            <span className="text-2xl font-bold tracking-tight text-accent-yellow">
              News GEN
            </span>
          </Link>
          <p className="mt-1 text-xs uppercase tracking-widest text-text-secondary">
            Notícias geradas a partir de vídeos do YouTube
          </p>
        </div>

        <nav className="mt-1 flex items-center gap-4">
          <Link
            href="/noticias"
            className="text-sm font-medium text-text-secondary transition hover:text-foreground"
          >
            Histórico
          </Link>
          <Link
            href="/configuracoes"
            className="text-sm font-medium text-text-secondary transition hover:text-foreground"
          >
            Configurações
          </Link>
        </nav>
      </div>
    </header>
  );
}
