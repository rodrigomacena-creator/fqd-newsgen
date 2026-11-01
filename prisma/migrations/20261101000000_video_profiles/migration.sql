-- Perfis de comunicação (pessoa/empresa) e imagens do briefing nos vídeos.
ALTER TABLE "VideoJob" ADD COLUMN "personId" TEXT;
ALTER TABLE "VideoJob" ADD COLUMN "companyId" TEXT;
ALTER TABLE "VideoJob" ADD COLUMN "briefingImages" TEXT;

CREATE TABLE "VideoProfile" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tone" TEXT,
    "speech" TEXT,
    "voiceId" TEXT,
    "voiceName" TEXT,
    "site" TEXT,
    "instagram" TEXT,
    "cta" TEXT,
    "logoUrl" TEXT,
    "colors" TEXT,
    "pronunciations" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VideoProfile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VideoProfile_kind_name_idx" ON "VideoProfile"("kind", "name");

-- Perfis iniciais = o que o gerador usava fixo até aqui (Rodrigo/Macena falando pela Oxyn Group).
INSERT INTO "VideoProfile" ("id", "kind", "name", "description", "tone", "speech", "voiceId", "voiceName", "isDefault", "updatedAt")
VALUES ('perfil-macena', 'person', 'Macena',
        'Rodrigo Macena, especialista em marketing digital, IA, SEO/GEO e negócios.',
        'Direto, didático e confiante, com provocações leves para prender a atenção.',
        'Português do Brasil falado, frases curtas, sem jargão desnecessário.',
        'UY3oRETjQaraEM058uNo', 'Macena', true, CURRENT_TIMESTAMP);
INSERT INTO "VideoProfile" ("id", "kind", "name", "description", "tone", "site", "pronunciations", "isDefault", "updatedAt")
VALUES ('perfil-oxyn', 'company', 'Oxyn Group',
        'Consultoria de marketing digital, IA, SEO/GEO e negócios.',
        'Profissional e acessível.',
        'oxyngroup.com.br',
        '[{"display":"oxyngroup.com.br","spoken":"óxin grúp ponto com ponto bê érre"},{"display":"Oxyn Group","spoken":"Óxin Grúp"}]',
        true, CURRENT_TIMESTAMP);

-- Vídeos existentes continuam com a mesma comunicação.
UPDATE "VideoJob" SET "personId" = 'perfil-macena', "companyId" = 'perfil-oxyn';
