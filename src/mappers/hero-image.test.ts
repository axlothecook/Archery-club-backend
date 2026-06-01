import { describe, expect, it } from "vitest";
import { toHeroImage } from "./hero-image.ts";

describe("toHeroImage", () => {
	it("reassembles the image columns and keeps order", () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const row = { id: "h1", imageUrl: "hero.png", imageAlt: "archer", order: 3 } as any;
		expect(toHeroImage(row)).toEqual({
			id: "h1",
			image: { url: "hero.png", alt: "archer" },
			order: 3,
		});
	});
});
