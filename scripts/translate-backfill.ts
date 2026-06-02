// Backfill translations: translate every entity's hr SOURCE text into all 7
// target locales and store the per-locale rows. Idempotent — only MISSING
// locales are filled unless --force is passed (which re-translates existing
// rows, e.g. after a Google key is configured to replace mock stubs).
//
// Mock mode (no GOOGLE_TRANSLATE_KEY): writes "[locale] <hr text>" stubs so the
// flow is fully testable without a key. Set GOOGLE_TRANSLATE_KEY in .env + run
// with --force to replace stubs with real translations.
//
// Run:  npx tsx scripts/translate-backfill.ts [--force]
import "dotenv/config";
import { prisma } from "../src/db.ts";
import { fillAllTranslations } from "../src/translate/fill.ts";

const force = process.argv.includes("--force");
const live = !!process.env["GOOGLE_TRANSLATE_KEY"];

console.log(`Translate backfill — mode: ${live ? "LIVE (Google)" : "MOCK (stubs; set GOOGLE_TRANSLATE_KEY to send)"}; force: ${force}`);

const results = await fillAllTranslations({ force });
for (const r of results) {
	console.log(`  ${r.entity}: ${r.rowsFilled} row(s) filled × ${r.localesPerRow} locales`);
}
const total = results.reduce((n, r) => n + r.rowsFilled, 0);
console.log(`✅ Backfill complete: ${total} rows filled across ${results.length} entity types.`);

await prisma.$disconnect();
