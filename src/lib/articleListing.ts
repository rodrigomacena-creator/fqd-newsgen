// Dados de listagem das notícias (histórico completo e "Suas notícias" na home do NewsGen).

interface StoredSection {
  heading: string;
  text: string;
  image?: string;
}

// Prioriza a capa do portal; se a notícia não teve Portal (ex.: só Instagram) ou a
// capa falhou na geração, usa qualquer outra imagem que exista — primeiro de uma
// seção, depois do carrossel/legado do Instagram — pra sempre ter algo no histórico.
export function pickDisplayImage(article: {
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

export interface ArticleListItem {
  id: string;
  title: string;
  coverImage: string | null;
  hasPortal: boolean;
  hasInstagram: boolean;
  sentToPortal: boolean;
  createdAt: string;
}
