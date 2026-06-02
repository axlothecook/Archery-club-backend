import type {
	ClubEventResolved,
	Discipline,
	EventLevelResolved,
	ImageRef,
	Locale,
} from "archery-contracts";
import type {
	Archer,
	ClubEvent,
	ClubEventTranslation,
	EventLevel,
	EventLevelTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

type LevelRow = EventLevel & { translations: EventLevelTranslation[] };

// A Prisma ClubEvent row with translations, attending archers, and (optionally)
// its level + the level's translations included.
type ClubEventRow = ClubEvent & {
	translations: ClubEventTranslation[];
	attendingArchers: Archer[];
	level: LevelRow | null;
};

function imageOrNull(url: string | null, alt: string | null): ImageRef | null {
	return url !== null && alt !== null ? { url, alt } : null;
}

// Resolve an EventLevel for the public calendar legend (name + color).
export function resolveLevel(level: LevelRow | null, requested: Locale): EventLevelResolved | null {
	if (!level) return null;
	// Level translations have no per-level sourceLocale column; fall back to 'hr'
	// (the site source language) when the requested locale's row is missing.
	const { row } = resolveTranslation(level.translations, requested, "hr");
	return { id: level.id, name: row.name, color: level.color };
}

// Map a stored ClubEvent row -> the resolved single-locale public view.
export function toClubEventResolved(row: ClubEventRow, requested: Locale): ClubEventResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);

	return {
		id: row.id,
		discipline: row.discipline as Discipline,
		format: row.format,
		dateFrom: row.dateFrom.toISOString(),
		dateTo: row.dateTo ? row.dateTo.toISOString() : null,
		image: imageOrNull(row.imageUrl, row.imageAlt),
		sourceUrl: row.sourceUrl,
		isCancelled: row.isCancelled,
		location: row.location,
		organizer: row.organizer,
		level: resolveLevel(row.level, requested),
		attendees: row.attendingArchers.map((a) => `${a.firstName} ${a.lastName}`),
		hasUnlistedClubAttendee: row.hasUnlistedClubAttendee,
		locale,
		name: t.name,
	};
}
