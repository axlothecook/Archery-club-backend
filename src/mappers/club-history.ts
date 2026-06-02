import type {
	ClubHistoryParagraph,
	ClubHistoryPeriodResolved,
	Locale,
} from "archery-contracts";
import type {
	ClubHistoryPeriod,
	ClubHistoryPeriodTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

// A Prisma ClubHistoryPeriod row with its translations included.
type ClubHistoryPeriodRow = ClubHistoryPeriod & {
	translations: ClubHistoryPeriodTranslation[];
};

// Map a stored ClubHistoryPeriod row -> the resolved single-locale public view.
// Reassembles the optional coverImageUrl/coverImageAlt columns into { url, alt }
// (null when no cover is set) and flattens the translations to the requested
// locale (fallback to the row's sourceLocale). The translation's `paragraphs`
// JSON column is cast to its contract type at this DB boundary.
export function toClubHistoryPeriodResolved(
	row: ClubHistoryPeriodRow,
	requested: Locale,
): ClubHistoryPeriodResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	const coverImage =
		row.coverImageUrl !== null && row.coverImageAlt !== null
			? { url: row.coverImageUrl, alt: row.coverImageAlt }
			: null;

	return {
		id: row.id,
		slug: row.slug,
		order: row.order,
		coverImage,

		locale,
		title: t.title,
		subtitle: t.subtitle,
		lead: t.lead,
		paragraphs: t.paragraphs as unknown as ClubHistoryParagraph[],
	};
}
