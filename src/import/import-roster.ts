import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";
import { slugify } from "../http/slug.ts";

// Import the club roster (seed-data/roster.json) into Archer rows.
// Idempotent: upserts by slug (firstName + lastName). careerStats / performance
// / the hr bio translation are replaced wholesale on update. Coaches are linked
// in a SECOND pass (every archer must exist first) by exact "First Last" match;
// unmatched coach names are logged loudly, never silently dropped.
//
// Ignores annotation fields (_flags / _comment / _notes — anything _-prefixed).
// A non-URL cardPhotoUrl placeholder ("TODO-PHOTO") becomes null → the front-end
// shows a default stock image (same for a missing profile photo).

type RosterCareerStat = {
	year: number;
	discipline: string;
	averageScore: number | null;
	wins: number;
	losses: number;
	highestScore: number | null;
};

type RosterPerformance = {
	date: string;
	name: string;
	scope: string;
	type: string;
	categories?: string[];
	meters: string | null;
	placing: string | null;
	points: number | null;
};

type RosterArcher = {
	firstName: string;
	lastName: string;
	roles: string[];
	bowType: string[];
	gender: string | null;
	competitionCategories: string[];
	order: number;
	status: string;
	cardPhotoUrl: string | null;
	cardPhotoAlt: string | null;
	profilePhotoUrl: string | null;
	profilePhotoAlt: string | null;
	worldArcheryId: string | null;
	birthDate: string | null;
	bio: string;
	coaches: string[];
	careerStats: RosterCareerStat[];
	performance: RosterPerformance[];
};

const ROSTER_PATH = join(process.cwd(), "seed-data", "roster.json");

// A cardPhotoUrl that isn't a real URL (e.g. the "TODO-PHOTO" placeholder on
// draft stubs) is treated as "no photo" → null.
function photoOrNull(url: string | null): string | null {
	if (!url) return null;
	return url.startsWith("http") ? url : null;
}

export async function importRoster(): Promise<{
	created: number;
	updated: number;
	archers: number;
	coachLinks: number;
	unmatchedCoaches: string[];
}> {
	const raw = JSON.parse(readFileSync(ROSTER_PATH, "utf8")) as { archers: RosterArcher[] };
	const archers = raw.archers;

	let created = 0;
	let updated = 0;

	// Pass 1: upsert every archer (without coach links — targets may not exist yet).
	// Track the slug we used per "First Last" so pass 2 can resolve coach names.
	const slugByFullName = new Map<string, string>();

	for (const a of archers) {
		const slug = slugify(`${a.firstName} ${a.lastName}`);
		slugByFullName.set(`${a.firstName} ${a.lastName}`, slug);

		const cardUrl = photoOrNull(a.cardPhotoUrl);
		const neutral = {
			firstName: a.firstName,
			lastName: a.lastName,
			roles: a.roles,
			bowType: a.bowType,
			gender: a.gender,
			competitionCategories: a.competitionCategories,
			order: a.order,
			cardPhotoUrl: cardUrl,
			cardPhotoAlt: cardUrl ? a.cardPhotoAlt : null,
			profilePhotoUrl: photoOrNull(a.profilePhotoUrl),
			profilePhotoAlt: photoOrNull(a.profilePhotoUrl) ? a.profilePhotoAlt : null,
			worldArcheryId: a.worldArcheryId,
			birthDate: a.birthDate ? new Date(a.birthDate) : null,
			hiddenSections: [] as string[],
			status: a.status,
			hidden: false,
			sourceLocale: "hr",
		};

		const careerStats = a.careerStats.map((s) => ({
			year: s.year,
			discipline: s.discipline,
			averageScore: s.averageScore,
			wins: s.wins,
			losses: s.losses,
			highestScore: s.highestScore,
		}));
		const performance = a.performance.map((p) => ({
			date: p.date,
			name: p.name,
			scope: p.scope,
			type: p.type,
			categories: p.categories ?? [],
			meters: p.meters,
			placing: p.placing,
			points: p.points,
		}));

		const existing = await prisma.archer.findUnique({ where: { slug } });

		if (existing) {
			await prisma.$transaction(async (tx) => {
				await tx.archer.update({ where: { id: existing.id }, data: neutral });
				// Replace child rows + translation wholesale (idempotent re-import).
				await tx.archerCareerStat.deleteMany({ where: { archerId: existing.id } });
				await tx.archerPerformance.deleteMany({ where: { archerId: existing.id } });
				if (careerStats.length) await tx.archerCareerStat.createMany({ data: careerStats.map((s) => ({ ...s, archerId: existing.id })) });
				if (performance.length) await tx.archerPerformance.createMany({ data: performance.map((p) => ({ ...p, archerId: existing.id })) });
				await tx.archerTranslation.upsert({
					where: { archerId_locale: { archerId: existing.id, locale: "hr" } },
					create: { archerId: existing.id, locale: "hr", bio: a.bio },
					update: { bio: a.bio },
				});
			});
			updated++;
		} else {
			await prisma.archer.create({
				data: {
					slug,
					...neutral,
					careerStats: { create: careerStats },
					performance: { create: performance },
					translations: { create: [{ locale: "hr", bio: a.bio }] },
				},
			});
			created++;
		}
	}

	// Pass 2: resolve coach NAMES → archer ids and link (set, so re-import is clean).
	const allArchers = await prisma.archer.findMany({ select: { id: true, firstName: true, lastName: true } });
	const idByFullName = new Map(allArchers.map((a) => [`${a.firstName} ${a.lastName}`, a.id]));

	let coachLinks = 0;
	const unmatchedCoaches = new Set<string>();

	for (const a of archers) {
		const slug = slugByFullName.get(`${a.firstName} ${a.lastName}`)!;
		const me = await prisma.archer.findUnique({ where: { slug }, select: { id: true } });
		if (!me) continue;

		const coachIds: string[] = [];
		for (const coachName of a.coaches) {
			const id = idByFullName.get(coachName);
			if (id) {
				coachIds.push(id);
				coachLinks++;
			} else {
				unmatchedCoaches.add(coachName);
				console.warn(`[roster-import] coach "${coachName}" (for ${a.firstName} ${a.lastName}) has no roster archer — link skipped`);
			}
		}
		await prisma.archer.update({
			where: { id: me.id },
			data: { coaches: { set: coachIds.map((id) => ({ id })) } },
		});
	}

	return {
		created,
		updated,
		archers: archers.length,
		coachLinks,
		unmatchedCoaches: [...unmatchedCoaches],
	};
}
