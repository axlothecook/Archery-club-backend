import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the club sponsors (seed-data/sponsors.json) into Sponsor +
// SponsorTranslation rows. Idempotent: matches an existing sponsor by `name`
// (sponsors are also admin-creatable, so `name` has no DB unique constraint — we
// match-then-create/update rather than relying on upsert). The hr source
// translation is written; other locales come from the translate pipeline later.
// Ignores _-prefixed annotation fields. LOUDLY warns on any unfilled PLACEHOLDER_
// value so the seed isn't silently imported with stub content.

type SeedSponsor = {
	name: string;
	logoUrl: string;
	logoAlt: string;
	website: string | null;
	sourceLocale: string;
	description: string;
};

const PATH = join(process.cwd(), "seed-data", "sponsors.json");

export async function importSponsors(): Promise<{
	created: number;
	updated: number;
	placeholders: string[];
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { sponsors: SeedSponsor[] };
	const sponsors = raw.sponsors;

	const placeholders: string[] = [];
	let created = 0;
	let updated = 0;

	for (const s of sponsors) {
		// Surface any unfilled placeholder so a stub import is never silent.
		for (const [field, value] of Object.entries(s)) {
			if (typeof value === "string" && value.startsWith("PLACEHOLDER_")) {
				placeholders.push(`${s.name}.${field}`);
				console.warn(`[sponsors-import] ${s.name}: ${field} is still a placeholder (${value}) — fill it before launch`);
			}
		}

		const existing = await prisma.sponsor.findFirst({ where: { name: s.name } });

		const scalar = {
			name: s.name,
			logoUrl: s.logoUrl,
			logoAlt: s.logoAlt,
			website: s.website,
			sourceLocale: s.sourceLocale,
		};

		if (existing) {
			await prisma.sponsor.update({ where: { id: existing.id }, data: scalar });
			await prisma.sponsorTranslation.upsert({
				where: { sponsorId_locale: { sponsorId: existing.id, locale: s.sourceLocale } },
				create: { sponsorId: existing.id, locale: s.sourceLocale, description: s.description },
				update: { description: s.description },
			});
			updated++;
		} else {
			await prisma.sponsor.create({
				data: {
					...scalar,
					translations: { create: { locale: s.sourceLocale, description: s.description } },
				},
			});
			created++;
		}
	}

	return { created, updated, placeholders };
}
