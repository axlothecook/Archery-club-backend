import type { Locale } from "archery-contracts";

// Thin translation abstraction. Behind this we call Google Cloud Translation v2's
// REST API directly with an API KEY (no SDK, no OAuth/service-account — the
// `?key=` model is the simplest for server-to-server use). When
// GOOGLE_TRANSLATE_KEY is unset (dev / not yet configured) we run in MOCK mode:
// each target string is returned as `[<locale>] <source text>` so the whole
// translate-and-store flow is testable end-to-end without a live key (and it is
// obviously fake, so stub content is never mistaken for real). Mirrors the Brevo
// email abstraction (src/email). Set GOOGLE_TRANSLATE_KEY in .env to go live.

// Croatian is the source language; every other locale is a derived translation.
// Scope: the site ships hr + en only (decided 2026-06-16). The pipeline still
// supports more locales — add them back here to translate into them.
export const SOURCE_LOCALE: Locale = "hr";
export const TARGET_LOCALES: Locale[] = ["en"];

const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";

// Google v2 accepts up to ~128 `q` strings per call and wants the POST body's
// total `q` payload modest; we chunk to stay well under limits.
const MAX_BATCH = 100;

// Retry policy for TRANSIENT failures: rate-limits (429), server errors (5xx),
// and the propagation-window 403 that fires right after an API-key restriction
// change ("Requests from referer <empty> are blocked" before the change is fully
// rolled out across Google's edge). Genuine errors (400 bad request, an
// auth-config 403 that never clears) are NOT worth many retries but a couple of
// 403 attempts cheaply rides out the propagation blip. Exponential backoff.
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientStatus(status: number): boolean {
	return status === 429 || status === 403 || status >= 500;
}

function isMock(): boolean {
	return !process.env["GOOGLE_TRANSLATE_KEY"];
}

function mockOne(text: string, target: Locale): string {
	return `[${target}] ${text}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
	return out;
}

// Translate a batch of strings into one target locale. Order is preserved
// (output[i] corresponds to texts[i]). Empty strings pass through unchanged
// (Google would bill + round-trip them for nothing). In mock mode, no network.
export async function translateBatch(
	texts: string[],
	target: Locale,
	source: Locale = SOURCE_LOCALE,
): Promise<string[]> {
	if (texts.length === 0) return [];
	if (target === source) return [...texts]; // no-op: same language

	if (isMock()) {
		console.log(`[translate:mock] ${texts.length} string(s) -> ${target} (set GOOGLE_TRANSLATE_KEY to send)`);
		return texts.map((t) => (t === "" ? "" : mockOne(t, target)));
	}

	const key = process.env["GOOGLE_TRANSLATE_KEY"] as string;
	const out: string[] = [];

	for (const part of chunk(texts, MAX_BATCH)) {
		// Preserve empties without sending them.
		const sendIdx: number[] = [];
		const send: string[] = [];
		part.forEach((t, i) => {
			if (t !== "") { sendIdx.push(i); send.push(t); }
		});

		let translated: string[] = [];
		if (send.length > 0) {
			let lastErr = "";
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
					method: "POST",
					headers: { "content-type": "application/json; charset=utf-8" },
					body: JSON.stringify({ q: send, source, target, format: "text" }),
				});
				if (res.ok) {
					const data = (await res.json()) as {
						data?: { translations?: { translatedText?: string }[] };
					};
					const rows = data.data?.translations ?? [];
					translated = rows.map((r) => r.translatedText ?? "");
					if (translated.length !== send.length) {
						throw new Error(`Google Translate returned ${translated.length} results for ${send.length} inputs`);
					}
					break; // success
				}
				lastErr = `${res.status}: ${await res.text().catch(() => "")}`;
				// Non-transient (e.g. 400 bad request) → fail immediately.
				if (!isTransientStatus(res.status)) {
					throw new Error(`Google Translate failed (${lastErr})`);
				}
				// Transient → backoff + retry (unless this was the last attempt).
				if (attempt < MAX_ATTEMPTS) {
					const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
					console.warn(`[translate] transient ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${delay}ms`);
					await sleep(delay);
				}
			}
			if (translated.length !== send.length) {
				throw new Error(`Google Translate failed after ${MAX_ATTEMPTS} attempts (${lastErr})`);
			}
		}

		// Re-interleave translated values with the preserved empties.
		const merged = part.map((t) => (t === "" ? "" : ""));
		sendIdx.forEach((origIdx, j) => { merged[origIdx] = translated[j] ?? ""; });
		out.push(...merged);
	}

	return out;
}

// Convenience: translate a single string into one target locale.
export async function translateText(
	text: string,
	target: Locale,
	source: Locale = SOURCE_LOCALE,
): Promise<string> {
	const [t] = await translateBatch([text], target, source);
	return t ?? "";
}
