import type {
	ArcherAchievement,
	ArcherCard,
	ArcherPerformance as ArcherPerformanceView,
	ArcherProfile,
	ArcherRef,
	Bow,
	ImageRef,
	Locale,
} from "archery-contracts";
import type {
	Achievement,
	AchievementTranslation,
	Archer,
	ArcherCareerStat,
	ArcherPerformance,
	ArcherTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

// Level sort order for the honours grid (most prestigious first).
// `other` = international events not tied to a continent (e.g. Conquest Cup in
// Istanbul) — they're shown with the GLOBE icon, so they rank as GLOBAL (same tier
// as `world`). Within that global tier the secondary sort is descending count, so a
// 3× win lands ahead of lower-count world events.
const LEVEL_ORDER: Record<string, number> = {
	world: 0,
	other: 0,
	european: 1,
	state: 2,
	varazdin: 3,
};

// Medal "rank" so a merged medal card keeps the BEST medal it contains (gold beats
// silver beats bronze) for the card's styling.
const MEDAL_RANK: Record<string, number> = { gold: 3, silver: 2, bronze: 1 };

// Group an archer's individual achievement rows into the profile's "Postignuća"
// cards. Grouping is PER EVENT (title + level), split only by MEDALS vs RECORDS:
//   • one MEDAL card per event — ALL medals at that event (gold/silver/bronze)
//     merged together, count = total medals. A gold IS the title (the win), so it
//     counts as ONE of those medals, never double-counted as a separate card.
//   • one RECORD card per event — record entries (type='record', no medal) kept on
//     their own card.
// The card keeps the BEST medal (gold > silver > bronze) for styling; a medal card
// that includes a gold is typed 'title' (a championship) else 'other'.
// Ordered by level (global → european → state → varazdin), then descending count,
// then title. Each title is resolved to the requested locale.
function groupAchievements(
	rows: (Achievement & { translations: AchievementTranslation[] })[] | undefined,
	requested: Locale,
): ArcherAchievement[] {
	const groups = new Map<string, ArcherAchievement>();
	// The achievements relation is only present when the route includes it; tolerate
	// its absence (e.g. rows built without the include) by treating it as empty.
	for (const row of rows ?? []) {
		const { row: t } = resolveTranslation(
			row.translations,
			requested,
			row.sourceLocale as Locale,
		);
		const isRecord = row.type === "record";
		// Key on title + level + medals-vs-records (NOT the individual medal colour),
		// so all medals of one event collapse into a single card.
		const key = `${t.title}|${row.level}|${isRecord ? "record" : "medal"}`;
		const existing = groups.get(key);
		if (existing) {
			existing.count += 1;
			// Promote the card's medal/type to the best medal seen for this event.
			if (
				!isRecord &&
				(MEDAL_RANK[row.medal ?? ""] ?? 0) > (MEDAL_RANK[existing.medal ?? ""] ?? 0)
			) {
				existing.medal = row.medal as ArcherAchievement["medal"];
				existing.type = row.type as ArcherAchievement["type"];
			}
		} else {
			groups.set(key, {
				title: t.title,
				count: 1,
				level: row.level as ArcherAchievement["level"],
				type: row.type as ArcherAchievement["type"],
				medal: row.medal as ArcherAchievement["medal"],
			});
		}
	}
	return [...groups.values()].sort(
		(a, b) =>
			(LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9) ||
			b.count - a.count ||
			a.title.localeCompare(b.title),
	);
}

// Whole years between birthDate and now.
function ageFrom(birthDate: Date | null): number | null {
	if (!birthDate) return null;
	const now = new Date();
	let age = now.getFullYear() - birthDate.getFullYear();
	const m = now.getMonth() - birthDate.getMonth();
	if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--;
	return age;
}

// Map a Prisma Archer row -> the lightweight roster-card view.
export function toArcherCard(row: Archer): ArcherCard {
	return {
		slug: row.slug,
		firstName: row.firstName,
		lastName: row.lastName,
		cardPhoto: row.cardPhotoUrl
			? { url: row.cardPhotoUrl, alt: row.cardPhotoAlt ?? "" }
			: null,
		gender: row.gender as ArcherCard["gender"],
		competitionCategories: row.competitionCategories,
		bowType: row.bowType as Bow[],
		roles: row.roles as ArcherCard["roles"],
		order: row.order,
	};
}

function toRef(a: Archer): ArcherRef {
	return { slug: a.slug, firstName: a.firstName, lastName: a.lastName };
}

// A Prisma Archer row with everything the profile needs included.
type ArcherProfileRow = Archer & {
	translations: ArcherTranslation[];
	careerStats: ArcherCareerStat[];
	performance: ArcherPerformance[];
	coaches: Archer[];
	students: Archer[];
	achievements?: (Achievement & { translations: AchievementTranslation[] })[];
};

// Map a Prisma Archer row -> the full profile view. Applies privacy rules:
//  - age: derived; hidden (null) when the archer is a minor (<18) or no birthDate.
//  - hiddenSections: 'bio'/'stats'/'performance' are omitted server-side so
//    hidden data never reaches the client.
export function toArcherProfile(row: ArcherProfileRow, requested: Locale): ArcherProfile {
	const hidden = new Set(row.hiddenSections);

	const age = ageFrom(row.birthDate);
	const shownAge = age !== null && age >= 18 ? age : null;

	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	return {
		slug: row.slug,
		firstName: row.firstName,
		lastName: row.lastName,
		cardPhoto: row.cardPhotoUrl
			? { url: row.cardPhotoUrl, alt: row.cardPhotoAlt ?? "" }
			: null,
		profilePhoto: row.profilePhotoUrl
			? { url: row.profilePhotoUrl, alt: row.profilePhotoAlt ?? "" }
			: null,
		gender: row.gender as ArcherProfile["gender"],
		bowType: row.bowType as Bow[],
		roles: row.roles as ArcherProfile["roles"],
		competitionCategories: row.competitionCategories,
		worldArcheryId: row.worldArcheryId,
		age: shownAge,

		coaches: row.coaches.map(toRef),
		students: row.students.map(toRef),

		achievements: groupAchievements(row.achievements, locale),

		careerStats: hidden.has("stats")
			? []
			: row.careerStats.map((s) => ({
					year: s.year,
					discipline: s.discipline,
					averageScore: s.averageScore,
					wins: s.wins,
					losses: s.losses,
					highestScore: s.highestScore,
				})),
		performance: hidden.has("performance")
			? []
			: row.performance.map((p) => ({
					date: p.date,
					name: p.name,
					scope: p.scope as ArcherPerformanceView["scope"],
					type: p.type as ArcherPerformanceView["type"],
					categories: p.categories,
					meters: p.meters,
					placing: p.placing,
					points: p.points,
				})),

		locale,
		bio: hidden.has("bio") ? null : t.bio,
	};
}

// ── Admin DTOs ───────────────────────────────────────────────────────────────
// Admin-only views for the dashboard Momčad section (Croatian-only). The list row
// is what the Svi streličari / Nacrti tables render; the edit data prefills the
// Uredi streličar form with every field the create/update body accepts.

export type ArcherAdminRow = {
	id: string;
	slug: string;
	name: string; // "First Last"
	roles: string[];
	bowType: string[];
	gender: string | null;
	competitionCategories: string[];
	order: number;
	status: string; // 'draft' | 'published'
	hidden: boolean;
	cardPhoto: ImageRef | null; // list thumbnail
};

// Map an Archer row -> the admin list row. cardPhoto is the small headshot; null
// lets the table show a placeholder.
export function toArcherAdminRow(row: Archer): ArcherAdminRow {
	return {
		id: row.id,
		slug: row.slug,
		name: `${row.firstName} ${row.lastName}`,
		roles: row.roles,
		bowType: row.bowType,
		gender: row.gender,
		competitionCategories: row.competitionCategories,
		order: row.order,
		status: row.status,
		hidden: row.hidden,
		cardPhoto: row.cardPhotoUrl
			? { url: row.cardPhotoUrl, alt: row.cardPhotoAlt ?? "" }
			: null,
	};
}

// The full editable archer (GET /admin/archers/:id) for the Uredi streličar form:
// every updateBody field prefilled, incl. the HR source bio, coach IDs, hidden
// sections, raw birthDate, and the nested careerStats / performance rows (WITH ids
// so the diff-update can match/keep them).
export type ArcherEditData = {
	id: string;
	slug: string;
	firstName: string;
	lastName: string;
	roles: string[];
	bowType: string[];
	gender: string | null;
	competitionCategories: string[];
	order: number;
	cardPhotoUrl: string | null;
	cardPhotoAlt: string | null;
	profilePhotoUrl: string | null;
	profilePhotoAlt: string | null;
	worldArcheryId: string | null;
	birthDate: string | null; // ISO date (yyyy-mm-dd) or null
	hiddenSections: string[];
	coachIds: string[];
	status: string;
	hidden: boolean;
	bio: string; // HR source bio
	careerStats: {
		id: string;
		year: number;
		discipline: string;
		averageScore: number | null;
		wins: number;
		losses: number;
		highestScore: number | null;
	}[];
	performance: {
		id: string;
		date: string;
		name: string;
		scope: string;
		type: string;
		categories: string[];
		meters: string | null;
		placing: string | null;
		points: number | null;
	}[];
};

// A Prisma Archer row with everything the edit form needs included.
type ArcherEditRow = Archer & {
	translations: ArcherTranslation[];
	careerStats: ArcherCareerStat[];
	performance: ArcherPerformance[];
	coaches: Archer[];
};

export function toArcherEditData(row: ArcherEditRow): ArcherEditData {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		slug: row.slug,
		firstName: row.firstName,
		lastName: row.lastName,
		roles: row.roles,
		bowType: row.bowType,
		gender: row.gender,
		competitionCategories: row.competitionCategories,
		order: row.order,
		cardPhotoUrl: row.cardPhotoUrl,
		cardPhotoAlt: row.cardPhotoAlt,
		profilePhotoUrl: row.profilePhotoUrl,
		profilePhotoAlt: row.profilePhotoAlt,
		worldArcheryId: row.worldArcheryId,
		// ISO date only (yyyy-mm-dd) so an <input type="date"> can bind it directly.
		birthDate: row.birthDate ? row.birthDate.toISOString().slice(0, 10) : null,
		hiddenSections: row.hiddenSections,
		coachIds: row.coaches.map((c) => c.id),
		status: row.status,
		hidden: row.hidden,
		bio: t?.bio ?? "",
		careerStats: row.careerStats.map((s) => ({
			id: s.id,
			year: s.year,
			discipline: s.discipline,
			averageScore: s.averageScore,
			wins: s.wins,
			losses: s.losses,
			highestScore: s.highestScore,
		})),
		performance: row.performance.map((p) => ({
			id: p.id,
			date: p.date,
			name: p.name,
			scope: p.scope,
			type: p.type,
			categories: p.categories,
			meters: p.meters,
			placing: p.placing,
			points: p.points,
		})),
	};
}
