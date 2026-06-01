import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb, loginAsAdmin } from "./helpers.ts";
import { hashPassword } from "../auth/password.ts";

beforeEach(resetDb);

// TIER 3 — pillar-3 runtime fail-safe: a bad record is skipped, not a 500.
describe("runtime fail-safe (integration)", () => {
	it("skips an unmappable record and still serves the good ones (no 500)", async () => {
		// good sponsor (has hr translation)
		await prisma.sponsor.create({
			data: { name: "GoodCo", logoUrl: "u", logoAlt: "a", website: null, sourceLocale: "hr", translations: { create: [{ locale: "hr", description: "ok" }] } },
		});
		// broken sponsor: no translations → mapper throws
		await prisma.sponsor.create({
			data: { name: "BrokenCo", logoUrl: "u", logoAlt: "a", website: null, sourceLocale: "hr" },
		});

		const res = await request(app).get("/sponsors").expect(200); // NOT 500
		expect(res.body).toHaveLength(1);
		expect(res.body[0].name).toBe("GoodCo");
	});

	// Regression guard: /hero is a public LIST route and must go through the
	// safe-map path (it was missing the guard once). HeroImage has no realistic
	// unmappable state, so we assert it serves a list cleanly; the skip behavior
	// itself is proven by the Sponsor case above (same safeMapList helper).
	it("/hero serves a list (200) and reflects rows", async () => {
		await prisma.heroImage.create({ data: { imageUrl: "https://sb.co/h.png", imageAlt: "hero", order: 1 } });
		const res = await request(app).get("/hero").expect(200);
		expect(res.body).toHaveLength(1);
		expect(res.body[0].image).toEqual({ url: "https://sb.co/h.png", alt: "hero" });
	});

	it("exposes skipped records to a developer, but 403s a plain admin", async () => {
		// trigger a skip first
		await prisma.sponsor.create({ data: { name: "BrokenCo", logoUrl: "u", logoAlt: "a", website: null, sourceLocale: "hr" } });
		await request(app).get("/sponsors").expect(200);

		// developer sees data-health
		const devCookie = await loginAsAdmin("dev@vsk.hr", "dev-password-123"); // loginAsAdmin creates role 'developer'
		const health = await request(app).get("/admin/dev/data-health").set("Cookie", devCookie).expect(200);
		expect(health.body.skippedCount).toBeGreaterThanOrEqual(1);

		// a plain (non-developer) admin is forbidden
		await prisma.admin.create({ data: { workName: "Plain", email: "plain@vsk.hr", role: "admin", passwordHash: await hashPassword("plain-password-123") } });
		const login = await request(app).post("/auth/login").send({ email: "plain@vsk.hr", password: "plain-password-123" });
		const plainCookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
		await request(app).get("/admin/dev/data-health").set("Cookie", plainCookie).expect(403);
	});
});
