-- CreateTable
CREATE TABLE "ClubHistoryPeriod" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "coverImageUrl" TEXT,
    "coverImageAlt" TEXT,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "ClubHistoryPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubHistoryPeriodTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT NOT NULL,
    "lead" TEXT NOT NULL,
    "paragraphs" JSONB NOT NULL,
    "periodId" TEXT NOT NULL,

    CONSTRAINT "ClubHistoryPeriodTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubHistoryPeriod_slug_key" ON "ClubHistoryPeriod"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ClubHistoryPeriodTranslation_periodId_locale_key" ON "ClubHistoryPeriodTranslation"("periodId", "locale");

-- AddForeignKey
ALTER TABLE "ClubHistoryPeriodTranslation" ADD CONSTRAINT "ClubHistoryPeriodTranslation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "ClubHistoryPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
