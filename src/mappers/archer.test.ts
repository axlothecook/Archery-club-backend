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
});
