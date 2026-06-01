import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import custom category card images (seed-data/achievement-categories.json) into
// AchievementCategory rows. `type` is the hr title — the join key to the grouped
// achievements on /achievements/summary. Idempotent via UPSERT by `type` (a real
// unique key, so no clear-and-reinsert needed). Ignores _-prefixed annotation
// fields (_comment, _label).
//
// Consistency guard (§3.6): a category whose `type` matches NO achievement title
// would silently never display — its image attaches to a group that doesn't
// exist. We warn loudly for each such orphan so a typo in the join key surfaces.

type SeedCategory = {
	type: string;
	imageUrl: string;
	imageAlt: string;
};

const PATH = join(process.cwd(), "seed-data", "achievement-categories.json");

export async function importAchievementCategories(): Promise<{
	upserted: number;
	orphans: string[];
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { categories: SeedCategory[] };
	const categories = raw.categories;

	// The set of hr titles that actually exist on achievements (the join targets).
	const titleRows = await prisma.achievementTranslation.findMany({
		where: { locale: "hr" },
		select: { title: true },
	});
	const existingTitles = new Set(titleRows.map((t) => t.title));

	const orphans: string[] = [];
	let upserted = 0;

	for (const c of categories) {
		if (!existingTitles.has(c.type)) {
			orphans.push(c.type);
			console.warn(`[achievement-categories-import] category type "${c.type}" matches no achievement title — its image will never display (typo in the hr title?)`);
		}
		await prisma.achievementCategory.upsert({
			where: { type: c.type },
			create: { type: c.type, imageUrl: c.imageUrl, imageAlt: c.imageAlt },
			update: { imageUrl: c.imageUrl, imageAlt: c.imageAlt },
		});
		upserted++;
	}

	return { upserted, orphans };
}
