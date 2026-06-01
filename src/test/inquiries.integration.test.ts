import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app, prisma, resetDb, loginAsAdmin } from "./helpers.ts";

beforeEach(resetDb);

// Per-entity: public inquiry intake (spam/consent) + admin inbox + reply.
describe("inquiries (integration)", () => {
	it("accepts a valid membership submission (201) and stores it as 'new'", async () => {
		await request(app)
			.post("/inquiries/membership")
			.send({ fullName: "Marko Marić", email: "marko@x.hr", consentAccepted: true, message: "Želim se učlaniti" })
			.expect(201);
		const rows = await prisma.membershipSubmission.findMany();
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe("new");
		expect(rows[0]?.responded).toBe(false);
	});

	it("rejects a honeypot-filled submission (400 bot) — nothing stored", async () => {
		await request(app)
			.post("/inquiries/membership")
			.send({ fullName: "Bot", email: "bot@x.hr", consentAccepted: true, _hp: "i am a bot" })
			.expect(400);
		expect(await prisma.membershipSubmission.count()).toBe(0);
	});

	it("rejects a submission without GDPR consent (400)", async () => {
		await request(app)
			.post("/inquiries/membership")
			.send({ fullName: "No Consent", email: "nc@x.hr" })
			.expect(400);
		expect(await prisma.membershipSubmission.count()).toBe(0);
	});

	it("admin inbox is protected, lists submissions, and reply marks responded", async () => {
		await request(app).get("/admin/inquiries/membership").expect(401); // no auth

		await request(app)
			.post("/inquiries/membership")
			.send({ fullName: "Ana", email: "ana@x.hr", consentAccepted: true })
			.expect(201);

		const cookie = await loginAsAdmin();
		const list = await request(app).get("/admin/inquiries/membership").set("Cookie", cookie).expect(200);
		expect(list.body).toHaveLength(1);
		const id = list.body[0].id as string;

		// reply (Brevo logs to console in tests; marks responded + read)
		await request(app).post(`/admin/inquiries/membership/${id}/reply`).set("Cookie", cookie).send({ subject: "Pozdrav", text: "Hvala!" }).expect(200);
		const after = await prisma.membershipSubmission.findUnique({ where: { id } });
		expect(after?.responded).toBe(true);
		expect(after?.status).toBe("read");
	});
});
