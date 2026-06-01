import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the 6 homepage club-stat card images (seed-data/home-stat-images.json)
// into HomeStatImage rows. `slot` is the stat-slot key — it must be one of the 6
// numbers the summary `stats` object exposes, or the image attaches to nothing.
// Idempotent via UPSERT by `slot`. Ignores _-prefixed annotation fields.

// The valid stat slots (the keys of the summary `stats` object that get a card).
const VALID_SLOTS = new Set([
	"worldTitles",
	"europeanTitles",
	"nationalTitles",
	"worldRecords",
	"europeanRecords",
	"nationalRecords",
]);

type SeedStatImage = {
	slot: string;
	imageUrl: string;
	imageAlt: string;
};

const PATH = join(process.cwd(), "seed-data", "home-stat-images.json");

export async function importHomeStatImages(): Promise<{
	upserted: number;
	unknownSlots: string[];
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { statImages: SeedStatImage[] };
	const statImages = raw.statImages;

	const unknownSlots: string[] = [];
	let upserted = 0;

	for (const s of statImages) {
		if (!VALID_SLOTS.has(s.slot)) {
			unknownSlots.push(s.slot);
			console.warn(`[home-stat-images-import] slot "${s.slot}" is not a known stat slot — its image will never display (typo?)`);
		}
		await prisma.homeStatImage.upsert({
			where: { slot: s.slot },
			create: { slot: s.slot, imageUrl: s.imageUrl, imageAlt: s.imageAlt },
			update: { imageUrl: s.imageUrl, imageAlt: s.imageAlt },
		});
		upserted++;
	}

	return { upserted, unknownSlots };
}
