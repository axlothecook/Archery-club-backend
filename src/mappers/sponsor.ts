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

// ── Admin DTOs ───────────────────────────────────────────────────────────────
// Admin-only rows for the dashboard Sponzori section. HR source description.

export type SponsorAdminRow = {
	id: string;
	name: string;
	logoUrl: string;
	logoAlt: string;
	website: string | null;
	description: string;
};

// Map a Sponsor row -> the admin list/edit row (HR description). Same shape works for
// both the list table and the edit form (all editable fields).
export function toSponsorAdminRow(row: SponsorRow): SponsorAdminRow {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		name: row.name,
		logoUrl: row.logoUrl,
		logoAlt: row.logoAlt,
		website: row.website,
		description: t?.description ?? "",
	};
}
