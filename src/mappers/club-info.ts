import type {
	ClubInfoResolved,
	ClubOfficer,
	ClubSocial,
	ClubValueBlock,
	Locale,
} from "archery-contracts";
import type {
	ClubHistoryPhoto,
	ClubInfo,
	ClubInfoTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

type ClubInfoRow = ClubInfo & {
	translations: ClubInfoTranslation[];
	historyPhotos: ClubHistoryPhoto[];
};

// Map the ClubInfo singleton row -> the resolved single-locale public view.
// JSON columns (officers/socials, and the translation's label/caption maps) are
// cast to their contract types at this DB boundary. Officer role labels and
// photo captions are flattened from the per-locale maps.
export function toClubInfoResolved(row: ClubInfoRow, requested: Locale): ClubInfoResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	const officers = row.officers as unknown as ClubOfficer[];
	const socials = row.socials as unknown as ClubSocial[];
	const roleLabels = t.officerRoleLabels as Record<string, string>;
	const captions = t.photoCaptions as Record<string, string>;

	return {
		foundedDate: row.foundedDate ? row.foundedDate.toISOString() : null,
		address: row.address,
		email: row.email,
		oib: row.oib,
		socials,

		officers: officers.map((o) => ({
			name: o.name,
			role: roleLabels[o.roleKey] ?? o.roleKey, // fall back to the key if unlabelled
		})),
		historyPhotos: [...row.historyPhotos]
			.sort((a, b) => a.order - b.order)
			.map((p) => ({
				image: { url: p.url, alt: p.alt },
				caption: captions[p.id] ?? null,
				order: p.order,
			})),

		locale,
		valuesBlocks: t.valuesBlocks as unknown as ClubValueBlock[],
		historyText: t.historyText,
	};
}
