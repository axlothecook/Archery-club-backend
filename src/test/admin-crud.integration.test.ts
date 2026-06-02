import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin } from "./helpers.ts";
import { prisma } from "../db.ts";

let cookie: string;
beforeEach(async () => {
	await resetDb();
	cookie = await loginAsAdmin();
});

describe("admin CRUD round-trip + validation (integration)", () => {
	// TIER 1 — a malformed write body is rejected (400) and never reaches the DB.
	it("rejects an invalid create body with 400 + field errors", async () => {
		const res = await request(app)
			.post("/admin/sponsors")
			.set("Cookie", cookie)
			.send({ name: "X", logoUrl: "not-a-url", logoAlt: "a", description: "d" })
			.expect(400);
		expect(res.body.error.fields.some((f: { field: string }) => f.field === "body.logoUrl")).toBe(true);
		// nothing was created
		await request(app).get("/sponsors").expect(200).expect([]);
	});

	// TIER 2 — create → read (public) → update → delete round-trip.
	it("create → public read → update → delete", async () => {
		const created = await request(app)
			.post("/admin/sponsors")
			.set("Cookie", cookie)
			.send({
				name: "Lasercopy",
				logoUrl: "https://sb.co/l.png",
				logoAlt: "Lasercopy",
				website: "https://lasercopy.hr",
				description: "Tvrtka za uredsku opremu.",
			})
			.expect(201);
		const id = created.body.id as string;

		// public read reflects it. Read hr (the source locale) so this is
		// deterministic regardless of the fire-and-forget translate write-hook,
		// which asynchronously populates the target locales (en/de/…) after create.
		const read = await request(app).get("/sponsors?locale=hr").expect(200);
		expect(read.body).toHaveLength(1);
		expect(read.body[0].name).toBe("Lasercopy");
		expect(read.body[0].description).toBe("Tvrtka za uredsku opremu.");

		// update the name
		await request(app).patch(`/admin/sponsors/${id}`).set("Cookie", cookie).send({ name: "Lasercopy d.o.o." }).expect(200);
		const afterUpdate = await request(app).get("/sponsors").expect(200);
		expect(afterUpdate.body[0].name).toBe("Lasercopy d.o.o.");

		// delete
		await request(app).delete(`/admin/sponsors/${id}`).set("Cookie", cookie).expect(200);
		await request(app).get("/sponsors").expect(200).expect([]);
	});

	// TIER 3 — updating a non-existent id → 404, not 500.
	it("returns 404 when updating a non-existent sponsor", async () => {
		await request(app)
			.patch("/admin/sponsors/00000000-0000-0000-0000-000000000000")
			.set("Cookie", cookie)
			.send({ name: "x" })
			.expect(404);
	});

	// Admin can ADD / CHANGE / CLEAR an archer's worldArcheryId after creation
	// (e.g. when the club later links a member to their World Archery profile).
	it("admin can add, update and clear an archer's worldArcheryId", async () => {
		const created = await request(app)
			.post("/admin/archers")
			.set("Cookie", cookie)
			.send({
				firstName: "Test",
				lastName: "Archer",
				roles: ["archer"],
				bowType: ["recurve"],
				cardPhotoUrl: "https://sb.co/a.png",
				cardPhotoAlt: "Test Archer",
				bio: "Testni opis.",
				status: "published",
			})
			.expect(201);
		const { id, slug } = created.body as { id: string; slug: string };

		// created without a WA id → null on the public profile
		const before = await request(app).get(`/team/${slug}`).expect(200);
		expect(before.body.worldArcheryId).toBeNull();

		// admin ADDS a WA id
		await request(app).patch(`/admin/archers/${id}`).set("Cookie", cookie).send({ worldArcheryId: "17411" }).expect(200);
		const afterAdd = await request(app).get(`/team/${slug}`).expect(200);
		expect(afterAdd.body.worldArcheryId).toBe("17411");

		// admin CHANGES it
		await request(app).patch(`/admin/archers/${id}`).set("Cookie", cookie).send({ worldArcheryId: "15290" }).expect(200);
		const afterChange = await request(app).get(`/team/${slug}`).expect(200);
		expect(afterChange.body.worldArcheryId).toBe("15290");

		// admin CLEARS it back to null
		await request(app).patch(`/admin/archers/${id}`).set("Cookie", cookie).send({ worldArcheryId: null }).expect(200);
		const afterClear = await request(app).get(`/team/${slug}`).expect(200);
		expect(afterClear.body.worldArcheryId).toBeNull();
	});

	// The expanded performance row shape {date,name,scope,type,categories,meters,
	// placing,points} round-trips through create → public profile, AND an archer
	// with NO card photo comes back with cardPhoto: null (front-end shows a default).
	it("archer performance new-shape + null cardPhoto round-trip on the public profile", async () => {
		const created = await request(app)
			.post("/admin/archers")
			.set("Cookie", cookie)
			.send({
				firstName: "Perf",
				lastName: "Tester",
				roles: ["archer"],
				bowType: ["compound"],
				gender: "female",
				competitionCategories: ["CW"],
				// no cardPhotoUrl/Alt → should surface as cardPhoto: null
				bio: "Testni opis.",
				status: "published",
				performance: [
					{
						date: "05/2026",
						name: "European Outdoor Championships 2026",
						scope: "global",
						type: "outdoor",
						categories: ["CW"],
						meters: "50m",
						placing: "15th",
						points: 691,
					},
				],
			})
			.expect(201);
		const { slug } = created.body as { slug: string };

		const profile = await request(app).get(`/team/${slug}`).expect(200);
		// null card photo → null (the WA-style "no photo" default lives in the UI)
		expect(profile.body.cardPhoto).toBeNull();
		// the performance row comes back in the new shape, fields intact
		expect(profile.body.performance).toHaveLength(1);
		const p = profile.body.performance[0];
		expect(p).toMatchObject({
			date: "05/2026",
			name: "European Outdoor Championships 2026",
			scope: "global",
			type: "outdoor",
			categories: ["CW"],
			meters: "50m",
			placing: "15th",
			points: 691,
		});
		// none of the OLD field names leak through
		expect(p.competition).toBeUndefined();
		expect(p.distance).toBeUndefined();
		expect(p.score).toBeUndefined();
	});
});

