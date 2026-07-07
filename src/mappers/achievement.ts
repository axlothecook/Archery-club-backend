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

// ── Admin DTOs ───────────────────────────────────────────────────────────────
// Admin-only rows for the dashboard Postignuća section. HR source title; the
// dashboard is Croatian-only.

export type AchievementAdminRow = {
	id: string;
	year: number;
	scope: string;
	level: string;
	type: string;
	medal: string | null;
	image: ImageRef | null;
	title: string;
	archerNames: string[];
};

// Map an Achievement row -> the admin list row (HR title; stock icon fallback so the
// list always shows an image).
export function toAchievementAdminRow(row: AchievementRow): AchievementAdminRow {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		year: row.year,
		scope: row.scope,
		level: row.level,
		type: row.type,
		medal: row.medal,
		image: imageOrNull(row.imageUrl, row.imageAlt) ?? stockIcon(row.type, row.level, row.medal),
		title: t?.title ?? "",
		archerNames: row.archers.map((a) => `${a.firstName} ${a.lastName}`),
	};
}

// The full editable achievement (GET /admin/achievements/:id) for the edit form:
// every createBody field prefilled incl. the credited archer IDs. HR source title.
export type AchievementEditData = {
	id: string;
	year: number;
	scope: string;
	level: string;
	type: string;
	medal: string | null;
	imageUrl: string | null;
	imageAlt: string | null;
	archerIds: string[];
	title: string;
};

export function toAchievementEditData(row: AchievementRow): AchievementEditData {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		year: row.year,
		scope: row.scope,
		level: row.level,
		type: row.type,
		medal: row.medal,
		imageUrl: row.imageUrl,
		imageAlt: row.imageAlt,
		archerIds: row.archers.map((a) => a.id),
		title: t?.title ?? "",
	};
}
