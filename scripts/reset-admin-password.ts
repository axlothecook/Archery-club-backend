// One-off: reset an existing admin's password (no email/dashboard needed). Reads
// the new password from RESET_ADMIN_PASSWORD so it never appears on the command
// line / process list. Run:
//   RESET_ADMIN_EMAIL=you@x RESET_ADMIN_PASSWORD=... npx tsx scripts/reset-admin-password.ts
// (or set both in .env, then run the script). Remove the password from .env after.
import "dotenv/config";
import { prisma } from "../src/db.ts";
import { hashPassword } from "../src/auth/password.ts";

const email = process.env["RESET_ADMIN_EMAIL"];
const password = process.env["RESET_ADMIN_PASSWORD"];

if (!email || !password) {
	console.error("Set RESET_ADMIN_EMAIL and RESET_ADMIN_PASSWORD.");
	process.exit(1);
}
if (password.length < 12) {
	console.error("RESET_ADMIN_PASSWORD must be at least 12 characters.");
	process.exit(1);
}

const admin = await prisma.admin.findUnique({ where: { email } });
if (!admin) {
	console.error(`No admin with email ${email}.`);
	process.exit(1);
}

await prisma.admin.update({
	where: { email },
	data: { passwordHash: await hashPassword(password) }
});
console.log(`Password reset for ${email}.`);
await prisma.$disconnect();
