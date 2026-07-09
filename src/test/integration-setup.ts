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

// Action-token secret for tests that sign invite/reset tokens (action-token.ts throws
// if unset). Provide a deterministic TEST-ONLY default when the environment hasn't set
// one — locally it comes from .env, but CI's test job doesn't inject it. Never used for
// real tokens: production sets AUTH_TOKEN_SECRET from a proper secret.
if (!process.env["AUTH_TOKEN_SECRET"]) {
	process.env["AUTH_TOKEN_SECRET"] = "test-only-action-token-secret-not-for-production";
}
