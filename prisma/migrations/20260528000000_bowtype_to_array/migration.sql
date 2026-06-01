-- Archer.bowType: scalar TEXT -> TEXT[] (an archer can compete in multiple bow
-- styles, e.g. recurve + barebow). First element = primary bow (grid section).
-- Pre-launch: no real archer rows to preserve, so the column is dropped and
-- recreated, matching the TEXT[] convention used for "roles"/"competitionCategories".
ALTER TABLE "Archer" DROP COLUMN "bowType";
ALTER TABLE "Archer" ADD COLUMN "bowType" TEXT[];
