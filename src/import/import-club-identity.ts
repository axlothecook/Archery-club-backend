import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the three /club/identity sub-pages into ClubIdentitySection +
// ClubIdentitySectionTranslation rows. The sections are assembled from three
// existing seed files into one unified, kind-discriminated shape:
//   - values (kind "blocks")  <- club-info.json `valuesBlocks`
//   - crest  (kind "single")  <- crest.json
//   - jersey (kind "gallery") <- jersey.json `designs`
// Idempotent: section UPSERTed by unique `slug`, translation by [sectionId, locale].
// Order/landing: values(0, default) -> crest(1) -> jersey(2). Ignores _-prefixed
// annotation fields. All seed text is hr (sourceLocale); other locales come later
// via the translate pipeline.

const SEED = join(process.cwd(), "seed-data");

type ImageRef = { url: string; alt: string };

type SectionSeed = {
	slug: string;
	order: number;
	kind: "blocks" | "single" | "gallery";
	isDefault: boolean;
	sourceLocale: string;
	title: string;
	content: unknown; // kind-discriminated; cast at the JSON column boundary
};

function readJson(file: string): unknown {
	return JSON.parse(readFileSync(join(SEED, file), "utf8"));
}

// Build the three section seeds from their source files.
function buildSections(): SectionSeed[] {
	const clubInfo = readJson("club-info.json") as {
		valuesBlocks: { header: string; body: string }[];
	};
	const crest = readJson("crest.json") as {
		sourceLocale: string;
		imageUrl?: string;
		imageAlt?: string;
		translations: { locale: string; title: string; body: string }[];
	};
	const jersey = readJson("jersey.json") as {
		sourceLocale: string;
		designs: {
			key: string;
			date: string;
			imageUrl?: string;
			imageAlt?: string;
			hr: string;
		}[];
	};

	// VALUES (blocks) — from club-info.json valuesBlocks (hr).
	const values: SectionSeed = {
		slug: "values",
		order: 0,
		kind: "blocks",
		isDefault: true,
		sourceLocale: "hr",
		title: "Vrijednosti",
		content: { kind: "blocks", blocks: clubInfo.valuesBlocks },
	};

	// CREST (single) — from crest.json. Image pending (null until provided).
	const crestT = crest.translations.find((t) => t.locale === "hr") ?? crest.translations[0];
	if (!crestT) throw new Error("crest.json has no translations");
	const crestSection: SectionSeed = {
		slug: "crest",
		order: 1,
		kind: "single",
		isDefault: false,
		sourceLocale: crest.sourceLocale ?? "hr",
		title: crestT.title,
		content: {
			kind: "single",
			image:
				crest.imageUrl != null
					? ({ url: crest.imageUrl, alt: crest.imageAlt ?? "" } as ImageRef)
					: null,
			body: crestT.body,
		},
	};

	// JERSEY (gallery) — from jersey.json designs. Images pending (null until provided);
	// each design becomes a gallery item with its year as the implementation date.
	const jerseySection: SectionSeed = {
		slug: "jersey",
		order: 2,
		kind: "gallery",
		isDefault: false,
		sourceLocale: jersey.sourceLocale ?? "hr",
		title: "Dres kluba",
		content: {
			kind: "gallery",
			items: jersey.designs.map((d) => ({
				image:
					d.imageUrl != null
						? ({ url: d.imageUrl, alt: d.imageAlt ?? "" } as ImageRef)
						: null,
				description: d.hr,
				date: d.date,
			})),
		},
	};

	return [values, crestSection, jerseySection];
}

export async function importClubIdentity(): Promise<{
	sections: number;
	translations: number;
}> {
	const sections = buildSections();
	let translationCount = 0;

	for (const s of sections) {
		const section = await prisma.clubIdentitySection.upsert({
			where: { slug: s.slug },
			create: {
				slug: s.slug,
				order: s.order,
				kind: s.kind,
				isDefault: s.isDefault,
				sourceLocale: s.sourceLocale,
			},
			update: {
				order: s.order,
				kind: s.kind,
				isDefault: s.isDefault,
				sourceLocale: s.sourceLocale,
			},
		});

		await prisma.clubIdentitySectionTranslation.upsert({
			where: { sectionId_locale: { sectionId: section.id, locale: s.sourceLocale } },
			create: {
				sectionId: section.id,
				locale: s.sourceLocale,
				title: s.title,
				content: s.content as object,
			},
			update: {
				title: s.title,
				content: s.content as object,
			},
		});
		translationCount++;
	}

	return { sections: sections.length, translations: translationCount };
}
