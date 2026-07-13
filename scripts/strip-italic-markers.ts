// One-off: strip the leftover markdown *italic* markers from article bodies.
//
// The FB-sourced posts carry two kinds of markdown that were never parsed:
//   **bold**  — wraps the archers who medalled + section headings. KEPT: the frontend
//               now renders it as <strong> (renderBold in najnovije/[slug]/+page.svelte).
//   *italic*  — wraps ONLY the place/date + organizer lines of the CEC article, in every
//               locale. These are meant to read as ordinary sentences, so the markers are
//               removed here at the source.
//
// Dry-run by default (prints what it WOULD change). Pass --apply to write.
//   npx tsx scripts/strip-italic-markers.ts
//   npx tsx scripts/strip-italic-markers.ts --apply
import "dotenv/config";
import { prisma } from "../src/db.ts";

const APPLY = process.argv.includes("--apply");

// Remove a *…* pair while leaving **…** alone. Guard both sides against a neighbouring
// asterisk so the middle of a **bold** run can never be treated as an italic delimiter.
const stripItalic = (s: string) => s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2");

const rows = await prisma.articleTranslation.findMany({
	select: { id: true, locale: true, title: true, body: true, excerpt: true, article: { select: { slug: true } } },
});

let changed = 0;
for (const r of rows) {
	const next = {
		title: stripItalic(r.title ?? ""),
		body: stripItalic(r.body ?? ""),
		excerpt: stripItalic(r.excerpt ?? ""),
	};
	const dirty =
		next.title !== r.title || next.body !== r.body || next.excerpt !== r.excerpt;
	if (!dirty) continue;
	changed++;

	console.log(`\n[${r.locale}] ${r.article.slug}`);
	for (const [field, before, after] of [
		["title", r.title, next.title],
		["excerpt", r.excerpt, next.excerpt],
		["body", r.body, next.body],
	] as [string, string, string][]) {
		if (before === after) continue;
		const beforeLines = before.split("\n");
		after.split("\n").forEach((a, i) => {
			if (a !== beforeLines[i]) {
				console.log(`  ${field}:`);
				console.log(`    -  ${beforeLines[i]}`);
				console.log(`    +  ${a}`);
			}
		});
	}

	if (APPLY) {
		await prisma.articleTranslation.update({ where: { id: r.id }, data: next });
	}
}

// Safety net: after an --apply run nothing should retain a lone italic marker.
const leftover = (await prisma.articleTranslation.findMany({ select: { body: true } }))
	.filter((r) => /(^|[^*])\*([^*\n]+)\*(?!\*)/.test(r.body ?? "")).length;

console.log(`\n--- ${APPLY ? "APPLIED" : "DRY RUN (no writes)"} ---`);
console.log("translation rows affected:", changed, "/", rows.length);
console.log("rows still holding a lone *italic* marker:", leftover);

await prisma.$disconnect();
