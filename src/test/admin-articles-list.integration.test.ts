import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin } from "./helpers.ts";

// GET /admin/articles — the dashboard's article LIST (Objavljene vijesti / Nacrti).
// Unlike the public GET /articles it must return drafts + hidden too, and is
// auth-guarded. Create articles via the admin POST, then read them back.

let cookie: string;
beforeEach(async () => {
	await resetDb();
	cookie = await loginAsAdmin();
});

// Minimal valid create body; override per test.
function articleBody(over: Record<string, unknown> = {}) {
	return {
		mediaType: "event",
		posterImageUrl: "https://cdn.example/p.jpg",
		posterImageAlt: "Poster",
		title: "Naslov",
		body: "Tijelo članka.",
		excerpt: "Sažetak.",
		...over,
	};
}

describe("GET /admin/articles (dashboard list)", () => {
	it("requires auth (401 without a session cookie)", async () => {
		await request(app).get("/admin/articles").expect(401);
	});

	it("returns BOTH drafts and published (public feed would hide drafts)", async () => {
		await request(app)
			.post("/admin/articles")
			.set("Cookie", cookie)
			.send(articleBody({ title: "Objavljeni", status: "published" }))
			.expect(201);
		await request(app)
			.post("/admin/articles")
			.set("Cookie", cookie)
			.send(articleBody({ title: "Nacrt", status: "draft" }))
			.expect(201);

		// admin list sees both
		const all = await request(app).get("/admin/articles").set("Cookie", cookie).expect(200);
		expect(all.body).toHaveLength(2);
		const titles = (all.body as { title: string }[]).map((a) => a.title).sort();
		expect(titles).toEqual(["Nacrt", "Objavljeni"]);

		// the PUBLIC feed only shows the published one — proves the admin list is broader
		const pub = await request(app).get("/articles?locale=hr").expect(200);
		expect(pub.body.items).toHaveLength(1);
		expect(pub.body.items[0].title).toBe("Objavljeni");
	});

	it("filters by ?status=draft and ?status=published", async () => {
		await request(app).post("/admin/articles").set("Cookie", cookie).send(articleBody({ title: "P1", status: "published" })).expect(201);
		await request(app).post("/admin/articles").set("Cookie", cookie).send(articleBody({ title: "D1", status: "draft" })).expect(201);
		await request(app).post("/admin/articles").set("Cookie", cookie).send(articleBody({ title: "D2", status: "draft" })).expect(201);

		const drafts = await request(app).get("/admin/articles?status=draft").set("Cookie", cookie).expect(200);
		expect(drafts.body).toHaveLength(2);
		expect((drafts.body as { status: string }[]).every((a) => a.status === "draft")).toBe(true);

		const published = await request(app).get("/admin/articles?status=published").set("Cookie", cookie).expect(200);
		expect(published.body).toHaveLength(1);
		expect(published.body[0].title).toBe("P1");
	});

	it("returns the admin-row shape (id, status, hidden, posterImage, flags) + HR title", async () => {
		await request(app)
			.post("/admin/articles")
			.set("Cookie", cookie)
			.send(articleBody({ title: "Naslov na hrvatskom", status: "draft" }))
			.expect(201);

		const res = await request(app).get("/admin/articles").set("Cookie", cookie).expect(200);
		const row = res.body[0];
		expect(row).toMatchObject({
			title: "Naslov na hrvatskom",
			status: "draft",
			hidden: false,
			mediaType: "event",
			source: "manual",
			hasPendingDraft: false,
			adminEdited: false,
		});
		expect(typeof row.id).toBe("string");
		expect(row.posterImage).toEqual({ url: "https://cdn.example/p.jpg", alt: "Poster" });
		// a brand-new draft has no publishedAt
		expect(row.publishedAt).toBeNull();
	});
});
