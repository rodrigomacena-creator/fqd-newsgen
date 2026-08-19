import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

export class WebpageFetchError extends Error {}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchWebpageContent(
  url: string
): Promise<{ title: string; content: string }> {
  let html: string;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) {
      throw new WebpageFetchError(`A página respondeu com erro ${res.status}.`);
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof WebpageFetchError) throw err;
    throw new WebpageFetchError("Não foi possível acessar essa página.");
  }

  let article;
  try {
    const dom = new JSDOM(html, { url });
    article = new Readability(dom.window.document).parse();
  } catch {
    throw new WebpageFetchError("Não foi possível interpretar o conteúdo dessa página.");
  }

  const content = article?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const title = article?.title?.trim() || url;

  if (content.length < 200) {
    throw new WebpageFetchError(
      "Não foi possível extrair texto suficiente dessa página (pode estar bloqueada, exigir login ou ser majoritariamente visual)."
    );
  }

  return { title, content };
}
