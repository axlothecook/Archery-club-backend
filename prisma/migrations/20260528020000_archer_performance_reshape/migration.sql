-- Reshape ArcherPerformance to match the roster seed-data row:
--   {date, name, scope, type, categories[], meters, placing, points}.
-- Renames the old columns to the seed's names (competition->name, distance->meters,
-- score->points), adds scope/type/categories, and makes placing nullable.
-- Safe: the performance table is empty (importers have not run yet), so the
-- NOT NULL adds for scope/type need no backfill. categories TEXT[] follows the
-- same convention as roles/bowType/competitionCategories (non-null, empty = none).
ALTER TABLE "ArcherPerformance" RENAME COLUMN "competition" TO "name";
ALTER TABLE "ArcherPerformance" RENAME COLUMN "distance" TO "meters";
ALTER TABLE "ArcherPerformance" RENAME COLUMN "score" TO "points";
ALTER TABLE "ArcherPerformance" ADD COLUMN "scope" TEXT NOT NULL;
ALTER TABLE "ArcherPerformance" ADD COLUMN "type" TEXT NOT NULL;
ALTER TABLE "ArcherPerformance" ADD COLUMN "categories" TEXT[];
ALTER TABLE "ArcherPerformance" ALTER COLUMN "placing" DROP NOT NULL;
