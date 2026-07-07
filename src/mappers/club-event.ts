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

// ── Admin rows ───────────────────────────────────────────────────────────────
// Admin-only DTOs for the dashboard Raspored section. Deliberately separate from
// the public resolver so admin fields (status, hidden) never leak to public
// responses (OWASP API3). HR source name; the dashboard is Croatian-only.

export type EventAdminRow = {
	id: string;
	name: string;
	discipline: string;
	dateFrom: string; // ISO
	dateTo: string | null; // ISO
	status: "draft" | "published";
	hidden: boolean;
	isCancelled: boolean;
	image: ImageRef | null;
	level: { id: string; name: string; color: string } | null;
	attendeeCount: number;
	hasUnlistedClubAttendee: boolean;
};

// Map a ClubEvent row -> the admin list row (HR name; falls back safely).
export function toEventAdminRow(row: ClubEventRow): EventAdminRow {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	const lvl = row.level;
	const lvlName = lvl ? (lvl.translations.find((x) => x.locale === "hr") ?? lvl.translations[0])?.name ?? "" : "";
	return {
		id: row.id,
		name: t?.name ?? "",
		discipline: row.discipline,
		dateFrom: row.dateFrom.toISOString(),
		dateTo: row.dateTo ? row.dateTo.toISOString() : null,
		status: row.status as "draft" | "published",
		hidden: row.hidden,
		isCancelled: row.isCancelled,
		image: imageOrNull(row.imageUrl, row.imageAlt),
		level: lvl ? { id: lvl.id, name: lvlName, color: lvl.color } : null,
		attendeeCount: row.attendingArchers.length,
		hasUnlistedClubAttendee: row.hasUnlistedClubAttendee,
	};
}

// The FULL editable event (GET /admin/events/:id) for the dashboard EDIT form: every
// createBody field prefilled, incl. the attending archer IDs (the list row only carries
// the count). HR source name. Mirrors toArticleEditData.
export type EventEditData = {
	id: string;
	discipline: string;
	format: string | null;
	dateFrom: string; // ISO
	dateTo: string | null; // ISO
	imageUrl: string | null;
	imageAlt: string | null;
	sourceUrl: string | null;
	isCancelled: boolean;
	status: "draft" | "published";
	hidden: boolean;
	location: string | null;
	organizer: string | null;
	levelId: string | null;
	attendingArcherIds: string[];
	hasUnlistedClubAttendee: boolean;
	name: string;
};

export function toEventEditData(row: ClubEventRow): EventEditData {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		discipline: row.discipline,
		format: row.format,
		dateFrom: row.dateFrom.toISOString(),
		dateTo: row.dateTo ? row.dateTo.toISOString() : null,
		imageUrl: row.imageUrl,
		imageAlt: row.imageAlt,
		sourceUrl: row.sourceUrl,
		isCancelled: row.isCancelled,
		status: row.status as "draft" | "published",
		hidden: row.hidden,
		location: row.location,
		organizer: row.organizer,
		levelId: row.level?.id ?? null,
		attendingArcherIds: row.attendingArchers.map((a) => a.id),
		hasUnlistedClubAttendee: row.hasUnlistedClubAttendee,
		name: t?.name ?? "",
	};
}

export type EventLevelAdminRow = {
	id: string;
	name: string;
	color: string;
	order: number;
	eventCount: number; // how many events use this level (so the admin sees usage)
};

// Map an EventLevel row (+ _count.events) -> the admin CRUD/legend row.
export function toEventLevelAdminRow(row: LevelRow & { _count?: { events: number } }): EventLevelAdminRow {
	const t = row.translations.find((x) => x.locale === "hr") ?? row.translations[0];
	return {
		id: row.id,
		name: t?.name ?? "",
		color: row.color,
		order: row.order,
		eventCount: row._count?.events ?? 0,
	};
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
