import { describe, expect, it } from "vitest";
import { toArticleCard, toArticleResolved } from "./article.ts";

function base(over: Record<string, unknown> = {}) {
	return {
		id: "art1",
		slug: "amanda-wins-gold",
		source: "facebook",
		fbId: "fb_1",
		fbPermalinkUrl: "https://facebook.com/post/1",
		mediaType: "event",
		posterImageUrl: "poster.png",
		posterImageAlt: "poster",
		videoUrl: null,
		videoPosterUrl: null,
		externalUrl: null,
		externalSourceName: null,
		status: "published",
		hidden: false,
		draftRevision: null,
		publishedAt: new Date("2026-05-01T10:00:00.000Z"),
		createdAt: new Date(),
		updatedAt: new Date(),
		// sync fields — must NOT leak into resolved output
		fbContentHash: "secret-hash",
		fbRefusedHash: null,
		adminEdited: true,
		sourceLocale: "hr",
		translations: [
			{ id: "t0", articleId: "art1", locale: "hr", title: "Amanda zlato", body: "hr tijelo", excerpt: "hr saž" },
			{ id: "t1", articleId: "art1", locale: "en", title: "Amanda gold", body: "en body", excerpt: "en excerpt" },
		],
		images: [
			{ id: "i2", articleId: "art1", url: "b.png", alt: "b", order: 2 },
			{ id: "i1", articleId: "art1", url: "a.png", alt: "a", order: 1 },
		],
		mentionedArchers: [{ slug: "amanda-mlinaric", firstName: "Amanda", lastName: "Mlinarić" }],
		...over,
	};
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const row = (over = {}): any => base(over);

describe("toArticleCard", () => {
	it("returns poster + resolved title/excerpt + ISO date", () => {
		const c = toArticleCard(row(), "en");
		expect(c).toEqual({
			slug: "amanda-wins-gold",
			mediaType: "event",
			posterImage: { url: "poster.png", alt: "poster" },
			publishedAt: "2026-05-01T10:00:00.000Z",
			locale: "en",
			title: "Amanda gold",
			excerpt: "en excerpt",
		});
	});
});

describe("toArticleResolved", () => {
	it("resolves body to locale and sorts images by order", () => {
		const a = toArticleResolved(row(), "en");
		expect(a.body).toBe("en body");
		expect(a.images.map((i) => i.url)).toEqual(["a.png", "b.png"]); // order 1, 2
	});

	it("surfaces fbPermalinkUrl and mentioned archers, but NOT sync/draft fields", () => {
		const a = toArticleResolved(row(), "hr");
		expect(a.fbPermalinkUrl).toBe("https://facebook.com/post/1");
		expect(a.mentionedArchers).toEqual([{ slug: "amanda-mlinaric", firstName: "Amanda", lastName: "Mlinarić" }]);
		// the resolved object must not carry admin-only fields
		expect(a).not.toHaveProperty("fbContentHash");
		expect(a).not.toHaveProperty("fbRefusedHash");
		expect(a).not.toHaveProperty("adminEdited");
		expect(a).not.toHaveProperty("draftRevision");
	});

	it("reassembles video/externalLink, null when columns are null", () => {
		const none = toArticleResolved(row(), "hr");
		expect(none.video).toBeNull();
		expect(none.externalLink).toBeNull();

		const withMedia = toArticleResolved(
			row({ videoUrl: "v.mp4", videoPosterUrl: "vp.png", externalUrl: "https://x.hr", externalSourceName: "Večernji" }),
			"hr",
		);
		expect(withMedia.video).toEqual({ url: "v.mp4", posterUrl: "vp.png" });
		expect(withMedia.externalLink).toEqual({ url: "https://x.hr", sourceName: "Večernji" });
	});

	it("falls back to sourceLocale", () => {
		const a = toArticleResolved(row(), "ko");
		expect(a.locale).toBe("hr");
		expect(a.title).toBe("Amanda zlato");
	});
});
