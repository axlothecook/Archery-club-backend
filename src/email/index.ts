// Thin email abstraction. Behind this interface we call Brevo's transactional
// REST API directly (no SDK dependency — the @getbrevo SDK has ESM/version
// churn). When BREVO_API_KEY is unset (dev / not yet configured), emails are
// LOGGED to the console instead of sent, so the full invite/reset flow is
// testable end-to-end without a live key. Set BREVO_API_KEY + EMAIL_FROM to send.

export type Email = {
	to: string;
	subject: string;
	text: string; // plaintext body (links included inline)
};

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export async function sendEmail(email: Email): Promise<void> {
	const apiKey = process.env["BREVO_API_KEY"];
	const from = process.env["EMAIL_FROM"];

	if (!apiKey || !from) {
		// Not configured — log so the flow is testable. NEVER throw (a missing key
		// must not break invite/reset; the link is visible here in dev).
		console.log(
			`[email:console] to=${email.to} subject="${email.subject}"\n${email.text}`,
		);
		return;
	}

	const res = await fetch(BREVO_ENDPOINT, {
		method: "POST",
		headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
		body: JSON.stringify({
			sender: { email: from },
			to: [{ email: email.to }],
			subject: email.subject,
			textContent: email.text,
		}),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Brevo send failed (${res.status}): ${body}`);
	}
}
