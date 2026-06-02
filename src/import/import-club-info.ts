import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the SINGLETON club-info record (seed-data/club-info.json).
//
// Ownership split: IDENTITY (foundedDate, officers, valuesBlocks, historyText,
// role labels, captions) is SEED-OWNED — written on EVERY run, so editing the
// JSON and re-importing updates it. CONTACT (address, email, oib, socials) +
// historyPhotos are ADMIN-OWNED — the importer writes them ONLY when first
// CREATING the singleton, so a later re-import never clobbers an admin's contact
// edits. Idempotent. Ignores _-prefixed annotation fields (_comment, _open, …).

type SeedOfficer = { name: string; roleKey: string };
type SeedSocial = { platform: string; url: string };
type SeedPhoto = { key: string; url: string; alt: string; order: number };
type SeedValueBlock = { header: string; body: string };

type SeedClubInfo = {
	foundedDate: string | null;
	address: string | null;
	email: string | null;
	oib: string | null;
	officers: SeedOfficer[];
	socials: SeedSocial[];
	historyPhotos: SeedPhoto[];
	valuesBlocks: SeedValueBlock[];
	historyText: string;
	officerRoleLabels: Record<string, string>;
	photoCaptions: Record<string, string>;
};

const PATH = join(process.cwd(), "seed-data", "club-info.json");

export async function importClubInfo(): Promise<{ created: boolean }> {
	const c = JSON.parse(readFileSync(PATH, "utf8")) as SeedClubInfo;

	const existing = await prisma.clubInfo.findFirst();

	// Identity fields — written on every run.
	const identity = {
		foundedDate: c.foundedDate ? new Date(c.foundedDate) : null,
		officers: c.officers,
		sourceLocale: "hr",
	};

	if (!existing) {
		// First create: set identity AND the admin-owned contact + socials + photos.
		const ci = await prisma.clubInfo.create({
			data: {
				...identity,
				address: c.address,
				email: c.email,
				oib: c.oib,
				socials: c.socials,
				historyPhotos: {
					create: c.historyPhotos.map((p) => ({ url: p.url, alt: p.alt, order: p.order })),
				},
			},
		});
		await prisma.clubInfoTranslation.create({
			data: {
				clubInfoId: ci.id,
				locale: "hr",
				valuesBlocks: c.valuesBlocks,
				historyText: c.historyText,
				officerRoleLabels: c.officerRoleLabels,
				photoCaptions: c.photoCaptions,
			},
		});
		return { created: true };
	}

	// Re-import: update IDENTITY only — leave admin-owned contact/socials/photos alone.
	await prisma.clubInfo.update({ where: { id: existing.id }, data: identity });
	await prisma.clubInfoTranslation.upsert({
		where: { clubInfoId_locale: { clubInfoId: existing.id, locale: "hr" } },
		create: {
			clubInfoId: existing.id,
			locale: "hr",
			valuesBlocks: c.valuesBlocks,
			historyText: c.historyText,
			officerRoleLabels: c.officerRoleLabels,
			photoCaptions: c.photoCaptions,
		},
		update: {
			valuesBlocks: c.valuesBlocks,
			historyText: c.historyText,
			officerRoleLabels: c.officerRoleLabels,
			photoCaptions: c.photoCaptions,
		},
	});
	return { created: false };
}
