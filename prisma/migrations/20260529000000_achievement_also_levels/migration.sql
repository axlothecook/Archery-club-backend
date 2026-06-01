-- Achievement.alsoLevels: extra levels an achievement ALSO counts toward in the
-- club-stats rollup, beyond its primary `level` (e.g. a record that is BOTH a
-- world AND European record → level='world', alsoLevels=['european']). TEXT[]
-- convention (same as roles/bowType/competitionCategories); empty = none.
ALTER TABLE "Achievement" ADD COLUMN "alsoLevels" TEXT[];
