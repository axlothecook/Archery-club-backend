import { randomBytes } from "node:crypto";
import { prisma } from "../db.ts";
import type { Admin } from "../generated/prisma/client.ts";

// Server-side sessions. The cookie carries only this random id; all session
// state lives in the Session table. JWT is NOT used for sessions (revocation +
// XSS reasons) — see src/auth/jwt for the action-token use.

// Timeouts default to the production values (30 min idle / 8 h absolute) but can be
// overridden via env (minutes) for local dev, where a long editing session shouldn't
// keep dropping — set SESSION_IDLE_MINUTES / SESSION_ABSOLUTE_MINUTES in .env.
const idleMinutes = Number(process.env.SESSION_IDLE_MINUTES) || 30;
const absoluteMinutes = Number(process.env.SESSION_ABSOLUTE_MINUTES) || 8 * 60;
export const IDLE_TIMEOUT_MS = idleMinutes * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = absoluteMinutes * 60 * 1000;

// 256-bit URL-safe random id (well above OWASP's 64-bit minimum).
function newSessionId(): string {
	return randomBytes(32).toString("base64url");
}

// Create a fresh session for an admin and return its id (the cookie value).
export async function createSession(adminId: string): Promise<string> {
	const id = newSessionId();
	await prisma.session.create({
		data: { id, adminId, expiresAt: new Date(Date.now() + ABSOLUTE_TIMEOUT_MS) },
	});
	return id;
}

// Validate a session id. Returns the owning Admin if the session is live, else
// null. Enforces absolute + idle timeouts (deleting the row when expired) and
// slides lastSeenAt forward on success.
export async function validateSession(id: string): Promise<Admin | null> {
	const session = await prisma.session.findUnique({ where: { id }, include: { admin: true } });
	if (!session) return null;

	const now = Date.now();
	const expired =
		now > session.expiresAt.getTime() || // absolute
		now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS; // idle
	if (expired) {
		await prisma.session.delete({ where: { id } }).catch(() => {});
		return null;
	}

	await prisma.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
	return session.admin;
}

// Delete a session (logout / revoke). Safe if it's already gone.
export async function destroySession(id: string): Promise<void> {
	await prisma.session.delete({ where: { id } }).catch(() => {});
}
