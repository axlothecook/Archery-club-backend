import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb, loginAsAdmin } from "./helpers.ts";

beforeEach(resetDb);

// TIER 1 — security: auth gate + login.
describe("auth (integration)", () => {
	it("rejects /admin without a session (401)", async () => {
		await request(app).post("/admin/sponsors").send({}).expect(401);
	});

	it("rejects login with a wrong password (401)", async () => {
		await loginAsAdmin(); // creates the admin
		await request(app).post("/auth/login").send({ email: "test-admin@vsk.hr", password: "nope" }).expect(401);
	});

	it("logs in, accesses /admin, then logout revokes the session", async () => {
		const cookie = await loginAsAdmin();

		// /auth/me works with the cookie
		await request(app).get("/auth/me").set("Cookie", cookie).expect(200);

		// logout
		await request(app).post("/auth/logout").set("Cookie", cookie).expect(200);

		// same cookie now rejected (server-side revocation)
		await request(app).get("/auth/me").set("Cookie", cookie).expect(401);
		expect(await prisma.session.count()).toBe(0);
	});
});
