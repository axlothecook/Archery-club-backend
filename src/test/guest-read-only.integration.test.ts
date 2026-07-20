import { beforeEach, describe, it } from "vitest";
import request from "supertest";
import { app, resetDb, loginAsAdmin } from "./helpers.ts";

beforeEach(resetDb);

// The public "guest" demo account (login page's browse-as-guest button) may READ
// the whole dashboard API but WRITE nothing. The gate is the guestReadOnly
// middleware on /admin plus the two authenticated /auth writes (invite,
// change-password). 403 must fire BEFORE route validation — an empty body gets
// 403 (not 400) so a guest can't even probe the validators.
describe("guest read-only gate (integration)", () => {
	const asGuest = () => loginAsAdmin("guest@vsk.hr", "guest-password-123", "guest");

	it("guest can READ /admin (200)", async () => {
		const cookie = await asGuest();
		await request(app).get("/admin/articles").set("Cookie", cookie).expect(200);
	});

	it("guest POST to /admin is blocked (403, before validation)", async () => {
		const cookie = await asGuest();
		await request(app).post("/admin/sponsors").set("Cookie", cookie).send({}).expect(403);
	});

	it("guest DELETE to /admin is blocked (403)", async () => {
		const cookie = await asGuest();
		await request(app).delete("/admin/articles/some-id").set("Cookie", cookie).expect(403);
	});

	it("guest cannot invite admins or change the password (403)", async () => {
		const cookie = await asGuest();
		await request(app)
			.post("/auth/invite")
			.set("Cookie", cookie)
			.send({ email: "x@vsk.hr", workName: "X", role: "admin" })
			.expect(403);
		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "guest-password-123", newPassword: "new-password-1234" })
			.expect(403);
	});

	it("guest CAN log out (403 gate must not trap the session)", async () => {
		const cookie = await asGuest();
		await request(app).post("/auth/logout").set("Cookie", cookie).expect(200);
	});

	it("non-guest admin writes still pass the gate (not 403)", async () => {
		const cookie = await loginAsAdmin(); // role 'developer'
		// Empty body → route VALIDATION responds (400), proving the gate let it through.
		await request(app).post("/admin/sponsors").set("Cookie", cookie).send({}).expect(400);
	});
});
