// One-off: remove the redundant dateline from the CEC article body, in every locale.
//
// The body opened with a place/date + organizer line ("Lendava, Slovenia, April 26,
// 2026" / "Organizer: LK Lendava") sitting between the headline and the opening prose.
// Every one of those facts is already stated in the first paragraph's closing sentence
// ("...was held on April 26, 2026 in Lendava, Slovenia, and was hosted and organized by
// the local archery club LK Lendava"), so the dateline only repeated itself on the page
// and forced an odd paragraph break under the drop cap.
//
// Shape differs by locale: most keep the dateline as ONE two-line block; fr and zh split
// it across TWO blocks. So we drop the SHORT blocks that sit between the headline block
// and the first real prose block, rather than a fixed index.
//
// Scoped to this one slug. Dry-run by default; pass --apply to write.
//   npx tsx scripts/strip-cec-dateline.ts
//   npx tsx scripts/strip-cec-dateline.ts --apply
import "dotenv/config";
import { prisma } from "../src/db.ts";

const APPLY = process.argv.includes("--apply");
const SLUG = "cec-central-european-cup-1-kolo";
const SHORT = 80; // a dateline block; the opening prose runs 300+ chars in every locale

const rows = await prisma.articleTranslation.findMany({
	where: { article: { slug: SLUG } },
	select: { id: true, locale: true, body: true },
	orderBy: { locale: "asc" },
});

let changed = 0;
for (const r of rows) {
	const blocks = (r.body ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
	if (blocks.length < 3) {
		console.log(`[${r.locale}] SKIPPED — only ${blocks.length} blocks`);
		continue;
	}

	// Walk forward from the headline (block 0) and drop short blocks until the prose starts.
	const dropped: string[] = [];
	let i = 1;
	while (i < blocks.length && blocks[i].length <= SHORT) {
		dropped.push(blocks[i]);
		i++;
	}

	if (dropped.length === 0) {
		console.log(`[${r.locale}] no dateline block found — left untouched`);
		continue;
	}

	const next = [blocks[0], ...blocks.slice(i)].join("\n\n");
	changed++;
	console.log(`\n[${r.locale}] dropping ${dropped.length} block(s):`);
	dropped.forEach((d) => console.log(`    -  ${JSON.stringify(d.replace(/\n/g, " ⏎ ").slice(0, 70))}`));
	console.log(`    next block kept: ${JSON.stringify(blocks[i].slice(0, 60))}...`);

	if (APPLY) {
		await prisma.articleTranslation.update({ where: { id: r.id }, data: { body: next } });
	}
}

console.log(`\n--- ${APPLY ? "APPLIED" : "DRY RUN (no writes)"} ---`);
console.log("locales changed:", changed, "/", rows.length);

await prisma.$disconnect();
