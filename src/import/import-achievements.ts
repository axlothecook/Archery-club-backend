import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import club achievements (seed-data/achievements.json) into Achievement rows.
// Each credited archer NAME is resolved to an Archer id (run the roster importer
// FIRST); unmatched names are logged loudly. Club-level rows have archers: [].
//
// Achievements have no natural unique key (no slug), so this importer is
// idempotent by CLEAR-AND-REINSERT: it deletes all existing achievements and
// recreates them from the seed. Safe because achievements are seed-sourced (no
// admin-authored ones to preserve yet); revisit if the dashboard starts creating
// achievements independently. Ignores _-prefixed annotation fields (_flags etc.).

type SeedAchievement = {
	year: number | null;
	archers: string[];
	scope: string;
	level: string;
	alsoLevels?: string[];
	type: string;
	medal: string | null;
	imageUrl: string | null;
	imageAlt: string | null;
	title: string;
};

const PATH = join(process.cwd(), "seed-data", "achievements.json");

export async function importAchievements(): Promise<{
	created: number;
	rows: number;
	unmatchedArchers: string[];
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { achievements: SeedAchievement[] };
	const rows = raw.achievements;

	const allArchers = await prisma.archer.findMany({ select: { id: true, firstName: true, lastName: true } });
	const idByFullName = new Map(allArchers.map((a) => [`${a.firstName} ${a.lastName}`, a.id]));

	const unmatched = new Set<string>();
	let created = 0;

	// Clear-and-reinsert (idempotent). Translations cascade-delete with the parent.
	await prisma.achievement.deleteMany({});

	for (const r of rows) {
		const archerIds: string[] = [];
		for (const name of r.archers) {
			const id = idByFullName.get(name);
			if (id) archerIds.push(id);
			else {
				unmatched.add(name);
				console.warn(`[achievements-import] archer "${name}" (achievement "${r.title}" ${r.year ?? "n/a"}) has no roster archer — credit skipped`);
			}
		}

		await prisma.achievement.create({
			data: {
				// year is non-null in the schema; seed may carry null for an unknown
				// date → store 0 as a sentinel "year unknown" (front-end can hide it).
				year: r.year ?? 0,
				scope: r.scope,
				level: r.level,
				alsoLevels: r.alsoLevels ?? [],
				type: r.type,
				medal: r.medal,
				imageUrl: r.imageUrl,
				imageAlt: r.imageAlt,
				sourceLocale: "hr",
				archers: { connect: archerIds.map((id) => ({ id })) },
				translations: { create: [{ locale: "hr", title: r.title }] },
			},
		});
		created++;
	}

	return { created, rows: rows.length, unmatchedArchers: [...unmatched] };
}
