import { describe, expect, it } from "vitest";
import { toClubInfoResolved } from "./club-info.ts";

function makeRow() {
	return {
		id: "ci1",
		foundedDate: new Date("2014-01-01T00:00:00.000Z"),
		address: "Varaždin",
		email: "varazdin.archery.club@gmail.com",
		oib: "12345678901",
		officers: [{ name: "Ivan Horvat", roleKey: "president" }],
		socials: [{ platform: "instagram", url: "https://instagram.com/varazdinarchery" }],
		sourceLocale: "hr",
		historyPhotos: [
			{ id: "ph2", url: "b.png", alt: "b", order: 2, clubInfoId: "ci1" },
			{ id: "ph1", url: "a.png", alt: "a", order: 1, clubInfoId: "ci1" },
		],
		translations: [
			{
				id: "t0", clubInfoId: "ci1", locale: "hr",
				valuesBlocks: [{ header: "Vrijednost", body: "Opis" }], historyText: "Povijest",
				officerRoleLabels: { president: "Predsjednik" },
				photoCaptions: { ph1: "Osnivači" },
			},
			{
				id: "t1", clubInfoId: "ci1", locale: "en",
				valuesBlocks: [{ header: "Value", body: "Description" }], historyText: "History",
				officerRoleLabels: { president: "President" },
				photoCaptions: { ph1: "Founders" },
			},
		],
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe("toClubInfoResolved", () => {
	it("resolves text + officer role label to the requested locale", () => {
		const out = toClubInfoResolved(makeRow(), "en");
		expect(out.locale).toBe("en");
		expect(out.valuesBlocks).toEqual([{ header: "Value", body: "Description" }]);
		expect(out.officers).toEqual([{ name: "Ivan Horvat", role: "President" }]);
	});

	it("sorts history photos by order and resolves captions (null when none)", () => {
		const out = toClubInfoResolved(makeRow(), "hr");
		// ph1 (order 1, has caption) before ph2 (order 2, no caption).
		expect(out.historyPhotos).toEqual([
			{ image: { url: "a.png", alt: "a" }, caption: "Osnivači", order: 1 },
			{ image: { url: "b.png", alt: "b" }, caption: null, order: 2 },
		]);
	});

	it("serializes foundedDate to ISO and passes socials through", () => {
		const out = toClubInfoResolved(makeRow(), "hr");
		expect(out.foundedDate).toBe("2014-01-01T00:00:00.000Z");
		expect(out.socials).toEqual([{ platform: "instagram", url: "https://instagram.com/varazdinarchery" }]);
	});

	it("falls back to sourceLocale", () => {
		const out = toClubInfoResolved(makeRow(), "ko");
		expect(out.locale).toBe("hr");
		expect(out.valuesBlocks).toEqual([{ header: "Vrijednost", body: "Opis" }]);
	});
});
