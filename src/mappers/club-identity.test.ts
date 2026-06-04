import { describe, expect, it } from "vitest";
import { toClubIdentitySectionResolved } from "./club-identity.ts";

// Minimal stand-in for a Prisma ClubIdentitySection row with translations included.
// Only the fields the mapper reads are present.
function makeRow(
	kind: string,
	translations: { locale: string; title: string; content: unknown }[],
	opts: { slug?: string; order?: number; isDefault?: boolean } = {},
) {
	return {
		id: "s1",
		slug: opts.slug ?? "values",
		order: opts.order ?? 0,
		kind,
		isDefault: opts.isDefault ?? false,
		sourceLocale: "hr",
		translations: translations.map((t, i) => ({
			id: `t${i}`,
			sectionId: "s1",
			...t,
		})),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

const VALUES_HR = {
	locale: "hr",
	title: "Vrijednosti",
	content: { kind: "blocks", blocks: [{ header: "Sport je ljudsko pravo", body: "tekst" }] },
};
const VALUES_EN = {
	locale: "en",
	title: "Values",
	content: { kind: "blocks", blocks: [{ header: "Sport is a human right", body: "text" }] },
};

describe("toClubIdentitySectionResolved", () => {
	it("returns the requested locale's text", () => {
		const out = toClubIdentitySectionResolved(makeRow("blocks", [VALUES_HR, VALUES_EN]), "en");
		expect(out.locale).toBe("en");
		expect(out.title).toBe("Values");
	});

	it("falls back to sourceLocale when the requested locale is missing", () => {
		const out = toClubIdentitySectionResolved(makeRow("blocks", [VALUES_HR]), "ko");
		expect(out.locale).toBe("hr");
		expect(out.title).toBe("Vrijednosti");
	});

	it("passes through kind + isDefault + order", () => {
		const out = toClubIdentitySectionResolved(
			makeRow("blocks", [VALUES_HR], { isDefault: true, order: 0 }),
			"hr",
		);
		expect(out.kind).toBe("blocks");
		expect(out.isDefault).toBe(true);
		expect(out.order).toBe(0);
	});

	it("passes through the kind-discriminated content (single)", () => {
		const crest = {
			locale: "hr",
			title: "Grb kluba",
			content: { kind: "single", image: { url: "https://r2/crest.png", alt: "grb" }, body: "opis" },
		};
		const out = toClubIdentitySectionResolved(makeRow("single", [crest], { slug: "crest", order: 1 }), "hr");
		expect(out.content).toEqual({
			kind: "single",
			image: { url: "https://r2/crest.png", alt: "grb" },
			body: "opis",
		});
	});

	it("passes through the kind-discriminated content (gallery)", () => {
		const jersey = {
			locale: "hr",
			title: "Dres kluba",
			content: {
				kind: "gallery",
				items: [{ image: { url: "https://r2/j1.jpg", alt: "dres" }, description: "prvi dres", date: "2014" }],
			},
		};
		const out = toClubIdentitySectionResolved(makeRow("gallery", [jersey], { slug: "jersey", order: 2 }), "hr");
		expect(out.content).toEqual({
			kind: "gallery",
			items: [{ image: { url: "https://r2/j1.jpg", alt: "dres" }, description: "prvi dres", date: "2014" }],
		});
	});
});
