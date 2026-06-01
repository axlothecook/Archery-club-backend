import type {
	ArcherCard,
	ArcherPerformance as ArcherPerformanceView,
	ArcherProfile,
	ArcherRef,
	Bow,
	Locale,
} from "archery-contracts";
import type {
	Archer,
	ArcherCareerStat,
	ArcherPerformance,
	ArcherTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

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
