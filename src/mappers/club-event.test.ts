import { describe, expect, it } from "vitest";
import { toClubEventResolved } from "./club-event.ts";

function archer(first: string, last: string) {
	return { firstName: first, lastName: last };
}

function level(translations: { locale: string; name: string }[]) {
	return {
		id: "lvl1",
		color: "#C8102E",
		order: 1,
		translations: translations.map((t, i) => ({ id: `lt${i}`, eventLevelId: "lvl1", ...t })),
	};
}

function makeRow(opts: {
	translations: { locale: string; name: string }[];
	dateFrom: Date;
	dateTo?: Date | null;
	imageUrl?: string | null;
	imageAlt?: string | null;
	level?: ReturnType<typeof level> | null;
	attendingArchers?: ReturnType<typeof archer>[];
	hasUnlistedClubAttendee?: boolean;
}) {
	return {
		id: "e1",
		discipline: "indoor",
		format: "WA 18",
		dateFrom: opts.dateFrom,
		dateTo: opts.dateTo ?? null,
		imageUrl: opts.imageUrl ?? null,
		imageAlt: opts.imageAlt ?? null,
		sourceUrl: null,
		isCancelled: false,
		status: "published",
		hidden: false,
		location: "Nimes",
		organizer: "VSK",
		hasUnlistedClubAttendee: opts.hasUnlistedClubAttendee ?? false,
		sourceLocale: "hr",
		level: opts.level ?? null,
		attendingArchers: opts.attendingArchers ?? [],
		translations: opts.translations.map((t, i) => ({ id: `t${i}`, clubEventId: "e1", ...t })),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe("toClubEventResolved", () => {
	it("resolves name to the requested locale and serializes dates to ISO", () => {
		const out = toClubEventResolved(
			makeRow({
				translations: [{ locale: "hr", name: "Nimes turnir" }, { locale: "en", name: "Nimes Tournament" }],
				dateFrom: new Date("2026-01-15T00:00:00.000Z"),
				dateTo: new Date("2026-01-17T00:00:00.000Z"),
			}),
			"en",
		);
		expect(out.name).toBe("Nimes Tournament");
		expect(out.locale).toBe("en");
		expect(out.dateFrom).toBe("2026-01-15T00:00:00.000Z");
		expect(out.dateTo).toBe("2026-01-17T00:00:00.000Z");
	});

	it("returns dateTo=null for a single-day event", () => {
		const out = toClubEventResolved(
			makeRow({ translations: [{ locale: "hr", name: "x" }], dateFrom: new Date("2026-03-29T00:00:00.000Z"), dateTo: null }),
			"hr",
		);
		expect(out.dateTo).toBeNull();
	});

	it("falls back to sourceLocale for the name", () => {
		const out = toClubEventResolved(
			makeRow({ translations: [{ locale: "hr", name: "Nimes turnir" }], dateFrom: new Date() }),
			"ko",
		);
		expect(out.locale).toBe("hr");
		expect(out.name).toBe("Nimes turnir");
	});

	it("embeds the resolved level (name+color) or null", () => {
		const withLevel = toClubEventResolved(
			makeRow({
				translations: [{ locale: "hr", name: "x" }],
				dateFrom: new Date(),
				level: level([{ locale: "hr", name: "Domaće" }, { locale: "en", name: "Domestic" }]),
			}),
			"en",
		);
		expect(withLevel.level).toEqual({ id: "lvl1", name: "Domestic", color: "#C8102E" });

		const noLevel = toClubEventResolved(
			makeRow({ translations: [{ locale: "hr", name: "x" }], dateFrom: new Date(), level: null }),
			"hr",
		);
		expect(noLevel.level).toBeNull();
	});

	it("maps attendees to plain names and carries the unlisted flag", () => {
		const out = toClubEventResolved(
			makeRow({
				translations: [{ locale: "hr", name: "x" }],
				dateFrom: new Date(),
				attendingArchers: [archer("Amanda", "Mlinarić"), archer("Alen", "Remar")],
				hasUnlistedClubAttendee: true,
			}),
			"hr",
		);
		expect(out.attendees).toEqual(["Amanda Mlinarić", "Alen Remar"]);
		expect(out.hasUnlistedClubAttendee).toBe(true);
	});
});
