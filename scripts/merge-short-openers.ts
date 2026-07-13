// One-off: merge the two literal one-sentence openers into their following paragraph
// (hr + en). With the drop cap now sized at 3 lines, every opener of 3+ lines contains
// it — these two articles are the only ones left with a 2-line opening paragraph, and
// per the user's rule ("if the opening is one sentence short, merge it with the first
// paragraph") they get joined. Both already end in ".", so it's a plain space-join —
// no copy is edited.
//
// Dry-run by default; pass --apply to write.
import "dotenv/config";
import { prisma } from "../src/db.ts";

const APPLY = process.argv.includes("--apply");

const SLUGS = [
	"amanda-mlinaric-i-zoran-velagic-nastupili-na-3d-pokalu-u-sloveniji",
	"klubska-atmosfera-tijekom-treninga-vsk-snimkom-najavio-nastavak-sezone",
];

const rows = await prisma.articleTranslation.findMany({
	where: { locale: { in: ["hr", "en"] }, article: { slug: { in: SLUGS } } },
	select: { id: true, locale: true, body: true, article: { select: { slug: true } } },
	orderBy: [{ article: { slug: "asc" } }, { locale: "asc" }],
});

let changed = 0;
for (const r of rows) {
	const blocks = (r.body ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
	if (blocks.length < 2) {
		console.log(`[${r.locale}] ${r.article.slug} — fewer than 2 blocks, skipped`);
		continue;
	}
	if (!/[.!?]$/.test(blocks[0])) {
		console.log(`[${r.locale}] ${r.article.slug} — opener doesn't end in sentence punctuation, skipped`);
		continue;
	}

	const merged = `${blocks[0]} ${blocks[1]}`;
	const next = [merged, ...blocks.slice(2)].join("\n\n");
	changed++;

	console.log(`\n[${r.locale}] ${r.article.slug}`);
	console.log(`  -  ${JSON.stringify(blocks[0].slice(0, 70))}`);
	console.log(`  -  ${JSON.stringify(blocks[1].slice(0, 70))}...`);
	console.log(`  +  merged first paragraph: ${merged.length} chars`);

	if (APPLY) {
		await prisma.articleTranslation.update({ where: { id: r.id }, data: { body: next } });
	}
}

console.log(`\n--- ${APPLY ? "APPLIED" : "DRY RUN (no writes)"} — rows merged: ${changed}/${rows.length} ---`);
await prisma.$disconnect();
