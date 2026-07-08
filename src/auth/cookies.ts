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
// ⚠️ DEV COOKIE RELAXATION — TEMPORARY, REVERT BEFORE DEPLOY. ⚠️
// The `__Host-` prefix REQUIRES Secure, and browsers only store Secure cookies over
// HTTPS or localhost — NOT over a plain-http LAN IP. That blocks logging in from a phone
// at http://192.168.50.112:5174 during responsive testing. So in DEVELOPMENT only we drop
// the `__Host-` prefix and Secure so the cookie stores over http on the LAN IP.
//
// PRODUCTION is unchanged: hardened `__Host-session`, Secure, SameSite=Lax, Path=/.
// The mode is read PER-CALL (not memoised at import) so tests can pin NODE_ENV=production
// and still assert the hardened prod cookie.
//
// TODO(revert-after-resizing): once phone responsive testing is done, delete this whole
// dev branch — go back to a single hardened `__Host-session` cookie (name + Secure fixed).
// See the matching note [[archery-dashboard-dev-cookie-relaxation]] in memory.
const PROD_COOKIE = "__Host-session";
const DEV_COOKIE = "session"; // no `__Host-` prefix (prefix mandates Secure)

function isProd(): boolean {
	return process.env.NODE_ENV === "production";
}
function cookieName(): string {
	return isProd() ? PROD_COOKIE : DEV_COOKIE;
}

// Back-compat export: the CURRENT-mode cookie name (used by callers/tests that reference
// the constant). Evaluated at import; per-request logic uses cookieName() instead.
export const SESSION_COOKIE = cookieName();

export function setSessionCookie(res: Response, sessionId: string): void {
	res.cookie(cookieName(), sessionId, {
		httpOnly: true,
		secure: isProd(), // prod: Secure (required by __Host-); dev: off so an http LAN IP can store it
		sameSite: "lax",
		path: "/",
	});
}

export function clearSessionCookie(res: Response): void {
	res.clearCookie(cookieName(), { httpOnly: true, secure: isProd(), sameSite: "lax", path: "/" });
}

// Read the session id from the Cookie header without a parser dependency. Accepts EITHER
// cookie name so a session set in one mode is still read if the mode differs.
export function readSessionCookie(req: Request): string | null {
	const header = req.headers.cookie;
	if (!header) return null;
	for (const part of header.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const key = part.slice(0, eq).trim();
		if (key === PROD_COOKIE || key === DEV_COOKIE) {
			return decodeURIComponent(part.slice(eq + 1).trim());
		}
	}
	return null;
}
