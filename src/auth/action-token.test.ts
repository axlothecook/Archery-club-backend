import { beforeAll, describe, expect, it } from "vitest";
import { signActionToken, verifyActionToken } from "./action-token.ts";

beforeAll(() => {
	process.env["AUTH_TOKEN_SECRET"] = "test-secret-at-least-32-bytes-long-xx";
});

describe("action tokens", () => {
	it("verifies a token with the matching purpose and returns the adminId", async () => {
		const token = await signActionToken("admin-1", "invite", "24h");
		expect(await verifyActionToken(token, "invite")).toBe("admin-1");
	});

	it("rejects a token used with the wrong purpose", async () => {
		const token = await signActionToken("admin-1", "invite", "24h");
		expect(await verifyActionToken(token, "reset")).toBeNull();
	});

	it("rejects an expired token", async () => {
		const token = await signActionToken("admin-1", "reset", "0s"); // already expired
		// tiny wait so exp is strictly in the past
		await new Promise((r) => setTimeout(r, 1100));
		expect(await verifyActionToken(token, "reset")).toBeNull();
	});

	it("rejects a garbage token", async () => {
		expect(await verifyActionToken("not.a.jwt", "invite")).toBeNull();
	});
});
