import type {
	ClubIdentityContent,
	ClubIdentityKind,
	ClubIdentitySectionResolved,
	Locale,
} from "archery-contracts";
import type {
	ClubIdentitySection,
	ClubIdentitySectionTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

// A Prisma ClubIdentitySection row with its translations included.
type ClubIdentitySectionRow = ClubIdentitySection & {
	translations: ClubIdentitySectionTranslation[];
};

// Map a stored ClubIdentitySection row -> the resolved single-locale public view.
// Flattens the translations to the requested locale (fallback to the row's
// sourceLocale). The translation's `content` JSON column is cast to its
// kind-discriminated contract type at this DB boundary.
export function toClubIdentitySectionResolved(
	row: ClubIdentitySectionRow,
	requested: Locale,
): ClubIdentitySectionResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	return {
		id: row.id,
		slug: row.slug,
		order: row.order,
		kind: row.kind as ClubIdentityKind,
		isDefault: row.isDefault,

		locale,
		title: t.title,
		content: t.content as unknown as ClubIdentityContent,
	};
}
