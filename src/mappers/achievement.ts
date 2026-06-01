import type {
	AchievementResolved,
	ImageRef,
	Locale,
} from "archery-contracts";
import type {
	Achievement,
	AchievementTranslation,
	Archer,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";
import { stockIcon } from "./achievement-icons.ts";

// A Prisma Achievement row with its translations and credited archers included.
type AchievementRow = Achievement & {
	translations: AchievementTranslation[];
	archers: Archer[];
};

// Reassemble a nullable single-image column pair into ImageRef | null.
// Returns null unless BOTH url and alt are present.
function imageOrNull(url: string | null, alt: string | null): ImageRef | null {
	return url !== null && alt !== null ? { url, alt } : null;
}

// Map a stored Achievement row -> the resolved single-locale public view.
export function toAchievementResolved(
	row: AchievementRow,
	requested: Locale,
): AchievementResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	return {
		id: row.id,
		year: row.year,
		scope: row.scope as AchievementResolved["scope"],
		level: row.level as AchievementResolved["level"],
		type: row.type as AchievementResolved["type"],
		medal: row.medal as AchievementResolved["medal"],
		// Custom photo if the row sets one; otherwise the stock medal/record icon
		// derived from medal colour / record scope (stored once, never per row).
		image: imageOrNull(row.imageUrl, row.imageAlt) ?? stockIcon(row.type, row.level, row.medal),
		locale,
		title: t.title,
		archers: row.archers.map((a) => ({
			id: a.id,
			firstName: a.firstName,
			lastName: a.lastName,
			cardPhoto: a.cardPhotoUrl ? { url: a.cardPhotoUrl, alt: a.cardPhotoAlt ?? "" } : null,
		})),
	};
}
