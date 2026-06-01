-- CreateTable
CREATE TABLE "Sponsor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT NOT NULL,
    "logoAlt" TEXT NOT NULL,
    "website" TEXT,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sponsorId" TEXT NOT NULL,

    CONSTRAINT "SponsorTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Archer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "roles" TEXT[],
    "bowType" TEXT,
    "gender" TEXT,
    "competitionCategories" TEXT[],
    "order" INTEGER NOT NULL,
    "cardPhotoUrl" TEXT NOT NULL,
    "cardPhotoAlt" TEXT NOT NULL,
    "worldArcheryId" TEXT,
    "isMinor" BOOLEAN NOT NULL,
    "minorVisibleFields" TEXT[],
    "hiddenSections" TEXT[],
    "status" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "Archer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcherCareerStat" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "discipline" TEXT NOT NULL,
    "averageScore" DOUBLE PRECISION,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "highestScore" DOUBLE PRECISION,
    "archerId" TEXT NOT NULL,

    CONSTRAINT "ArcherCareerStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcherPerformance" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "placing" TEXT NOT NULL,
    "distance" TEXT,
    "score" DOUBLE PRECISION,
    "archerId" TEXT NOT NULL,

    CONSTRAINT "ArcherPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArcherTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "archerId" TEXT NOT NULL,

    CONSTRAINT "ArcherTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "medal" TEXT,
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,

    CONSTRAINT "AchievementTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLevel" (
    "id" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "EventLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventLevelTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventLevelId" TEXT NOT NULL,

    CONSTRAINT "EventLevelTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEvent" (
    "id" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "format" TEXT,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3),
    "imageUrl" TEXT,
    "imageAlt" TEXT,
    "sourceUrl" TEXT,
    "isCancelled" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "location" TEXT,
    "organizer" TEXT,
    "sourceLocale" TEXT NOT NULL,
    "levelId" TEXT,

    CONSTRAINT "ClubEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubEventTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clubEventId" TEXT NOT NULL,

    CONSTRAINT "ClubEventTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fbId" TEXT,
    "fbPermalinkUrl" TEXT,
    "mediaType" TEXT NOT NULL,
    "videoUrl" TEXT,
    "videoPosterUrl" TEXT,
    "externalUrl" TEXT,
    "externalSourceName" TEXT,
    "status" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL,
    "draftRevision" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fbContentHash" TEXT,
    "fbRefusedHash" TEXT,
    "adminEdited" BOOLEAN NOT NULL,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "ArticleTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ArcherCoaches" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArcherCoaches_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_EventAttendees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EventAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ArticleMentions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArticleMentions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ArcherAchievements" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ArcherAchievements_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "SponsorTranslation_sponsorId_locale_key" ON "SponsorTranslation"("sponsorId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Archer_slug_key" ON "Archer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ArcherTranslation_archerId_locale_key" ON "ArcherTranslation"("archerId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementTranslation_achievementId_locale_key" ON "AchievementTranslation"("achievementId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "EventLevelTranslation_eventLevelId_locale_key" ON "EventLevelTranslation"("eventLevelId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ClubEventTranslation_clubEventId_locale_key" ON "ClubEventTranslation"("clubEventId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleTranslation_articleId_locale_key" ON "ArticleTranslation"("articleId", "locale");

-- CreateIndex
CREATE INDEX "_ArcherCoaches_B_index" ON "_ArcherCoaches"("B");

-- CreateIndex
CREATE INDEX "_EventAttendees_B_index" ON "_EventAttendees"("B");

-- CreateIndex
CREATE INDEX "_ArticleMentions_B_index" ON "_ArticleMentions"("B");

-- CreateIndex
CREATE INDEX "_ArcherAchievements_B_index" ON "_ArcherAchievements"("B");

-- AddForeignKey
ALTER TABLE "SponsorTranslation" ADD CONSTRAINT "SponsorTranslation_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcherCareerStat" ADD CONSTRAINT "ArcherCareerStat_archerId_fkey" FOREIGN KEY ("archerId") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcherPerformance" ADD CONSTRAINT "ArcherPerformance_archerId_fkey" FOREIGN KEY ("archerId") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArcherTranslation" ADD CONSTRAINT "ArcherTranslation_archerId_fkey" FOREIGN KEY ("archerId") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementTranslation" ADD CONSTRAINT "AchievementTranslation_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventLevelTranslation" ADD CONSTRAINT "EventLevelTranslation_eventLevelId_fkey" FOREIGN KEY ("eventLevelId") REFERENCES "EventLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "EventLevel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubEventTranslation" ADD CONSTRAINT "ClubEventTranslation_clubEventId_fkey" FOREIGN KEY ("clubEventId") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleImage" ADD CONSTRAINT "ArticleImage_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleTranslation" ADD CONSTRAINT "ArticleTranslation_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArcherCoaches" ADD CONSTRAINT "_ArcherCoaches_A_fkey" FOREIGN KEY ("A") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArcherCoaches" ADD CONSTRAINT "_ArcherCoaches_B_fkey" FOREIGN KEY ("B") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventAttendees" ADD CONSTRAINT "_EventAttendees_A_fkey" FOREIGN KEY ("A") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EventAttendees" ADD CONSTRAINT "_EventAttendees_B_fkey" FOREIGN KEY ("B") REFERENCES "ClubEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArticleMentions" ADD CONSTRAINT "_ArticleMentions_A_fkey" FOREIGN KEY ("A") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArticleMentions" ADD CONSTRAINT "_ArticleMentions_B_fkey" FOREIGN KEY ("B") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArcherAchievements" ADD CONSTRAINT "_ArcherAchievements_A_fkey" FOREIGN KEY ("A") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ArcherAchievements" ADD CONSTRAINT "_ArcherAchievements_B_fkey" FOREIGN KEY ("B") REFERENCES "Archer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
