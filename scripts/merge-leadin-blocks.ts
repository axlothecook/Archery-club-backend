// One-off: merge the FB lead-in line into the opening paragraph, for the 3 articles
// (hr + en — the locales the site serves) whose body starts with a short headline-like
// block. That block used to sit alone above the prose, catch the gold drop cap, and —
// being only 1–2 lines tall against a ~4-line float — leave an empty gap under itself.
//
// Merge rule (per the user):
//   • strip the lead-in's ** markers (it is not an archer name; bold stays reserved
//     for the medalled archers),
//   • lead-in ends in "," → it's a continuing greeting: join with a space, keep the
//     lowercase continuation ("...kluba, na kraju 2025. godine..."),
//   • otherwise it's a heading → ensure it ends with "." so the first sentence of the
//     merged paragraph is properly closed, then join with a space.
//
// Scoped to these slugs only. CEC is NOT here: its lead-in duplicates the article
// title and is dropped at render time instead.
//
// Dry-run by default; pass --apply to write.
//   npx tsx scripts/merge-leadin-blocks.ts
//   npx tsx scripts/merge-leadin-blocks.ts --apply
import "dotenv/config";
import { prisma } from "../src/db.ts";

const APPLY = process.argv.includes("--apply");

const SLUGS = [
	"amanda-mlinaric-treca-u-dvoranskom-svjetskom-kupu",
	"vrhunski-uspjeh-nase-strelicarke-amanda-mlinaric-treca-u-indoor-world-seriesu",
	"cestit-bozic-i-uspjesna-nova-2026-strelicarska-godina",
];

// Same lead-in test the diagnostics used: one line, and either wholly **bold**-wrapped
// or not ending in sentence punctuation.
const isLeadIn = (b: string) => {
	if (b.includes("\n")) return false;
	const t = b.trim();
	if (/^\*\*[\s\S]+\*\*$/.test(t)) return true;
	return !/[.!?]["»)\]]?$/.test(t);
};

function mergeLeadIn(leadIn: string, para: string): string {
	let head = leadIn.replace(/\*\*/g, "").trim();
	if (!/[,]$/.test(head) && !/[.!?]$/.test(head)) head += ".";
	return `${head} ${para.trim()}`;
}

const rows = await prisma.articleTranslation.findMany({
	where: { locale: { in: ["hr", "en"] }, article: { slug: { in: SLUGS } } },
	select: { id: true, locale: true, body: true, article: { select: { slug: true } } },
	orderBy: [{ article: { slug: "asc" } }, { locale: "asc" }],
});

let changed = 0;
for (const r of rows) {
	const blocks = (r.body ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
	if (blocks.length < 2 || !isLeadIn(blocks[0])) {
		console.log(`[${r.locale}] ${r.article.slug} — no lead-in found, left untouched`);
		continue;
	}

	const merged = mergeLeadIn(blocks[0], blocks[1]);
	const next = [merged, ...blocks.slice(2)].join("\n\n");
	changed++;

	console.log(`\n[${r.locale}] ${r.article.slug}`);
	console.log(`  -  ${JSON.stringify(blocks[0].slice(0, 76))}`);
	console.log(`  -  ${JSON.stringify(blocks[1].slice(0, 76))}...`);
	console.log(`  +  ${JSON.stringify(merged.slice(0, 120))}...`);
	console.log(`     merged first paragraph: ${merged.length} chars`);

	if (APPLY) {
		await prisma.articleTranslation.update({ where: { id: r.id }, data: { body: next } });
	}
}

console.log(`\n--- ${APPLY ? "APPLIED" : "DRY RUN (no writes)"} ---`);
console.log("rows merged:", changed, "/", rows.length);

await prisma.$disconnect();
