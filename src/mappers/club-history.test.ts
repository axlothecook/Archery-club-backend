import { describe, expect, it } from "vitest";
import { toClubHistoryPeriodResolved } from "./club-history.ts";

// Minimal stand-in for a Prisma ClubHistoryPeriod row with translations included.
// Only the fields the mapper reads are present.
function makeRow(
	translations: {
		locale: string;
		title: string;
		subtitle: string;
		lead: string;
		paragraphs: { header: string; body: string }[];
	}[],
	cover: { url: string | null; alt: string | null } = {
		url: "https://r2/ch-1.jpg",
		alt: "cover",
	},
) {
	return {
		id: "p1",
		slug: "2014-temelji",
		order: 0,
		coverImageUrl: cover.url,
		coverImageAlt: cover.alt,
		sourceLocale: "hr",
		translations: translations.map((t, i) => ({
			id: `t${i}`,
			periodId: "p1",
			...t,
		})),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

const HR = {
	locale: "hr",
	title: "2014. Temelji",
	subtitle: "podnaslov",
	lead: "uvod",
	paragraphs: [{ header: "Osnivači", body: "tekst" }],
};
const EN = {
	locale: "en",
	title: "2014 Foundations",
	subtitle: "subtitle",
	lead: "intro",
	paragraphs: [{ header: "Founders", body: "text" }],
};

describe("toClubHistoryPeriodResolved", () => {
	it("returns the requested locale's text", () => {
		const out = toClubHistoryPeriodResolved(makeRow([HR, EN]), "en");
		expect(out.locale).toBe("en");
		expect(out.title).toBe("2014 Foundations");
		expect(out.lead).toBe("intro");
	});

	it("falls back to sourceLocale when the requested locale is missing", () => {
		const out = toClubHistoryPeriodResolved(makeRow([HR]), "ko"); // no Korean row
		expect(out.locale).toBe("hr"); // fell back to sourceLocale
		expect(out.title).toBe("2014. Temelji");
	});

	it("passes through the ordered structured paragraphs", () => {
		const out = toClubHistoryPeriodResolved(makeRow([HR]), "hr");
		expect(out.paragraphs).toEqual([{ header: "Osnivači", body: "tekst" }]);
	});

	it("reassembles the cover into { url, alt }", () => {
		const out = toClubHistoryPeriodResolved(makeRow([HR]), "hr");
		expect(out.coverImage).toEqual({ url: "https://r2/ch-1.jpg", alt: "cover" });
	});

	it("returns null coverImage when no cover is set", () => {
		const out = toClubHistoryPeriodResolved(
			makeRow([HR], { url: null, alt: null }),
			"hr",
		);
		expect(out.coverImage).toBeNull();
	});
});
