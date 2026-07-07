import { Router } from "express";
import { prisma } from "../db.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { createSession, destroySession } from "../auth/session.ts";
import { setSessionCookie, clearSessionCookie, readSessionCookie } from "../auth/cookies.ts";
import { signActionToken, verifyActionToken } from "../auth/action-token.ts";
import { sendEmail } from "../email/index.ts";
import { requireAuth } from "../http/require-auth.ts";
import { HttpError } from "../http/errors.ts";

export const authRouter = Router();

// Base URL of the dashboard where invite/reset links are opened.
function dashboardUrl(): string {
	return process.env["DASHBOARD_URL"] ?? "http://localhost:5173";
}

// Minimum password length (basic policy; OWASP favors length over composition).
const MIN_PASSWORD = 12;

// POST /auth/login { email, password } — verify credentials, start a session.
// Generic 401 for any failure (no email/password distinction → no enumeration).
authRouter.post("/login", async (req, res, next) => {
	try {
		const { email, password } = req.body ?? {};
		if (typeof email !== "string" || typeof password !== "string") {
			throw new HttpError(400, "Email and password are required");
		}

		const admin = await prisma.admin.findUnique({ where: { email } });
		const ok = admin?.passwordHash
			? await verifyPassword(admin.passwordHash, password)
			: false;
		if (!admin || !ok) throw new HttpError(401, "Invalid credentials");

		// Fresh session id on login (OWASP: regenerate on privilege change).
		const sessionId = await createSession(admin.id);
		setSessionCookie(res, sessionId);
		res.json({ id: admin.id, workName: admin.workName, role: admin.role });
	} catch (err) {
		next(err);
	}
});

// POST /auth/logout — destroy the current session + clear the cookie.
authRouter.post("/logout", async (req, res, next) => {
	try {
		const sessionId = readSessionCookie(req);
		if (sessionId) await destroySession(sessionId);
		clearSessionCookie(res);
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// GET /auth/me — who am I (protected). Confirms the session works.
authRouter.get("/me", requireAuth, (req, res) => {
	const a = req.admin!;
	res.json({ id: a.id, workName: a.workName, email: a.email, role: a.role });
});

// POST /auth/invite { email, workName, role } — protected. Create a pending
// admin (no password) and email them a 72h invite link to set their password.
authRouter.post("/invite", requireAuth, async (req, res, next) => {
	try {
		const { email, workName, role } = req.body ?? {};
		if (typeof email !== "string" || typeof workName !== "string" || (role !== "admin" && role !== "developer")) {
			throw new HttpError(400, "email, workName and role ('admin'|'developer') are required");
		}
		if (await prisma.admin.findUnique({ where: { email } })) {
			throw new HttpError(409, "An admin with that email already exists");
		}

		const admin = await prisma.admin.create({ data: { email, workName, role, passwordHash: null } });
		const token = await signActionToken(admin.id, "invite", "72h");
		await sendEmail({
			to: email,
			subject: "You've been invited to the VSK Archery dashboard",
			text: `Hi ${workName},\n\nSet your password to activate your account (link valid 72h):\n${dashboardUrl()}/accept-invite?token=${token}\n`,
		});
		res.status(201).json({ id: admin.id, email: admin.email });
	} catch (err) {
		next(err);
	}
});

// POST /auth/accept-invite { token, password } — set the password via the invite
// token. Single-use: rejected once the account already has a password.
authRouter.post("/accept-invite", async (req, res, next) => {
	try {
		const { token, password } = req.body ?? {};
		if (typeof token !== "string" || typeof password !== "string") {
			throw new HttpError(400, "token and password are required");
		}
		if (password.length < MIN_PASSWORD) {
			throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
		}
		const adminId = await verifyActionToken(token, "invite");
		if (!adminId) throw new HttpError(400, "Invalid or expired invite");

		const admin = await prisma.admin.findUnique({ where: { id: adminId } });
		if (!admin) throw new HttpError(400, "Invalid or expired invite");
		if (admin.passwordHash) throw new HttpError(409, "Invite already used");

		await prisma.admin.update({ where: { id: adminId }, data: { passwordHash: await hashPassword(password) } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// POST /auth/forgot-password { email } — email a 30-min reset link if the admin
// exists. Always returns ok (no account enumeration).
authRouter.post("/forgot-password", async (req, res, next) => {
	try {
		const { email } = req.body ?? {};
		if (typeof email !== "string") throw new HttpError(400, "email is required");

		const admin = await prisma.admin.findUnique({ where: { email } });
		if (admin) {
			const token = await signActionToken(admin.id, "reset", "30m");
			await sendEmail({
				to: email,
				subject: "VSK Archery dashboard — password reset",
				text: `A password reset was requested (link valid 30 min):\n${dashboardUrl()}/reset-password?token=${token}\n\nIf you didn't request this, ignore this email.\n`,
			});
		}
		res.json({ ok: true }); // same response whether or not the email exists
	} catch (err) {
		next(err);
	}
});

// POST /auth/reset-password { token, password } — set a new password via a reset
// token. Also revokes all existing sessions for that admin (force re-login).
authRouter.post("/reset-password", async (req, res, next) => {
	try {
		const { token, password } = req.body ?? {};
		if (typeof token !== "string" || typeof password !== "string") {
			throw new HttpError(400, "token and password are required");
		}
		if (password.length < MIN_PASSWORD) {
			throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
		}
		const adminId = await verifyActionToken(token, "reset");
		if (!adminId || !(await prisma.admin.findUnique({ where: { id: adminId } }))) {
			throw new HttpError(400, "Invalid or expired reset link");
		}

		await prisma.admin.update({ where: { id: adminId }, data: { passwordHash: await hashPassword(password) } });
		await prisma.session.deleteMany({ where: { adminId } }); // log out everywhere
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
