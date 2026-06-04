-- CreateTable
CREATE TABLE "ClubIdentitySection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "ClubIdentitySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubIdentitySectionTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sectionId" TEXT NOT NULL,

    CONSTRAINT "ClubIdentitySectionTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubIdentitySection_slug_key" ON "ClubIdentitySection"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClubIdentitySectionTranslation_sectionId_locale_key" ON "ClubIdentitySectionTranslation"("sectionId", "locale");

-- AddForeignKey
ALTER TABLE "ClubIdentitySectionTranslation" ADD CONSTRAINT "ClubIdentitySectionTranslation_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ClubIdentitySection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
