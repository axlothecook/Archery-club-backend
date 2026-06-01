-- CreateTable
CREATE TABLE "HeroImage" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageAlt" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "HeroImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubInfo" (
    "id" TEXT NOT NULL,
    "foundedDate" TIMESTAMP(3),
    "address" TEXT,
    "email" TEXT,
    "oib" TEXT,
    "officers" JSONB NOT NULL,
    "socials" JSONB NOT NULL,
    "sourceLocale" TEXT NOT NULL,

    CONSTRAINT "ClubInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubHistoryPhoto" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "clubInfoId" TEXT NOT NULL,

    CONSTRAINT "ClubHistoryPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubInfoTranslation" (
    "id" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "valuesText" TEXT NOT NULL,
    "historyText" TEXT NOT NULL,
    "officerRoleLabels" JSONB NOT NULL,
    "photoCaptions" JSONB NOT NULL,
    "clubInfoId" TEXT NOT NULL,

    CONSTRAINT "ClubInfoTranslation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipSubmission" (
    "id" TEXT NOT NULL,
    "salutation" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "birthDate" TIMESTAMP(3),
    "experience" TEXT,
    "forMinor" BOOLEAN NOT NULL,
    "minorDetails" TEXT,
    "message" TEXT,
    "consentAccepted" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SponsorInquiry" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "sponsorshipInterest" TEXT,
    "message" TEXT,
    "consentAccepted" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SponsorInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationInquiry" (
    "id" TEXT NOT NULL,
    "donorName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "consentAccepted" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "responded" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubInfoTranslation_clubInfoId_locale_key" ON "ClubInfoTranslation"("clubInfoId", "locale");

-- AddForeignKey
ALTER TABLE "ClubHistoryPhoto" ADD CONSTRAINT "ClubHistoryPhoto_clubInfoId_fkey" FOREIGN KEY ("clubInfoId") REFERENCES "ClubInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubInfoTranslation" ADD CONSTRAINT "ClubInfoTranslation_clubInfoId_fkey" FOREIGN KEY ("clubInfoId") REFERENCES "ClubInfo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
