import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin, prisma } from "./helpers.ts";

// CRITICAL CHOKEPOINTS — the failures that would break the public site or blank a
// page. The public front-end degrades gracefully (each load .catch()s to []/null),
// but that only saves the site if the BACKEND doesn't hard-fail: an endpoint that
// 500s (instead of returning an empty list / clean 404) or that leaks/loses data is
// the real "nothing shows" / "wrong data" risk. These 10 assert:
//   • every page-critical public endpoint responds on an EMPTY db — 200 + valid
//     shape (lists → [] / { items: [] }), or a clean 404 for the unconfigured
//     singleton — NEVER a 500 (an empty club must still render).
//   • one broken record in a collection does NOT take the endpoint (or its
//     siblings) down — the good rows + the other sections still serve.
//   • the two data-integrity guards that matter most: drafts/hidden never reach the
//     public feed, and the article response never leaks the draft/FB-sync fields.
//
// This file is the "does the site come up at all, and keep coming up when one thing
// is broken" smoke test. It runs in the CI test gate before deploy.

beforeEach(async () => {
	await resetDb();
});

describe("critical chokepoints — site comes up on an empty DB (no 500s)", () => {
	// 1–8: the page-critical public LIST endpoints must serve on an empty club.
	it("1. /team serves [] on empty DB (Momčad page renders empty, not broken)", async () => {
		await request(app).get("/team?locale=hr").expect(200).expect([]);
	});

	it("2. /sponsors serves [] on empty DB (site-wide footer never blanks)", async () => {
		await request(app).get("/sponsors?locale=hr").expect(200).expect([]);
	});

	it("3. /achievements serves [] on empty DB (Postignuća page renders)", async () => {
		await request(app).get("/achievements?locale=hr").expect(200).expect([]);
	});

	it("4. /events serves [] on empty DB (Raspored page renders)", async () => {
		await request(app).get("/events?locale=hr").expect(200).expect([]);
	});

	it("5. /event-levels serves [] on empty DB (calendar legend renders)", async () => {
		await request(app).get("/event-levels?locale=hr").expect(200).expect([]);
	});

	it("6. /articles serves { items: [], nextCursor: null } on empty DB (home feed renders)", async () => {
		const res = await request(app).get("/articles?locale=hr").expect(200);
		expect(res.body).toEqual({ items: [], nextCursor: null });
	});

	it("7. /hero serves [] on empty DB (homepage hero has a safe empty state)", async () => {
		await request(app).get("/hero").expect(200).expect([]);
	});

	it("8. /club-info returns a clean 404 (not 500) when the club singleton isn't configured", async () => {
		// The FE .catch(() => null)s this, so the chrome still renders. The contract
		// that matters: it must be a controlled 404, never an unhandled 500.
		await request(app).get("/club-info?locale=hr").expect(404);
	});
});

describe("critical chokepoints — graceful degradation + data integrity", () => {
	// 9. One corrupt record in a collection must not 500 the whole feed NOR the other
	// sections — the good data and the rest of the site still serve. A published
	// article with NO translations is unmappable (toArticleCard needs one).
	it("9. a broken record is skipped; the endpoint AND its siblings still serve", async () => {
		// a good, mappable published sponsor (a sibling section) + a broken article.
		const cookie = await loginAsAdmin();
		await request(app)
			.post("/admin/sponsors")
			.set("Cookie", cookie)
			.send({ name: "Good Co", logoUrl: "https://cdn.ex/l.png", logoAlt: "Good Co", description: "Opis." })
			.expect(201);

		// a published article with no translation row → unmappable.
		const now = new Date();
		await prisma.article.create({
			data: {
				slug: "broken",
				source: "manual",
				mediaType: "event",
				posterImageUrl: "https://cdn.ex/p.jpg",
				posterImageAlt: "P",
				status: "published",
				hidden: false,
				publishedAt: now,
				createdAt: now,
				updatedAt: now,
				sourceLocale: "hr",
				adminEdited: false,
			},
		});
		// add a GOOD published article too, so we can prove the good one survives.
		await request(app)
			.post("/admin/articles")
			.set("Cookie", cookie)
			.send({
				mediaType: "event",
				posterImageUrl: "https://cdn.ex/p2.jpg",
				posterImageAlt: "P2",
				title: "Dobar članak",
				body: "Tijelo.",
				excerpt: "Sažetak.",
				status: "published",
			})
			.expect(201);

		// the article feed skips the broken one, serves the good one — no 500.
		const feed = await request(app).get("/articles?locale=hr").expect(200);
		expect(feed.body.items).toHaveLength(1);
		expect(feed.body.items[0].title).toBe("Dobar članak");

		// the sibling section is completely unaffected.
		const sponsors = await request(app).get("/sponsors?locale=hr").expect(200);
		expect(sponsors.body).toHaveLength(1);
		expect(sponsors.body[0].name).toBe("Good Co");
	});

	// 10. The single most important data-integrity guard: unpublished/hidden content
	// must NEVER reach the public, and the public article view must never leak the
	// internal draft/FB-sync fields. A leak here = private/unfinished data exposed.
	it("10. drafts + hidden stay out of the public feed; no internal fields leak", async () => {
		const cookie = await loginAsAdmin();
		// draft + hidden-published + a normal published one
		await request(app).post("/admin/articles").set("Cookie", cookie).send({ mediaType: "event", posterImageUrl: "https://cdn.ex/a.jpg", posterImageAlt: "A", title: "Nacrt", body: "b", excerpt: "e", status: "draft" }).expect(201);
		await request(app).post("/admin/articles").set("Cookie", cookie).send({ mediaType: "event", posterImageUrl: "https://cdn.ex/b.jpg", posterImageAlt: "B", title: "Skriven", body: "b", excerpt: "e", status: "published", hidden: true }).expect(201);
		const good = await request(app).post("/admin/articles").set("Cookie", cookie).send({ mediaType: "event", posterImageUrl: "https://cdn.ex/c.jpg", posterImageAlt: "C", title: "Javni", body: "b", excerpt: "e", status: "published" }).expect(201);

		const feed = await request(app).get("/articles?locale=hr").expect(200);
		expect(feed.body.items).toHaveLength(1);
		expect(feed.body.items[0].title).toBe("Javni");

		// full article view of the published one must not leak internal fields.
		const slug = (await request(app).get("/articles?locale=hr")).body.items[0].slug;
		const full = await request(app).get(`/articles/${slug}?locale=hr`).expect(200);
		expect(full.body).not.toHaveProperty("draftRevision");
		expect(full.body).not.toHaveProperty("fbContentHash");
		expect(full.body).not.toHaveProperty("fbRefusedHash");
		expect(full.body).not.toHaveProperty("adminEdited");
		expect(full.body).not.toHaveProperty("hidden");
		expect(full.body).not.toHaveProperty("status");
		void good;
	});
});
