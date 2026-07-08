import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb, loginAsAdmin } from "./helpers.ts";
import { verifyPassword } from "../auth/password.ts";

beforeEach(resetDb);

// TIER 1 — security: the signed-in admin changes their own password.
describe("POST /auth/change-password (integration)", () => {
	const NEW = "new-pass-123456"; // 15 chars — within the 12–20 window

	it("rejects when unauthenticated (401)", async () => {
		await request(app)
			.post("/auth/change-password")
			.send({ currentPassword: "test-password-123", newPassword: NEW })
			.expect(401);
	});

	it("rejects a wrong current password (401) and leaves the hash unchanged", async () => {
		const cookie = await loginAsAdmin();
		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "wrong-current-xx", newPassword: NEW })
			.expect(401);

		// Old password still works, new one does not.
		const admin = await prisma.admin.findUniqueOrThrow({ where: { email: "test-admin@vsk.hr" } });
		expect(await verifyPassword(admin.passwordHash!, "test-password-123")).toBe(true);
		expect(await verifyPassword(admin.passwordHash!, NEW)).toBe(false);
	});

	it("rejects a too-short new password (400)", async () => {
		const cookie = await loginAsAdmin();
		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "test-password-123", newPassword: "short" })
			.expect(400);
	});

	it("rejects a too-long new password over 20 chars (400)", async () => {
		const cookie = await loginAsAdmin();
		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "test-password-123", newPassword: "a".repeat(21) })
			.expect(400);
	});

	it("rejects missing fields (400)", async () => {
		const cookie = await loginAsAdmin();
		await request(app).post("/auth/change-password").set("Cookie", cookie).send({}).expect(400);
	});

	it("changes the password with a correct current one; new works, old fails", async () => {
		const cookie = await loginAsAdmin();
		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "test-password-123", newPassword: NEW })
			.expect(200);

		const admin = await prisma.admin.findUniqueOrThrow({ where: { email: "test-admin@vsk.hr" } });
		expect(await verifyPassword(admin.passwordHash!, NEW)).toBe(true);
		expect(await verifyPassword(admin.passwordHash!, "test-password-123")).toBe(false);
	});

	it("keeps the caller's session but revokes the admin's OTHER sessions", async () => {
		// First session (the caller).
		const cookie = await loginAsAdmin();
		// A second, independent login for the same admin → a second session row.
		const second = await request(app)
			.post("/auth/login")
			.send({ email: "test-admin@vsk.hr", password: "test-password-123" });
		const secondSetCookie = second.headers["set-cookie"];
		const secondCookie = (Array.isArray(secondSetCookie) ? secondSetCookie[0] : secondSetCookie)!.split(";")[0]!;
		expect(await prisma.session.count()).toBe(2);

		await request(app)
			.post("/auth/change-password")
			.set("Cookie", cookie)
			.send({ currentPassword: "test-password-123", newPassword: NEW })
			.expect(200);

		// Only the caller's session survives.
		expect(await prisma.session.count()).toBe(1);
		await request(app).get("/auth/me").set("Cookie", cookie).expect(200); // caller still in
		await request(app).get("/auth/me").set("Cookie", secondCookie).expect(401); // other revoked
	});
});
