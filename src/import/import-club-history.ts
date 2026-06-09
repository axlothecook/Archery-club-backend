import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the club-history chapters (seed-data/club-history.json) into
// ClubHistoryPeriod + ClubHistoryPeriodTranslation rows. Idempotent: the period
// is UPSERTed by its unique `slug`, then each translation UPSERTed by the
// [periodId, locale] unique key — so re-running after editing the JSON updates in
// place (no clear-and-reinsert, no duplicate rows). The structured narrative
// (lead + ordered { header, body } paragraphs) is stored as-is; `paragraphs`
// lands in the JSON column. Ignores _-prefixed annotation fields
// (_comment, _status, _sourcePosts, _open, _referenceCard).

type SeedHighlight = { date: string; result: string; competition: string; archer: string };
type SeedParagraph = { header: string; body: string; highlights?: SeedHighlight[] };
type SeedTranslation = {
	locale: string;
	title: string;
	subtitle: string;
	lead: string;
	paragraphs: SeedParagraph[];
};
type SeedPeriod = {
	slug: string;
	order: number;
	coverImage: { url: string; alt: string } | null;
	sourceLocale: string;
	translations: SeedTranslation[];
};

const PATH = join(process.cwd(), "seed-data", "club-history.json");

export async function importClubHistory(): Promise<{
	periods: number;
	translations: number;
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { periods: SeedPeriod[] };
	const periods = raw.periods;

	let translationCount = 0;

	for (const p of periods) {
		const period = await prisma.clubHistoryPeriod.upsert({
			where: { slug: p.slug },
			create: {
				slug: p.slug,
				order: p.order,
				coverImageUrl: p.coverImage?.url ?? null,
				coverImageAlt: p.coverImage?.alt ?? null,
				sourceLocale: p.sourceLocale,
			},
			update: {
				order: p.order,
				coverImageUrl: p.coverImage?.url ?? null,
				coverImageAlt: p.coverImage?.alt ?? null,
				sourceLocale: p.sourceLocale,
			},
		});

		for (const t of p.translations) {
			await prisma.clubHistoryPeriodTranslation.upsert({
				where: { periodId_locale: { periodId: period.id, locale: t.locale } },
				create: {
					periodId: period.id,
					locale: t.locale,
					title: t.title,
					subtitle: t.subtitle,
					lead: t.lead,
					paragraphs: t.paragraphs,
				},
				update: {
					title: t.title,
					subtitle: t.subtitle,
					lead: t.lead,
					paragraphs: t.paragraphs,
				},
			});
			translationCount++;
		}
	}

	return { periods: periods.length, translations: translationCount };
}
