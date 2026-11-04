-- Template do zero a partir do material da marca + ajustes pedidos até aprovar (só colunas novas).
ALTER TABLE "VideoTemplate" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'reference';
ALTER TABLE "VideoTemplate" ADD COLUMN "brief" TEXT;
ALTER TABLE "VideoTemplate" ADD COLUMN "brandAssets" TEXT;
ALTER TABLE "VideoTemplate" ADD COLUMN "buildState" TEXT;
ALTER TABLE "VideoTemplate" ADD COLUMN "revisionRequest" TEXT;
ALTER TABLE "VideoTemplate" ADD COLUMN "revisions" TEXT;
