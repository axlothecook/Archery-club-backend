import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.ts";

describe("password hashing", () => {
	it("hashes to an argon2id string that is not the plaintext", async () => {
		const hash = await hashPassword("correct horse battery staple");
		expect(hash).not.toBe("correct horse battery staple");
		expect(hash.startsWith("$argon2id$")).toBe(true);
	});

	it("verifies the correct password and rejects a wrong one", async () => {
		const hash = await hashPassword("s3cret-pass");
		expect(await verifyPassword(hash, "s3cret-pass")).toBe(true);
		expect(await verifyPassword(hash, "wrong-pass")).toBe(false);
	});

	it("produces different hashes for the same password (random salt)", async () => {
		const a = await hashPassword("same");
		const b = await hashPassword("same");
		expect(a).not.toBe(b);
		expect(await verifyPassword(a, "same")).toBe(true);
		expect(await verifyPassword(b, "same")).toBe(true);
	});

	it("returns false (no throw) for a malformed hash", async () => {
		expect(await verifyPassword("not-a-hash", "x")).toBe(false);
	});
});
