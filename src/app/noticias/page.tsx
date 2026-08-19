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
    coverImage: article.coverImage,
    dateLabel: new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(article.createdAt),
  }));

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Histórico de notícias</h1>
          <Link
            href="/"
            className="rounded-lg bg-accent-yellow px-4 py-2 text-sm font-semibold text-accent-yellow-ink transition hover:bg-accent-yellow/90"
          >
            Gerar nova
          </Link>
        </div>

        {total === 0 ? (
          <p className="mt-10 text-text-secondary">
            Nenhuma notícia gerada ainda.{" "}
            <Link href="/" className="underline hover:text-accent-yellow">
              Gere a primeira aqui
            </Link>
            .
          </p>
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
