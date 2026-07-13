// One-off: fix the malformed bold markers on Amanda's standings row in
// "vrhunska-forma-amande-mlinaric-drugo-mjesto-u-svjetskom-poretku" (hr + en).
//
// Stored:   "Amanda Mlinarić** - **925"   (open/close reversed around the separator —
//                                          renders as literal asterisks)
// Intended: the author bolds the club's own archer in a standings list, whole row,
// same style as the Indoor-World-Series article ("3. **Amanda Mlinarić - 940**"):
// Fixed:    "**Amanda Mlinarić - 925**"
//
// Dry-run by default; pass --apply to write.
import "dotenv/config";
import { prisma } from "../src/db.ts";

const APPLY = process.argv.includes("--apply");
const SLUG = "vrhunska-forma-amande-mlinaric-drugo-mjesto-u-svjetskom-poretku";
const FROM = "Amanda Mlinarić** - **925";
const TO = "**Amanda Mlinarić - 925**";

const rows = await prisma.articleTranslation.findMany({
	where: { locale: { in: ["hr", "en"] }, article: { slug: SLUG } },
	select: { id: true, locale: true, body: true },
});

let changed = 0;
for (const r of rows) {
	if (!(r.body ?? "").includes(FROM)) {
		console.log(`[${r.locale}] pattern not found — left untouched`);
		continue;
	}
	changed++;
	console.log(`[${r.locale}] ${JSON.stringify(FROM)} → ${JSON.stringify(TO)}`);
	if (APPLY) {
		await prisma.articleTranslation.update({
			where: { id: r.id },
			data: { body: (r.body ?? "").split(FROM).join(TO) },
		});
	}
}

console.log(`--- ${APPLY ? "APPLIED" : "DRY RUN"} — rows changed: ${changed}/2 ---`);
await prisma.$disconnect();
