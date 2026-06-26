import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb, loginAsAdmin } from "./helpers.ts";
import { hashPassword } from "../auth/password.ts";

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

	// The session cookie's attributes gate strict-browser login on the same-origin
	// dashboard. SameSite MUST be Lax (not Strict) so the /admin SSR guard receives
	// the cookie on top-level navigations into the site (emailed invite/reset link,
	// external/bookmark entry) — Strict would withhold it and bounce a logged-in
	// admin to /prijava. The __Host- prefix additionally requires Secure + Path=/
	// + no Domain. This is the regression net for that whole login path.
	it("login sets a hardened session cookie: HttpOnly, Secure, SameSite=Lax, Path=/, __Host- prefix", async () => {
		await prisma.admin.create({
			data: {
				workName: "Tester",
				email: "test-admin@vsk.hr",
				role: "developer",
				passwordHash: await hashPassword("test-password-123"),
			},
		});

		const res = await request(app)
			.post("/auth/login")
			.send({ email: "test-admin@vsk.hr", password: "test-password-123" })
			.expect(200);

		const setCookie = res.headers["set-cookie"];
		const header = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) =>
			c?.startsWith("__Host-session="),
		);
		expect(header, "login must Set-Cookie __Host-session").toBeDefined();

		expect(header).toMatch(/HttpOnly/i);
		expect(header).toMatch(/Secure/i);
		expect(header).toMatch(/SameSite=Lax/i);
		expect(header).toMatch(/Path=\//i);
		// __Host- prefix forbids a Domain attribute.
		expect(header).not.toMatch(/Domain=/i);
		// Explicitly assert it is NOT the old Strict value (the bug we fixed).
		expect(header).not.toMatch(/SameSite=Strict/i);
	});
});
