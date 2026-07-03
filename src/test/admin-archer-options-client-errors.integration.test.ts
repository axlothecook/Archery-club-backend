import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin, prisma } from "./helpers.ts";

// Two small admin endpoints added for the Vijesti "Označeni streličari" picker:
//   GET  /admin/archers/options  — { id, name } of PUBLISHED archers (picker source)
//   POST /admin/client-errors    — "report a problem" sink (picker degrades on fail)
// Both auth-guarded. The picker's whole point is graceful failure, so these tests
// pin: options returns only published archers; and a failed load can be reported.

let cookie: string;
beforeEach(async () => {
	await resetDb();
	cookie = await loginAsAdmin();
});

// Minimal published/draft archer (bypass the full create body — go straight to DB).
async function makeArcher(firstName: string, lastName: string, status: "draft" | "published", order = 0) {
	return prisma.archer.create({
		data: {
			slug: `${firstName}-${lastName}`.toLowerCase(),
			firstName,
			lastName,
			roles: ["archer"],
			bowType: [],
			competitionCategories: [],
			order,
			hiddenSections: [],
			status,
			hidden: false,
			sourceLocale: "hr",
		},
	});
}

describe("GET /admin/archers/options (picker source)", () => {
	it("requires auth (401 without a session)", async () => {
		await request(app).get("/admin/archers/options").expect(401);
	});

	it("returns { id, name } for PUBLISHED archers only, ordered", async () => {
		await makeArcher("Ana", "Anić", "published", 1);
		await makeArcher("Ivan", "Ivić", "published", 0);
		await makeArcher("Draft", "Person", "draft", 2); // must NOT appear

		const res = await request(app).get("/admin/archers/options").set("Cookie", cookie).expect(200);
		expect(res.body).toEqual([
			{ id: expect.any(String), name: "Ivan Ivić" }, // order 0 first
			{ id: expect.any(String), name: "Ana Anić" }, // order 1
		]);
	});

	it("returns [] when there are no published archers (picker shows empty, not broken)", async () => {
		await makeArcher("Only", "Draft", "draft");
		await request(app).get("/admin/archers/options").set("Cookie", cookie).expect(200).expect([]);
	});
});

describe("POST /admin/client-errors (report-a-problem sink)", () => {
	it("requires auth (401 without a session)", async () => {
		await request(app).post("/admin/client-errors").send({ context: "x", message: "y" }).expect(401);
	});

	it("stores a valid report (201) and rejects an empty one (400)", async () => {
		await request(app)
			.post("/admin/client-errors")
			.set("Cookie", cookie)
			.send({ context: "vijesti-novi:archer-options", message: "Network error reaching /admin/archers/options", url: "/nadzorna-ploca/vijesti/novi" })
			.expect(201);

		const stored = await prisma.clientErrorReport.findMany();
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			context: "vijesti-novi:archer-options",
			url: "/nadzorna-ploca/vijesti/novi",
		});

		// missing required fields → 400, nothing stored
		await request(app).post("/admin/client-errors").set("Cookie", cookie).send({ context: "" }).expect(400);
		expect(await prisma.clientErrorReport.count()).toBe(1);
	});
});
