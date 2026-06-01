import request from "supertest";
import { app } from "../app.ts";
import { prisma } from "../db.ts";
import { hashPassword } from "../auth/password.ts";

// Wipe all data between tests (order respects FK dependencies; M:N join tables
// clear automatically when their parents go). Call in beforeEach.
export async function resetDb(): Promise<void> {
	// Children / linkers first, then parents.
	await prisma.articleImage.deleteMany();
	await prisma.articleTranslation.deleteMany();
	await prisma.article.deleteMany();
	await prisma.achievementTranslation.deleteMany();
	await prisma.achievement.deleteMany();
	await prisma.clubEventTranslation.deleteMany();
	await prisma.clubEvent.deleteMany();
	await prisma.eventLevelTranslation.deleteMany();
	await prisma.eventLevel.deleteMany();
	await prisma.sponsorTranslation.deleteMany();
	await prisma.sponsor.deleteMany();
	await prisma.archerCareerStat.deleteMany();
	await prisma.archerPerformance.deleteMany();
	await prisma.archerTranslation.deleteMany();
	await prisma.archer.deleteMany();
	await prisma.clubHistoryPhoto.deleteMany();
	await prisma.clubInfoTranslation.deleteMany();
	await prisma.clubInfo.deleteMany();
	await prisma.heroImage.deleteMany();
	await prisma.membershipSubmission.deleteMany();
	await prisma.sponsorInquiry.deleteMany();
	await prisma.donationInquiry.deleteMany();
	await prisma.session.deleteMany();
	await prisma.admin.deleteMany();
}

// Create an admin and return a logged-in session cookie for protected requests.
export async function loginAsAdmin(
	email = "test-admin@vsk.hr",
	password = "test-password-123",
): Promise<string> {
	await prisma.admin.create({
		data: { workName: "Tester", email, role: "developer", passwordHash: await hashPassword(password) },
	});
	const res = await request(app).post("/auth/login").send({ email, password });
	const setCookie = res.headers["set-cookie"];
	const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
	if (!cookie) throw new Error("login did not set a session cookie");
	return cookie.split(";")[0]!; // "__Host-session=..."
}

export { app, prisma };
