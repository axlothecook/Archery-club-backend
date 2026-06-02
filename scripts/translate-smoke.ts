// Live smoke test for the Google Translation engine. Translates ONE real
// Croatian string into every target locale and prints the result, so we can
// confirm the LIVE path works end-to-end (auth, response shape, locale codes,
// escaping) BEFORE committing to a full backfill. Does NOT touch the database.
//
// Run (after putting GOOGLE_TRANSLATE_KEY in .env):
//   npx tsx scripts/translate-smoke.ts
import "dotenv/config";
import { TARGET_LOCALES, SOURCE_LOCALE, translateText } from "../src/translate/index.ts";

if (!process.env["GOOGLE_TRANSLATE_KEY"]) {
	console.error("✗ GOOGLE_TRANSLATE_KEY is not set in .env — this smoke test needs a REAL key (mock mode would just print '[locale] …' stubs and prove nothing). Add the key and re-run.");
	process.exit(1);
}

// A real string from the club's identity content (has diacritics + a quote-free
// sentence) — representative of what the backfill will translate.
const sample = "Bavljenje sportom je ljudsko pravo. Svakom pojedincu mora biti omogućeno bavljenje sportom.";

console.log(`Source (${SOURCE_LOCALE}): ${sample}\n`);
console.log("Translating to all target locales (one live call each)...\n");

let failures = 0;
for (const target of TARGET_LOCALES) {
	try {
		const out = await translateText(sample, target);
		const looksMock = out.startsWith(`[${target}]`);
		const flag = looksMock ? "  ⚠️ LOOKS LIKE A MOCK STUB (key not actually used?)" : "";
		console.log(`  ${target}: ${out}${flag}`);
		if (looksMock) failures++;
	} catch (err) {
		failures++;
		console.error(`  ${target}: ✗ ERROR — ${err instanceof Error ? err.message : String(err)}`);
		console.error(`       (if this is an "Invalid Value"/language error, the locale code "${target}" may need a Google-specific variant, e.g. zh -> zh-CN; fix TARGET_LOCALES in src/translate/index.ts)`);
	}
}

console.log("");
if (failures === 0) {
	console.log("✅ All target locales translated cleanly. Safe to run the full backfill (--force).");
} else {
	console.log(`✗ ${failures} locale(s) failed or returned stubs — fix before the backfill. Do NOT --force yet.`);
	process.exit(1);
}
