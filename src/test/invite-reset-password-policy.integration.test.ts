import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb } from "./helpers.ts";
import { signActionToken } from "../auth/action-token.ts";
import { verifyPassword } from "../auth/password.ts";

beforeEach(resetDb);

// The accept-invite and reset-password flows must enforce the SAME password policy as
// change-password (length 12–20, printable ASCII, no spaces) so the client-side rule in
// the dashboard (src/lib/password-rules.ts) and the server agree. Previously these two
// only checked the minimum; these tests lock in the max + charset alignment.

const VALID = "new-pass-123456"; // 15 chars, ASCII, no spaces — within policy

// A pending (invited, no password) admin + a valid invite token for them.
async function pendingAdminWithInvite() {
	const admin = await prisma.admin.create({
		data: { workName: "Invitee", email: "invitee@vsk.hr", role: "admin" },
	});
	const token = await signActionToken(admin.id, "invite", "72h");
	return { admin, token };
}

// An activated admin + a valid reset token for them.
async function activeAdminWithReset() {
	const { hashPassword } = await import("../auth/password.ts");
	const admin = await prisma.admin.create({
		data: {
			workName: "Resetter",
			email: "resetter@vsk.hr",
			role: "admin",
			passwordHash: await hashPassword("old-password-123"),
		},
	});
	const token = await signActionToken(admin.id, "reset", "30m");
	return { admin, token };
}

describe("POST /auth/accept-invite — password policy (integration)", () => {
	it("rejects a too-short password (400) and leaves the account pending", async () => {
		const { admin, token } = await pendingAdminWithInvite();
		await request(app).post("/auth/accept-invite").send({ token, password: "short" }).expect(400);
		const after = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
		expect(after.passwordHash).toBeNull();
	});

	it("rejects a too-long password over 20 chars (400)", async () => {
		const { token } = await pendingAdminWithInvite();
		await request(app).post("/auth/accept-invite").send({ token, password: "a".repeat(21) }).expect(400);
	});

	it("rejects a password with a space (400)", async () => {
		const { token } = await pendingAdminWithInvite();
		await request(app).post("/auth/accept-invite").send({ token, password: "has a space12" }).expect(400);
	});

	it("rejects a password with a non-ASCII char (400)", async () => {
		const { token } = await pendingAdminWithInvite();
		await request(app).post("/auth/accept-invite").send({ token, password: "lozinkać12345" }).expect(400);
	});

	it("accepts a valid password (200) and activates the account", async () => {
		const { admin, token } = await pendingAdminWithInvite();
		await request(app).post("/auth/accept-invite").send({ token, password: VALID }).expect(200);
		const after = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
		expect(after.passwordHash).not.toBeNull();
		expect(await verifyPassword(after.passwordHash!, VALID)).toBe(true);
	});
});

describe("POST /auth/reset-password — password policy (integration)", () => {
	it("rejects a too-short password (400) and keeps the old password", async () => {
		const { admin, token } = await activeAdminWithReset();
		await request(app).post("/auth/reset-password").send({ token, password: "short" }).expect(400);
		const after = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
		expect(await verifyPassword(after.passwordHash!, "old-password-123")).toBe(true);
	});

	it("rejects a too-long password over 20 chars (400)", async () => {
		const { token } = await activeAdminWithReset();
		await request(app).post("/auth/reset-password").send({ token, password: "a".repeat(21) }).expect(400);
	});

	it("rejects a password with a space (400)", async () => {
		const { token } = await activeAdminWithReset();
		await request(app).post("/auth/reset-password").send({ token, password: "has a space12" }).expect(400);
	});

	it("rejects a password with a non-ASCII char (400)", async () => {
		const { token } = await activeAdminWithReset();
		await request(app).post("/auth/reset-password").send({ token, password: "lozinkać12345" }).expect(400);
	});

	it("accepts a valid password (200) and sets the new one", async () => {
		const { admin, token } = await activeAdminWithReset();
		await request(app).post("/auth/reset-password").send({ token, password: VALID }).expect(200);
		const after = await prisma.admin.findUniqueOrThrow({ where: { id: admin.id } });
		expect(await verifyPassword(after.passwordHash!, VALID)).toBe(true);
		expect(await verifyPassword(after.passwordHash!, "old-password-123")).toBe(false);
	});
});
