import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { HistoryList } from "@/components/HistoryList";

const PAGE_SIZE_OPTIONS = [10, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

function parseIntParam(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

interface StoredSection {
  heading: string;
  text: string;
  image?: string;
}

// Prioriza a capa do portal; se a notícia não teve Portal (ex.: só Instagram) ou a
// capa falhou na geração, usa qualquer outra imagem que exista — primeiro de uma
// seção, depois do carrossel/legado do Instagram — pra sempre ter algo no histórico.
function pickDisplayImage(article: {
  coverImage: string | null;
  sections: string;
  instagramImages: string | null;
  instagramImage: string | null;
}): string | null {
  if (article.coverImage) return article.coverImage;

  try {
    const sections: StoredSection[] = JSON.parse(article.sections);
    const sectionImage = sections.find((s) => s.image)?.image;
    if (sectionImage) return sectionImage;
  } catch {
    // sections inválido — ignora e segue tentando outras fontes de imagem
  }

  if (article.instagramImages) {
    try {
      const images: string[] = JSON.parse(article.instagramImages);
      if (images[0]) return images[0];
    } catch {
      // instagramImages inválido — ignora
    }
  }

  return article.instagramImage ?? null;
}

export default async function HistoryPage(props: PageProps<"/noticias">) {
  const searchParams = await props.searchParams;

  const requestedPageSize = parseIntParam(searchParams.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = PAGE_SIZE_OPTIONS.includes(requestedPageSize)
    ? requestedPageSize
    : DEFAULT_PAGE_SIZE;

  const total = await prisma.article.count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(parseIntParam(searchParams.page, 1), 1), totalPages);

  const articles =
    total === 0
      ? []
      : await prisma.article.findMany({
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        });

  const items = articles.map((article) => ({
    id: article.id,
    title: article.title,
    subtitle: article.subtitle,
    sentToPortal: Boolean(article.wordpressUrl),
    coverImage: pickDisplayImage(article),
    dateLabel: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(article.createdAt),
  }));

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Histórico de notícias
            </h1>
            {total > 0 && (
              <p className="mt-2 text-sm text-text-secondary">
                {total} {total === 1 ? "notícia gerada" : "notícias geradas"} até agora.
              </p>
            )}
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg bg-accent-yellow px-4 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90"
          >
            + Gerar nova
          </Link>
        </div>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-text-secondary">Nenhuma notícia gerada ainda.</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-lg bg-accent-yellow px-5 py-2.5 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90"
            >
              Gerar a primeira
            </Link>
          </div>
        ) : (
          <HistoryList
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
          />
        )}
      </main>
    </div>
  );
}
