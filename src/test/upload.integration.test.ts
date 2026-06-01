import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Mock the R2 storage layer so the route is tested WITHOUT touching Cloudflare.
// (Real R2 connectivity is covered by a separate manual smoke test, since the
// credentials/bucket already exist — see CLOUDFLARE_NOTES.md.)
vi.mock("../storage/r2.ts", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../storage/r2.ts")>();
	return {
		...actual, // keep the real isAllowedImageType/isAllowedVideoType type checks
		isR2Configured: () => true,
		uploadFile: vi.fn(async (entityType: string, contentType: string) => ({
			url: `https://images.axlothecook.com/archery/${entityType}/deadbeef.${contentType.split("/")[1]}`,
			key: `archery/${entityType}/deadbeef`,
		})),
	};
});

// Mock magic-byte detection so we control the "real" type independently of the
// claimed mimetype (that's the whole point — proving we trust bytes, not headers).
const detected = vi.hoisted(() => ({ mime: "image/png" as string | null }));
vi.mock("file-type", () => ({
	fileTypeFromBuffer: vi.fn(async () => (detected.mime ? { mime: detected.mime, ext: detected.mime.split("/")[1] } : undefined)),
}));

import { app, loginAsAdmin, resetDb } from "./helpers.ts";

let cookie: string;
beforeEach(async () => {
	await resetDb();
	cookie = await loginAsAdmin();
	detected.mime = "image/png"; // default: a real PNG
});
afterEach(() => vi.clearAllMocks());

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);

describe("POST /admin/upload (integration)", () => {
	it("requires auth", async () => {
		await request(app).post("/admin/upload").field("entityType", "archer").attach("file", PNG, "x.png").expect(401);
	});

	it("uploads a valid image and returns its R2 url", async () => {
		const res = await request(app)
			.post("/admin/upload")
			.set("Cookie", cookie)
			.field("entityType", "archer")
			.attach("file", PNG, "photo.png")
			.expect(201);
		expect(res.body.url).toBe("https://images.axlothecook.com/archery/archer/deadbeef.png");
	});

	it("rejects when no file is attached", async () => {
		await request(app).post("/admin/upload").set("Cookie", cookie).field("entityType", "archer").expect(400);
	});

	it("rejects an unknown entityType (Zod)", async () => {
		await request(app).post("/admin/upload").set("Cookie", cookie).field("entityType", "nope").attach("file", PNG, "x.png").expect(400);
	});

	it("rejects a spoofed type: claims image but magic bytes say it's something else", async () => {
		detected.mime = "application/x-msdownload"; // an .exe renamed to .png
		const res = await request(app)
			.post("/admin/upload")
			.set("Cookie", cookie)
			.field("entityType", "archer")
			.attach("file", PNG, "evil.png")
			.expect(400);
		expect(res.body.error.message).toMatch(/not a supported image or video/i);
	});

	it("allows video ONLY for entityType=article", async () => {
		detected.mime = "video/mp4";
		// article → allowed
		await request(app)
			.post("/admin/upload")
			.set("Cookie", cookie)
			.field("entityType", "article")
			.attach("file", Buffer.from([0, 0, 0, 0]), "clip.mp4")
			.expect(201);
		// archer → rejected
		const res = await request(app)
			.post("/admin/upload")
			.set("Cookie", cookie)
			.field("entityType", "archer")
			.attach("file", Buffer.from([0, 0, 0, 0]), "clip.mp4")
			.expect(400);
		expect(res.body.error.message).toMatch(/only allowed for posts/i);
	});
});
