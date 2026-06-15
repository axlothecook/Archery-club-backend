import { describe, expect, it } from "vitest";
import { toArcherCard, toArcherProfile } from "./archer.ts";

// Build a birthDate that is exactly `years` ago (so age === years).
function birthYearsAgo(years: number): Date {
	const d = new Date();
	d.setFullYear(d.getFullYear() - years);
	d.setDate(d.getDate() - 1); // ensure the birthday has already passed this year
	return d;
}

function base() {
	return {
		id: "ar1",
		slug: "amanda-mlinaric",
		firstName: "Amanda",
		lastName: "Mlinarić",
		roles: ["archer"],
		bowType: ["compound"],
		gender: "female",
		competitionCategories: ["CW"],
		order: 1,
		cardPhotoUrl: "amanda.png",
		cardPhotoAlt: "Amanda",
		worldArcheryId: "17411",
		birthDate: birthYearsAgo(24),
		hiddenSections: [] as string[],
		status: "published",
		hidden: false,
		sourceLocale: "hr",
		translations: [{ id: "t0", archerId: "ar1", locale: "hr", bio: "Hrvatski bio" }, { id: "t1", archerId: "ar1", locale: "en", bio: "English bio" }],
		careerStats: [{ id: "c0", archerId: "ar1", year: 2024, discipline: "indoor", averageScore: 9.3, wins: 5, losses: 2, highestScore: 600 }],
		performance: [{ id: "p0", archerId: "ar1", date: "2024-01-01", competition: "Nimes", placing: "1st", distance: "18m", score: 600 }],
		coaches: [{ slug: "coach-leo", firstName: "Leo", lastName: "Sulik" }],
		students: [],
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function row(over: Record<string, unknown> = {}): any {
	return { ...base(), ...over };
}

describe("toArcherCard", () => {
	it("returns the lightweight roster-card fields", () => {
		const c = toArcherCard(row());
		expect(c).toEqual({
			slug: "amanda-mlinaric",
			firstName: "Amanda",
			lastName: "Mlinarić",
			cardPhoto: { url: "amanda.png", alt: "Amanda" },
			gender: "female",
			competitionCategories: ["CW"],
			bowType: ["compound"],
			roles: ["archer"],
			order: 1,
		});
	});
});

describe("toArcherProfile", () => {
	it("shows age for an adult and resolves bio to the locale", () => {
		const p = toArcherProfile(row(), "en");
		expect(p.age).toBe(24);
		expect(p.bio).toBe("English bio");
		expect(p.locale).toBe("en");
	});

	it("hides age (null) for a minor (<18)", () => {
		const p = toArcherProfile(row({ birthDate: birthYearsAgo(15) }), "hr");
		expect(p.age).toBeNull();
	});

	it("returns age null when there is no birthDate", () => {
		expect(toArcherProfile(row({ birthDate: null }), "hr").age).toBeNull();
	});

	it("omits sections listed in hiddenSections (server-side)", () => {
		const p = toArcherProfile(row({ hiddenSections: ["bio", "stats", "performance"] }), "hr");
		expect(p.bio).toBeNull();
		expect(p.careerStats).toEqual([]);
		expect(p.performance).toEqual([]);
	});

	it("maps coaches/students to name+slug refs", () => {
		const p = toArcherProfile(row(), "hr");
		expect(p.coaches).toEqual([{ slug: "coach-leo", firstName: "Leo", lastName: "Sulik" }]);
		expect(p.students).toEqual([]);
	});

	// One achievement DB row (gold IS the title/win — not a separate honour).
	function ach(title: string, level: string, type: string, medal: string | null) {
		return {
			level,
			type,
			medal,
			sourceLocale: "hr",
			translations: [{ locale: "hr", title }],
		};
	}

	describe("achievement grouping", () => {
		it("merges all medals of one event into ONE card (gold not double-counted)", () => {
			// 3 bronze + 2 silver + 1 gold at the same event → ONE card, count 6.
			const achievements = [
				ach("Indoor World Series", "world", "other", "bronze"),
				ach("Indoor World Series", "world", "other", "bronze"),
				ach("Indoor World Series", "world", "other", "bronze"),
				ach("Indoor World Series", "world", "other", "silver"),
				ach("Indoor World Series", "world", "other", "silver"),
				ach("Indoor World Series", "world", "title", "gold"),
			];
			const p = toArcherProfile(row({ achievements }), "hr");
			const iws = p.achievements.filter((a) => a.title === "Indoor World Series");
			expect(iws).toHaveLength(1);
			const card = iws[0]!;
			expect(card.count).toBe(6); // 3+2+1, NOT 7
			expect(card.medal).toBe("gold"); // best medal kept for styling
			expect(card.type).toBe("title"); // includes a win
		});

		it("keeps a RECORD on its own card, separate from medals at the same event", () => {
			const achievements = [
				ach("Europsko prvenstvo", "european", "title", "gold"),
				ach("Europsko prvenstvo", "european", "record", null),
			];
			const p = toArcherProfile(row({ achievements }), "hr");
			const cards = p.achievements.filter((a) => a.title === "Europsko prvenstvo");
			expect(cards).toHaveLength(2);
			expect(cards.some((c) => c.type === "record")).toBe(true);
		});

		it("ranks international 'other' events in the global tier (count desc)", () => {
			const achievements = [
				ach("Svjetski kup", "world", "other", "bronze"),
				ach("Conquest Cup", "other", "title", "gold"),
				ach("Conquest Cup", "other", "title", "gold"),
			];
			const p = toArcherProfile(row({ achievements }), "hr");
			// Conquest Cup (count 2, 'other'=global) sorts before the 1× world event.
			const top = p.achievements[0]!;
			expect(top.title).toBe("Conquest Cup");
			expect(top.count).toBe(2);
		});
	});
});
