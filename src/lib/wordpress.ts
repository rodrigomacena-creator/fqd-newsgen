const WORDPRESS_URL = process.env.WORDPRESS_URL?.replace(/\/$/, "");

export interface WordPressCategory {
  id: number;
  name: string;
}

function getAuthHeader(): string {
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;
  if (!WORDPRESS_URL || !username || !appPassword) {
    throw new Error(
      "Integração com o WordPress não configurada (WORDPRESS_URL/WORDPRESS_USERNAME/WORDPRESS_APP_PASSWORD)."
    );
  }
  return "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
}

export async function listWordPressCategories(): Promise<WordPressCategory[]> {
  if (!WORDPRESS_URL) {
    throw new Error("WORDPRESS_URL não configurada.");
  }

  const res = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/categories?per_page=100&orderby=name&order=asc`);
  if (!res.ok) {
    throw new Error(`Não foi possível carregar as categorias do WordPress (${res.status}).`);
  }

  const data = (await res.json()) as { id: number; name: string }[];
  return data.map((c) => ({ id: c.id, name: c.name }));
}

// Baixa a imagem (ex.: thumbnail do YouTube) e sobe pra biblioteca de mídia do
// WordPress, retornando o ID do anexo pra usar como imagem destacada do post.
async function uploadImageToWordPress(imageUrl: string, filename: string): Promise<number> {
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Não foi possível baixar a imagem (${imageRes.status}) para enviar ao WordPress.`);
  }
  const buffer = Buffer.from(await imageRes.arrayBuffer());
  const contentType = imageRes.headers.get("content-type") || "image/jpeg";

  const res = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem ao WordPress (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id: number };
  return data.id;
}

export async function createWordPressPost(params: {
  title: string;
  contentHtml: string;
  excerpt: string;
  categoryIds: number[];
  featuredImageUrl?: string;
}): Promise<{ id: number; editUrl: string }> {
  const { title, contentHtml, excerpt, categoryIds, featuredImageUrl } = params;

  let featuredMediaId: number | undefined;
  if (featuredImageUrl) {
    try {
      featuredMediaId = await uploadImageToWordPress(featuredImageUrl, "capa.jpg");
    } catch (err) {
      console.error("Falha ao subir imagem destacada pro WordPress:", err);
      // segue sem imagem destacada em vez de falhar o post inteiro por causa dela
    }
  }

  const res = await fetch(`${WORDPRESS_URL}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
      content: contentHtml,
      excerpt,
      status: "draft",
      categories: Array.from(new Set(categoryIds)),
      ...(featuredMediaId ? { featured_media: featuredMediaId } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Falha ao criar o post no WordPress (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id: number };
  return { id: data.id, editUrl: `${WORDPRESS_URL}/wp-admin/post.php?post=${data.id}&action=edit` };
}
