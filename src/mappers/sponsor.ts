import type { Locale, SponsorResolved } from "archery-contracts";
import type { Sponsor, SponsorTranslation } from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

// A Prisma Sponsor row with its translations included.
type SponsorRow = Sponsor & { translations: SponsorTranslation[] };

// Map a stored Sponsor row -> the resolved single-locale public view.
// Reassembles the logoUrl/logoAlt columns into { url, alt } and flattens the
// translations to the requested locale (fallback to the row's sourceLocale).
export function toSponsorResolved(row: SponsorRow, requested: Locale): SponsorResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	return {
		id: row.id,
		name: row.name,
		logo: { url: row.logoUrl, alt: row.logoAlt },
		website: row.website,
		locale,
		description: t.description,
	};
}
