// Runs BEFORE any test module (and before db.ts is imported). Points Prisma at
// the test database by overriding DATABASE_URL with TEST_DATABASE_URL, so the
// shared `prisma` client (constructed in db.ts at import time) connects to
// archery_club_test — never the dev DB.
import "dotenv/config";

const testUrl = process.env["TEST_DATABASE_URL"];
if (!testUrl) {
	throw new Error("TEST_DATABASE_URL is not set — run `npm run test:db:setup` and check .env");
}
process.env["DATABASE_URL"] = testUrl;

// Safety belt: never let integration tests run against a non-test database.
if (!process.env["DATABASE_URL"].includes("archery_club_test")) {
	throw new Error("Refusing to run integration tests: DATABASE_URL is not the test DB");
}
