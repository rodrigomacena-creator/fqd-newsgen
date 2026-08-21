-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "instagramImageModel" TEXT;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "defaultInstagramImageModel" TEXT NOT NULL DEFAULT 'krea/krea-2-medium-turbo';
