import type { Request, Response } from "express";

// The session cookie. The `__Host-` prefix is enforced by browsers to require
// Secure + Path=/ + no Domain — the OWASP-recommended hardening. We omit
// Max-Age/Expires (non-persistent) so the browser drops it on close; the server
// is the source of truth for expiry (the Session row).
export const SESSION_COOKIE = "__Host-session";

export function setSessionCookie(res: Response, sessionId: string): void {
	res.cookie(SESSION_COOKIE, sessionId, {
		httpOnly: true,
		secure: true,
		sameSite: "strict",
		path: "/",
	});
}

export function clearSessionCookie(res: Response): void {
	res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
}

// Read the session id from the Cookie header without a parser dependency.
export function readSessionCookie(req: Request): string | null {
	const header = req.headers.cookie;
	if (!header) return null;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === SESSION_COOKIE) {
			return decodeURIComponent(part.slice(eq + 1).trim());
		}
	}
	return null;
}
