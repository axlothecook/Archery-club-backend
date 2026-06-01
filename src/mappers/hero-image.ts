import type { HeroImage } from "archery-contracts";
import type { HeroImage as HeroImageRow } from "../generated/prisma/client.ts";

// Map a HeroImage row -> the contract shape (reassemble the image columns).
export function toHeroImage(row: HeroImageRow): HeroImage {
	return {
		id: row.id,
		image: { url: row.imageUrl, alt: row.imageAlt },
		order: row.order,
	};
}
