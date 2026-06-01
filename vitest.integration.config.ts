import { defineConfig } from "vitest/config";

// Integration tests hit real HTTP routes against the SEPARATE test database.
// setup/integration-setup.ts points Prisma at TEST_DATABASE_URL before the app
// (and db.ts) load. Kept separate from the unit-test run (`npm test`).
export default defineConfig({
	test: {
		include: ["src/**/*.integration.test.ts"],
		setupFiles: ["./src/test/integration-setup.ts"],
		// Integration tests share one DB → run files sequentially to avoid
		// cross-file data races (each test still resets via resetDb()).
		fileParallelism: false,
		testTimeout: 20000,
	},
});
