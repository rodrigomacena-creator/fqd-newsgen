import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/Header";
import { ReviseForm } from "@/components/ReviseForm";
import { DeleteArticleButton } from "@/components/DeleteArticleButton";
import { InstagramPostCard } from "@/components/InstagramPostCard";
import { EditableText } from "@/components/EditableText";
import { RemovableImage } from "@/components/RemovableImage";

interface ArticleSection {
  heading: string;
  text: string;
  image?: string;
}

interface ArticleSourceRef {
  type: "youtube" | "webpage";
  url: string;
  title: string;
}

export default async function ArticlePage(props: PageProps<"/noticia/[id]">) {
  const { id } = await props.params;

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) notFound();

  const sections: ArticleSection[] = JSON.parse(article.sections);
  const sources: ArticleSourceRef[] = JSON.parse(article.sources);
  const version = article.updatedAt.getTime();
  const withVersion = (url: string) => `${url}?v=${version}`;

  return (
    <div className="flex min-h-full flex-col">
      <Header />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12 sm:py-16">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent-yellow">
            Gerado por IA · {sources.length} {sources.length === 1 ? "fonte" : "fontes"}
          </p>
          <DeleteArticleButton articleId={article.id} redirectTo="/noticias" />
        </div>
        <p className="mt-1 text-xs text-text-secondary/70">
          Clique em qualquer texto abaixo para editar — salva automaticamente.
        </p>
        <EditableText
          as="h1"
          articleId={article.id}
          target={{ type: "title" }}
          initialValue={article.title}
          className="mt-3 text-3xl font-bold leading-tight sm:text-4xl"
        />
        <EditableText
          as="p"
          articleId={article.id}
          target={{ type: "subtitle" }}
          initialValue={article.subtitle}
          className="mt-4 text-lg text-text-secondary"
        />

        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span>
            {new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(article.createdAt)}
          </span>
          <span className="text-text-secondary/40">·</span>
          <span>
            Fontes:{" "}
            {sources.map((source, index) => (
              <span key={index}>
                {index > 0 && " · "}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-accent-yellow"
                  title={source.title}
                >
                  {source.type === "youtube" ? "YouTube" : "Página"}
                  {sources.length > 1 ? ` ${index + 1}` : ""}
                </a>
              </span>
            ))}
          </span>
          <span className="text-text-secondary/40">·</span>
          <span>Perfil: {article.profileName ?? "Padrão (neutro)"}</span>
          <span className="text-text-secondary/40">·</span>
          <span>
            IA: {article.textModel} / {article.imageModel}
          </span>
        </div>

        {article.coverImage && (
          <RemovableImage
            articleId={article.id}
            target="cover"
            src={withVersion(article.coverImage)}
            alt={article.title}
            sizes="(min-width: 768px) 768px, 100vw"
            className="relative mt-8 aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface"
          />
        )}

        <article className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={index}>
              <EditableText
                as="h2"
                articleId={article.id}
                target={{ type: "section", index, part: "heading" }}
                initialValue={section.heading}
                className="text-xl font-bold"
              />
              {section.image && (
                <RemovableImage
                  articleId={article.id}
                  target={{ section: index }}
                  src={withVersion(section.image)}
                  alt={section.heading}
                  sizes="(min-width: 768px) 768px, 100vw"
                  className="relative my-4 aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface"
                />
              )}
              <EditableText
                as="p"
                articleId={article.id}
                target={{ type: "section", index, part: "text" }}
                initialValue={section.text}
                multiline
                className="mt-3 leading-relaxed text-foreground/80"
              />
            </section>
          ))}
        </article>

        {article.instagramCaption && (
          <InstagramPostCard
            articleId={article.id}
            caption={article.instagramCaption}
            imageUrl={article.instagramImage ? withVersion(article.instagramImage) : undefined}
            alt={`Post de Instagram sobre ${article.title}`}
          />
        )}

        <ReviseForm
          articleId={article.id}
          currentTextModel={article.textModel}
          currentImageModel={article.imageModel}
        />
      </main>
    </div>
  );
}
