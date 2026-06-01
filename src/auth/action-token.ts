import { SignJWT, jwtVerify } from "jose";

// JWT is used ONLY for short-lived, single-purpose action tokens (invite,
// password reset) — never for the login session (that's server-side, see
// session.ts). Single-use is enforced at the endpoint (an invite token stops
// working once passwordHash is set; a reset token once the password changes).

export type ActionPurpose = "invite" | "reset";

function secret(): Uint8Array {
	const s = process.env["AUTH_TOKEN_SECRET"];
	if (!s) throw new Error("AUTH_TOKEN_SECRET is not set");
	return new TextEncoder().encode(s);
}

// Sign a token for an admin + purpose, expiring after `expiresIn` (jose duration
// string, e.g. '24h', '30m').
export function signActionToken(
	adminId: string,
	purpose: ActionPurpose,
	expiresIn: string,
): Promise<string> {
	return new SignJWT({ purpose })
		.setProtectedHeader({ alg: "HS256" })
		.setSubject(adminId)
		.setIssuedAt()
		.setExpirationTime(expiresIn)
		.sign(secret());
}

// Verify a token and confirm its purpose. Returns the adminId (sub), or null if
// invalid/expired/wrong-purpose.
export async function verifyActionToken(
	token: string,
	purpose: ActionPurpose,
): Promise<string | null> {
	try {
		const { payload } = await jwtVerify(token, secret());
		if (payload["purpose"] !== purpose || typeof payload.sub !== "string") return null;
		return payload.sub;
	} catch {
		return null;
	}
}
