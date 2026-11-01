-- Perfis neutros (pedido do Rodrigo em 01/11/2026): falar de qualquer assunto sem marca nem lado
-- comercial. Viram o padrão de cada tipo; Macena e Oxyn Group continuam disponíveis.
ALTER TABLE "VideoProfile" ADD COLUMN "neutral" BOOLEAN NOT NULL DEFAULT false;

UPDATE "VideoProfile" SET "isDefault" = false WHERE "isDefault" = true;

INSERT INTO "VideoProfile" ("id", "kind", "name", "description", "tone", "speech", "voiceId", "voiceName", "isDefault", "neutral", "updatedAt")
VALUES ('perfil-generico', 'person', 'Narrador genérico',
        'Narrador informativo que fala de qualquer assunto (games, cultura, tecnologia, curiosidades) sem se apresentar e sem ligação com empresa.',
        'Neutro, curioso e envolvente, como um bom apresentador de notícias curtas. Equilibrado, sem exagero nem sensacionalismo.',
        'Português do Brasil falado, frases curtas e claras. Não fala de si, de clientes, de consultoria nem de marketing. Evita jargão de vendas.',
        'UY3oRETjQaraEM058uNo', 'Macena', true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "VideoProfile" ("id", "kind", "name", "description", "tone", "speech", "isDefault", "neutral", "updatedAt")
VALUES ('perfil-neutro', 'company', 'Neutro (sem empresa)',
        'Conteúdo independente e informativo, sem marca dona do vídeo.',
        'Jornalístico e imparcial.',
        'Não citar empresa, site, @ nem oferecer produto ou serviço. CTA só de engajamento (seguir, salvar, comentar).',
        true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
