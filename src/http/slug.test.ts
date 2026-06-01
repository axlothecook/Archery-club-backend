import { describe, expect, it } from "vitest";
import { slugify } from "./slug.ts";

describe("slugify", () => {
	it("handles Croatian diacritics", () => {
		expect(slugify("Amanda osvojila zlato")).toBe("amanda-osvojila-zlato");
		expect(slugify("Streličarski klub")).toBe("strelicarski-klub");
		expect(slugify("Đakovo Žuži Šibenik Čakovec")).toBe("dakovo-zuzi-sibenik-cakovec");
	});

	it("strips punctuation and collapses separators", () => {
		expect(slugify("Gold!! @ Nimes (2026)")).toBe("gold-nimes-2026");
		expect(slugify("  trailing  spaces  ")).toBe("trailing-spaces");
	});

	it("falls back for empty/symbol-only input", () => {
		expect(slugify("!!!")).toBe("article");
		expect(slugify("")).toBe("article");
	});
});
