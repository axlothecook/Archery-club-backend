import { describe, expect, it } from "vitest";
import { toSponsorResolved } from "./sponsor.ts";

// Minimal stand-in for a Prisma Sponsor row with translations included.
// Only the fields the mapper reads are present.
function makeRow(translations: { locale: string; description: string }[]) {
	return {
		id: "s1",
		name: "Lasercopy",
		logoUrl: "https://r2/logo.png",
		logoAlt: "Lasercopy logo",
		website: "https://lasercopy.hr",
		sourceLocale: "hr",
		translations: translations.map((t, i) => ({
			id: `t${i}`,
			sponsorId: "s1",
			...t,
		})),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe("toSponsorResolved", () => {
	it("returns the requested locale's text", () => {
		const row = makeRow([
			{ locale: "hr", description: "hrvatski opis" },
			{ locale: "en", description: "english description" },
		]);
		const out = toSponsorResolved(row, "en");
		expect(out.locale).toBe("en");
		expect(out.description).toBe("english description");
	});

	it("falls back to sourceLocale when the requested locale is missing", () => {
		const row = makeRow([{ locale: "hr", description: "hrvatski opis" }]);
		const out = toSponsorResolved(row, "ko"); // no Korean row
		expect(out.locale).toBe("hr"); // fell back to sourceLocale
		expect(out.description).toBe("hrvatski opis");
	});

	it("reassembles the logo into { url, alt }", () => {
		const row = makeRow([{ locale: "hr", description: "x" }]);
		const out = toSponsorResolved(row, "hr");
		expect(out.logo).toEqual({ url: "https://r2/logo.png", alt: "Lasercopy logo" });
	});
});
