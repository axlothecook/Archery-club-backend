// One-off: create the first super-admin (solves the chicken-and-egg — login needs
// an admin, and /auth/invite needs an existing admin to call it). Run once:
//   FIRST_ADMIN_EMAIL=you@x.hr FIRST_ADMIN_PASSWORD=... FIRST_ADMIN_NAME=You \
//     npx tsx scripts/create-admin.ts
// Safe: refuses if an admin with that email already exists.
import "dotenv/config";
import { prisma } from "../src/db.ts";
import { hashPassword } from "../src/auth/password.ts";

const email = process.env["FIRST_ADMIN_EMAIL"];
const password = process.env["FIRST_ADMIN_PASSWORD"];
const workName = process.env["FIRST_ADMIN_NAME"] ?? "Admin";
// Optional role — 'admin' (club management) or 'developer' (also unlocks the dev
// diagnostics view). Defaults to 'admin' (the common case: a club account).
const role = process.env["FIRST_ADMIN_ROLE"] ?? "admin";

if (!email || !password) {
	console.error("Set FIRST_ADMIN_EMAIL and FIRST_ADMIN_PASSWORD env vars.");
	process.exit(1);
}
if (password.length < 12) {
	console.error("FIRST_ADMIN_PASSWORD must be at least 12 characters.");
	process.exit(1);
}
if (role !== "admin" && role !== "developer") {
	console.error("FIRST_ADMIN_ROLE must be 'admin' or 'developer'.");
	process.exit(1);
}

const existing = await prisma.admin.findUnique({ where: { email } });
if (existing) {
	console.error(`An admin with email ${email} already exists — refusing to overwrite.`);
	process.exit(1);
}

const admin = await prisma.admin.create({
	data: { email, workName, role, passwordHash: await hashPassword(password) },
});
console.log(`Created super-admin: ${admin.email} (${admin.workName}, role=${admin.role})`);
await prisma.$disconnect();
