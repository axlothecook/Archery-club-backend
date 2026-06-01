// Create the integration-test database (archery_club_test) if it doesn't exist,
// then apply migrations to it. Idempotent — safe to run repeatedly.
// Run: npm run test:db:setup
import "dotenv/config";
import { Client } from "pg";
import { execSync } from "node:child_process";

const testUrl = process.env["TEST_DATABASE_URL"];
if (!testUrl) {
	console.error("TEST_DATABASE_URL is not set in .env");
	process.exit(1);
}

// Parse the test URL to get the db name. To issue CREATE DATABASE we connect to
// an EXISTING db — use the main DATABASE_URL's db (this install has no default
// 'postgres' database). CREATE DATABASE can be run from any connection.
const parsed = new URL(testUrl);
const testDbName = parsed.pathname.replace(/^\//, "").split("?")[0]!;

const mainUrl = process.env["DATABASE_URL"];
if (!mainUrl) {
	console.error("DATABASE_URL is not set (needed to connect to issue CREATE DATABASE)");
	process.exit(1);
}
const adminUrl = new URL(mainUrl); // connect to the existing main db

const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDbName]);
if (exists.rowCount === 0) {
	// db name can't be parameterized in CREATE DATABASE; it's derived from our own
	// .env (not user input), and quoted.
	await client.query(`CREATE DATABASE "${testDbName}"`);
	console.log(`Created database ${testDbName}`);
} else {
	console.log(`Database ${testDbName} already exists`);
}
await client.end();

// Apply migrations to the test db (point DATABASE_URL at it for this command).
console.log("Applying migrations to the test database...");
execSync("npx prisma migrate deploy", {
	stdio: "inherit",
	env: { ...process.env, DATABASE_URL: testUrl },
});
console.log("Test database ready.");
