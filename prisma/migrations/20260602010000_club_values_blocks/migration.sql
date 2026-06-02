-- Replace the free-text valuesText column with a structured valuesBlocks JSON
-- column ([{ header, body }]) for the FC-Barcelona-style /club/identity page.
-- The only existing row holds placeholder text (no real values content), so the
-- old column is dropped rather than migrated; the seed importer repopulates the
-- carved value blocks. Default '[]' keeps the NOT NULL constraint satisfiable for
-- any row created before the importer runs.

-- DropColumn
ALTER TABLE "ClubInfoTranslation" DROP COLUMN "valuesText";

-- AddColumn (with a temporary default so the existing placeholder row satisfies
-- NOT NULL; the default is dropped immediately after, matching the schema which
-- has no @default — the importer always writes the real blocks).
ALTER TABLE "ClubInfoTranslation" ADD COLUMN "valuesBlocks" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ClubInfoTranslation" ALTER COLUMN "valuesBlocks" DROP DEFAULT;
