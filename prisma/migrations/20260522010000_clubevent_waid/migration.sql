-- Add World Archery competition id to ClubEvent (nullable; unique for import dedupe).
ALTER TABLE "ClubEvent" ADD COLUMN "waId" TEXT;
CREATE UNIQUE INDEX "ClubEvent_waId_key" ON "ClubEvent"("waId");
