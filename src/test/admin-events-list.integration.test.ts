import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin } from "./helpers.ts";

// The dashboard Raspored section needs to LIST events (incl. drafts) and event
// levels — neither had an admin GET before. Create via the admin POST, read back.

let cookie: string;
beforeEach(async () => {
	await resetDb();
	cookie = await loginAsAdmin();
});

function eventBody(over: Record<string, unknown> = {}) {
	return {
		discipline: "outdoor",
		dateFrom: "2026-07-04T00:00:00.000Z",
		name: "Natjecanje",
		...over,
	};
}

describe("GET /admin/events (dashboard list)", () => {
	it("requires auth (401 without a session)", async () => {
		await request(app).get("/admin/events").expect(401);
	});

	it("returns BOTH drafts and published (public feed hides drafts + non-attended)", async () => {
		await request(app).post("/admin/events").set("Cookie", cookie).send(eventBody({ name: "Objavljeni", status: "published", hasUnlistedClubAttendee: true })).expect(201);
		await request(app).post("/admin/events").set("Cookie", cookie).send(eventBody({ name: "Nacrt", status: "draft" })).expect(201);

		const all = await request(app).get("/admin/events").set("Cookie", cookie).expect(200);
		expect(all.body).toHaveLength(2);
		expect((all.body as { name: string }[]).map((e) => e.name).sort()).toEqual(["Nacrt", "Objavljeni"]);

		// public feed shows only the published + club-attended one
		const pub = await request(app).get("/events?locale=hr").expect(200);
		expect(pub.body).toHaveLength(1);
		expect(pub.body[0].name).toBe("Objavljeni");
	});

	it("filters by ?status and returns the admin-row shape (name, discipline, dates, level, attendeeCount)", async () => {
		// a level to attach
		const lvl = await request(app).post("/admin/event-levels").set("Cookie", cookie).send({ color: "#003DA5", order: 0, name: "Svjetski kup" }).expect(201);
		await request(app)
			.post("/admin/events")
			.set("Cookie", cookie)
			.send(eventBody({ name: "S razinom", status: "published", levelId: lvl.body.id, dateTo: "2026-07-05T00:00:00.000Z" }))
			.expect(201);

		const drafts = await request(app).get("/admin/events?status=draft").set("Cookie", cookie).expect(200);
		expect(drafts.body).toHaveLength(0);

		const published = await request(app).get("/admin/events?status=published").set("Cookie", cookie).expect(200);
		expect(published.body).toHaveLength(1);
		const row = published.body[0];
		expect(row).toMatchObject({
			name: "S razinom",
			discipline: "outdoor",
			status: "published",
			hidden: false,
			isCancelled: false,
			attendeeCount: 0,
		});
		expect(row.level).toMatchObject({ name: "Svjetski kup", color: "#003DA5" });
		expect(row.dateTo).not.toBeNull();
	});
});

describe("GET /admin/event-levels (picker + Kategorije CRUD)", () => {
	it("requires auth (401 without a session)", async () => {
		await request(app).get("/admin/event-levels").expect(401);
	});

	it("returns { id, name, color, order, eventCount } ordered, with usage count", async () => {
		const a = await request(app).post("/admin/event-levels").set("Cookie", cookie).send({ color: "#C8102E", order: 1, name: "Državno" }).expect(201);
		await request(app).post("/admin/event-levels").set("Cookie", cookie).send({ color: "#003DA5", order: 0, name: "Svjetsko" }).expect(201);
		// one event using level A → eventCount reflects it
		await request(app).post("/admin/events").set("Cookie", cookie).send(eventBody({ levelId: a.body.id })).expect(201);

		const res = await request(app).get("/admin/event-levels").set("Cookie", cookie).expect(200);
		expect(res.body.map((l: { name: string }) => l.name)).toEqual(["Svjetsko", "Državno"]); // order 0,1
		const drzavno = res.body.find((l: { name: string }) => l.name === "Državno");
		expect(drzavno).toMatchObject({ color: "#C8102E", order: 1, eventCount: 1 });
	});
});
