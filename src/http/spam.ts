import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { HttpError } from "./errors.ts";

// Layered public-form spam protection (2026 best practice): honeypot + rate
// limit + Cloudflare Turnstile. The first two work immediately; Turnstile is
// enforced once TURNSTILE_SECRET is set (skips with a log otherwise — same
// pattern as Brevo/FB; Turnstile also offers dummy test keys).

// 1) Rate limit: cap public submissions per IP. In-memory (fine for a single
// Pi instance). 5 submissions / 10 min.
export const inquiryRateLimit = rateLimit({
	windowMs: 10 * 60 * 1000,
	limit: 5,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: { message: "Too many submissions, please try again later." } },
});

const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// 2+3) Honeypot + Turnstile, as one middleware on public form POSTs.
// Body must include: `_hp` (honeypot — must be empty) and `turnstileToken`.
export async function spamGuard(req: Request, _res: Response, next: NextFunction): Promise<void> {
	try {
		const body = (req.body ?? {}) as Record<string, unknown>;

		// Honeypot: a hidden field humans leave empty; if filled → bot. Reject
		// quietly with a generic 400 (don't reveal the honeypot).
		if (typeof body["_hp"] === "string" && body["_hp"].trim() !== "") {
			throw new HttpError(400, "Submission rejected");
		}

		// Turnstile: verify the token server-side. Skipped (logged) until the
		// secret is configured.
		const secret = process.env["TURNSTILE_SECRET"];
		if (!secret) {
			console.log("[spam] TURNSTILE_SECRET unset — skipping Turnstile verification");
		} else {
			const token = typeof body["turnstileToken"] === "string" ? body["turnstileToken"] : "";
			const form = new URLSearchParams({ secret, response: token });
			const ip = req.headers["cf-connecting-ip"] ?? req.socket.remoteAddress;
			if (typeof ip === "string") form.append("remoteip", ip);

			const resp = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
			const data = (await resp.json()) as { success?: boolean };
			if (!data.success) throw new HttpError(400, "Captcha verification failed");
		}

		// Strip control fields so they don't reach the entity create.
		delete body["_hp"];
		delete body["turnstileToken"];
		next();
	} catch (err) {
		next(err);
	}
}
