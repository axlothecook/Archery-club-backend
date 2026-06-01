import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers.ts";

// Asserts helmet is applying the security headers we configured in app.ts.
// (helmet is wired; this guards against it being removed/misconfigured.)
describe("security headers (helmet)", () => {
	it("sets the expected hardening headers on responses", async () => {
		const res = await request(app).get("/health");

		// Core helmet defaults that should be present on a JSON API.
		expect(res.headers["x-content-type-options"]).toBe("nosniff");
		expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
		expect(res.headers["x-dns-prefetch-control"]).toBe("off");

		// HSTS: configured to 1 year + includeSubDomains.
		expect(res.headers["strict-transport-security"]).toContain("max-age=31536000");
		expect(res.headers["strict-transport-security"]).toContain("includeSubDomains");

		// CSP is intentionally OFF (this is a JSON API; page CSP is the SvelteKit
		// front-end's job via kit.csp). So no CSP header should be emitted here.
		expect(res.headers["content-security-policy"]).toBeUndefined();

		// helmet hides the framework fingerprint.
		expect(res.headers["x-powered-by"]).toBeUndefined();
	});
});
