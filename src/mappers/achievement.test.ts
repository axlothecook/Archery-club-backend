import { describe, expect, it } from "vitest";
import { toAchievementResolved } from "./achievement.ts";

function archer(id: string, first: string, last: string) {
	// Only the fields the mapper reads.
	return { id, firstName: first, lastName: last, cardPhotoUrl: `${id}.png`, cardPhotoAlt: `${first} photo` };
}

function makeRow(opts: {
	translations: { locale: string; title: string }[];
	imageUrl?: string | null;
	imageAlt?: string | null;
	archers?: ReturnType<typeof archer>[];
	type?: string;
	level?: string;
	medal?: string | null;
}) {
	return {
		id: "a1",
		year: 2019,
		scope: "individual",
		level: opts.level ?? "world",
		type: opts.type ?? "title",
		medal: opts.medal === undefined ? "gold" : opts.medal,
		imageUrl: opts.imageUrl ?? null,
		imageAlt: opts.imageAlt ?? null,
		sourceLocale: "hr",
		translations: opts.translations.map((t, i) => ({ id: `t${i}`, achievementId: "a1", ...t })),
		archers: opts.archers ?? [],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe("toAchievementResolved", () => {
	it("resolves the requested locale's title", () => {
		const out = toAchievementResolved(
			makeRow({ translations: [{ locale: "hr", title: "Svjetski prvak" }, { locale: "en", title: "World Champion" }] }),
			"en",
		);
		expect(out.locale).toBe("en");
		expect(out.title).toBe("World Champion");
	});

	it("falls back to sourceLocale when the requested locale is missing", () => {
		const out = toAchievementResolved(makeRow({ translations: [{ locale: "hr", title: "Svjetski prvak" }] }), "ko");
		expect(out.locale).toBe("hr");
		expect(out.title).toBe("Svjetski prvak");
	});

	it("uses a custom image when set (overrides the stock icon)", () => {
		const withImg = toAchievementResolved(
			makeRow({ translations: [{ locale: "hr", title: "x" }], imageUrl: "i.png", imageAlt: "alt" }),
			"hr",
		);
		expect(withImg.image).toEqual({ url: "i.png", alt: "alt" });
	});

	it("falls back to the stock medal icon (gold) when no custom image is set", () => {
		// makeRow defaults to type:title + medal:gold → the gold-medal stock icon.
		const out = toAchievementResolved(makeRow({ translations: [{ locale: "hr", title: "x" }] }), "hr");
		expect(out.image?.url).toBe("https://images.axlothecook.com/archery/achievement-icons/gold-medal.png");
	});

	it("uses the record scope icon for records (state -> croatia)", () => {
		const out = toAchievementResolved(
			makeRow({ translations: [{ locale: "hr", title: "x" }], type: "record", level: "state", medal: null }),
			"hr",
		);
		expect(out.image?.url).toBe("https://images.axlothecook.com/archery/achievement-icons/croatia-record.svg");
	});

	it("returns image=null for a medal-less non-record row", () => {
		const out = toAchievementResolved(makeRow({ translations: [{ locale: "hr", title: "x" }], type: "other", medal: null }), "hr");
		expect(out.image).toBeNull();
	});

	it("maps credited archers to name + photo (empty = club-level)", () => {
		const club = toAchievementResolved(makeRow({ translations: [{ locale: "hr", title: "x" }], archers: [] }), "hr");
		expect(club.archers).toEqual([]);

		const team = toAchievementResolved(
			makeRow({ translations: [{ locale: "hr", title: "x" }], archers: [archer("am", "Amanda", "Mlinarić"), archer("al", "Alen", "Remar")] }),
			"hr",
		);
		expect(team.archers).toEqual([
			{ id: "am", firstName: "Amanda", lastName: "Mlinarić", cardPhoto: { url: "am.png", alt: "Amanda photo" } },
			{ id: "al", firstName: "Alen", lastName: "Remar", cardPhoto: { url: "al.png", alt: "Alen photo" } },
		]);
	});
});