describe("admin club-info: contact editable, identity locked (integration)", () => {
	// Seed a minimal singleton (stands in for the seed importer) so the
	// update-only admin PUT has a row to update.
	async function seedSingleton() {
		const ci = await prisma.clubInfo.create({
			data: { sourceLocale: "hr", officers: [], socials: [], foundedDate: new Date("2014-10-10") },
		});
		await prisma.clubInfoTranslation.create({
			data: {
				clubInfoId: ci.id, locale: "hr",
				valuesBlocks: [{ header: "Sport je ljudsko pravo", body: "..." }],
				historyText: "", officerRoleLabels: {}, photoCaptions: {},
			},
		});
	}

	it("admin can update contact + socials", async () => {
		await seedSingleton();
		await request(app)
			.put("/admin/club-info")
			.set("Cookie", cookie)
			.send({ address: "Varaždin, R. Boškovića 18", email: "club@example.com", socials: [{ platform: "instagram", url: "https://instagram.com/x" }] })
			.expect(200);
		const read = await request(app).get("/club-info?locale=hr").expect(200);
		expect(read.body.address).toBe("Varaždin, R. Boškovića 18");
		expect(read.body.email).toBe("club@example.com");
		expect(read.body.socials).toEqual([{ platform: "instagram", url: "https://instagram.com/x" }]);
	});

	it("rejects an attempt to edit IDENTITY fields with 400 (strict body)", async () => {
		await seedSingleton();
		const res = await request(app)
			.put("/admin/club-info")
			.set("Cookie", cookie)
			.send({ address: "x", valuesBlocks: [{ header: "h", body: "b" }] })
			.expect(400);
		// the unrecognized identity key is reported as a body-level validation error
		expect(res.body.error).toBeDefined();
		// and identity is untouched: valuesBlocks still the seeded value
		const read = await request(app).get("/club-info?locale=hr").expect(200);
		expect(read.body.valuesBlocks).toEqual([{ header: "Sport je ljudsko pravo", body: "..." }]);
	});

	it("returns 409 when the singleton does not exist yet", async () => {
		// no seedSingleton() — resetDb already cleared it
		await request(app)
			.put("/admin/club-info")
			.set("Cookie", cookie)
			.send({ address: "x" })
			.expect(409);
	});
});
