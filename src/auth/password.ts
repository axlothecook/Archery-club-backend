import argon2 from "argon2";

// Argon2id with OWASP "moderate" parameters — secure per the OWASP Password
// Storage Cheat Sheet, kept light enough for the Raspberry Pi (admin logins are
// infrequent). 46 MiB memory, 1 iteration, 1 degree of parallelism.
const OPTIONS: argon2.Options = {
	type: argon2.argon2id,
	memoryCost: 46 * 1024, // 46 MiB, in KiB
	timeCost: 1,
	parallelism: 1,
};

// Hash a plaintext password. The returned string embeds the algorithm,
// parameters, and a per-hash random salt (argon2 handles salting).
export function hashPassword(plain: string): Promise<string> {
	return argon2.hash(plain, OPTIONS);
}

// Verify a plaintext password against a stored hash. Returns false (never
// throws) on a malformed/incompatible hash.
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, plain);
	} catch {
		return false;
	}
}
