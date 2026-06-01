import { defineConfig } from "vitest/config";

// Default `npm test` = fast UNIT tests only (mappers/utils, no DB).
// Integration tests (*.integration.test.ts) run via `npm run test:integration`
// with their own config + the test database.
export default defineConfig({
	test: {
		exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
	},
});
