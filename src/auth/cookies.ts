import type { Request, Response } from "express";

// The session cookie. The `__Host-` prefix is enforced by browsers to require
// Secure + Path=/ + no Domain — the OWASP-recommended hardening. We omit
// Max-Age/Expires (non-persistent) so the browser drops it on close; the server
// is the source of truth for expiry (the Session row).
//
// SameSite=Lax (not Strict): the admin dashboard is same-origin with the API, so
// the `/admin` SSR guard (`+layout.server.ts` → /auth/me) must receive the cookie
// on top-level navigations INTO the site — e.g. following an emailed invite/reset
// link or any external/bookmark link straight to /admin. Strict withholds the
// cookie on those cross-site-initiated navigations, which would bounce a
// logged-in admin to /prijava. Lax sends it on top-level GET navigations but NOT
// on cross-site sub-requests, so CSRF protection holds: the admin mutations are
// POST/PUT/DELETE (which Lax does not send cross-site) against a same-origin API.
export const SESSION_COOKIE = "__Host-session";

export function setSessionCookie(res: Response, sessionId: string): void {
	res.cookie(SESSION_COOKIE, sessionId, {
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/",
	});
}

export function clearSessionCookie(res: Response): void {
	res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
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
