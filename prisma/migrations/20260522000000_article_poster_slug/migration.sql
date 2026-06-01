-- Add slug + main poster image to Article (table is empty, so non-null adds are safe).
ALTER TABLE "Article" ADD COLUMN "slug" TEXT NOT NULL;
ALTER TABLE "Article" ADD COLUMN "posterImageUrl" TEXT NOT NULL;
ALTER TABLE "Article" ADD COLUMN "posterImageAlt" TEXT NOT NULL;

-- Unique slug for pretty article URLs.
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");
