import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb } from "./helpers.ts";

beforeEach(resetDb);

// Helpers to seed minimal published content.
async function makeSponsor(over: Record<string, unknown> = {}) {
	return prisma.sponsor.create({
		data: {
			name: "Lasercopy",
			logoUrl: "https://sb.co/l.png",
			logoAlt: "Lasercopy",
			website: null,
			sourceLocale: "hr",
			translations: { create: [{ locale: "hr", description: "Hrvatski opis." }] },
			...over,
		},
	});
}

describe("public reads — security & correctness (integration)", () => {
	// TIER 3 — empty state must be [] not an error.
	it("returns [] for empty collections, not an error", async () => {
		await request(app).get("/sponsors").expect(200).expect([]);
	});

	// TIER 2 — i18n: requested locale resolves; missing locale falls back to source.
	it("resolves locale and falls back to sourceLocale", async () => {
		await prisma.sponsor.create({
			data: {
				name: "X", logoUrl: "u", logoAlt: "a", website: null, sourceLocale: "hr",
				translations: { create: [{ locale: "hr", description: "hr-text" }, { locale: "en", description: "en-text" }] },
			},
		});
		const en = await request(app).get("/sponsors?locale=en").expect(200);
		expect(en.body[0].description).toBe("en-text");
		expect(en.body[0].locale).toBe("en");

		const ko = await request(app).get("/sponsors?locale=ko").expect(200); // no Korean
		expect(ko.body[0].description).toBe("hr-text"); // fell back
		expect(ko.body[0].locale).toBe("hr");
	});

	// TIER 1 — articles: hidden / draft never appear in the public feed.
	it("excludes hidden and draft articles from the public feed", async () => {
		const base = {
			source: "manual", mediaType: "event", posterImageUrl: "p", posterImageAlt: "a",
			adminEdited: false, sourceLocale: "hr", createdAt: new Date(), updatedAt: new Date(),
			publishedAt: new Date(),
		};
		await prisma.article.create({ data: { ...base, slug: "live", status: "published", hidden: false, translations: { create: [{ locale: "hr", title: "Live", body: "b", excerpt: "e" }] } } });
		await prisma.article.create({ data: { ...base, slug: "hidden", status: "published", hidden: true, translations: { create: [{ locale: "hr", title: "Hidden", body: "b", excerpt: "e" }] } } });
		await prisma.article.create({ data: { ...base, slug: "draft", status: "draft", hidden: false, publishedAt: null, translations: { create: [{ locale: "hr", title: "Draft", body: "b", excerpt: "e" }] } } });

		const res = await request(app).get("/articles?locale=hr").expect(200);
		const slugs = res.body.items.map((a: { slug: string }) => a.slug);
		expect(slugs).toEqual(["live"]);
	});

	// TIER 1 — the full article view must NOT leak admin-only / sync fields.
	it("never leaks draftRevision or FB-sync fields in the article response", async () => {
		await prisma.article.create({
			data: {
				slug: "leak-check", source: "facebook", mediaType: "event",
				posterImageUrl: "p", posterImageAlt: "a", status: "published", hidden: false,
				adminEdited: true, fbContentHash: "SECRET", fbRefusedHash: "SECRET2",
				draftRevision: { title: "pending" }, sourceLocale: "hr",
				createdAt: new Date(), updatedAt: new Date(), publishedAt: new Date(),
				translations: { create: [{ locale: "hr", title: "T", body: "b", excerpt: "e" }] },
			},
		});
		const res = await request(app).get("/articles/leak-check?locale=hr").expect(200);
		const raw = JSON.stringify(res.body);
		expect(raw).not.toContain("SECRET");
		expect(res.body).not.toHaveProperty("draftRevision");
		expect(res.body).not.toHaveProperty("fbContentHash");
		expect(res.body).not.toHaveProperty("fbRefusedHash");
		expect(res.body).not.toHaveProperty("adminEdited");
	});

	// TIER 3 — unknown slug → 404, not a 500.
	it("returns 404 for an unknown article slug", async () => {
		await request(app).get("/articles/does-not-exist").expect(404);
	});

	// TIER 2 — minor-age privacy: a minor's age is never served.
	it("hides a minor archer's age on the public profile", async () => {
		const minorBirth = new Date();
		minorBirth.setFullYear(minorBirth.getFullYear() - 15); // age 15
		await prisma.archer.create({
			data: {
				slug: "minor", firstName: "Mladi", lastName: "Strijelac", roles: ["archer"],
				bowType: ["recurve"], gender: "male", competitionCategories: [], order: 1,
				cardPhotoUrl: "p", cardPhotoAlt: "a", hiddenSections: [], status: "published",
				hidden: false, sourceLocale: "hr", birthDate: minorBirth,
				translations: { create: [{ locale: "hr", bio: "bio" }] },
			},
		});
		const res = await request(app).get("/team/minor?locale=hr").expect(200);
		expect(res.body.age).toBeNull();
	});
});
