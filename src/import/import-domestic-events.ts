import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";
import { ATTENDED_SERIES } from "./import-upcoming-wa-events.ts";
import { deriveEventLevel } from "./derive-event-level.ts";

// PATH B — domestic events from the official HSS 2026 calendar.
//
// Source: seed-data/hss-calendar-2026.json (verbatim HSS calendar). We generate
// ClubEvents for the DOMESTIC rows the club has attended before (ATTENDED_DOMESTIC
// below, each evidenced by a club FB-post article) — BUT only those NOT already
// covered by World Archery's feed (path A handles WA-listed events like Samobor GP
// + CEC, even when they're in Croatia). De-dupe is by WA-coverage: a calendar row
// whose name matches an ATTENDED_SERIES needle is left to path A and skipped here.
//
// Date rule (user): an attended event STILL upcoming in 2026 -> import as-is.
// An attended event already PASSED in 2026 -> import for NEXT year (keep day+month,
// year 2026 -> 2027), as a projected fixture the admin can edit. Cancelled rows
// (otkazano) -> also projected to 2027 (assume the event returns). Imported as
// PUBLISHED (user's choice). Idempotent: matches an existing domestic event by
// (name + dateFrom); no waId (these are non-WA).

type CalEvent = {
	date: string;
	dateTo?: string;
	discipline: string | null;
	name: string;
	format: string | null;
	location: string | null;
	organizer: string | null;
	country: string;
	domestic: boolean;
	cancelled?: boolean;
};

// Domestic calendar event-name fragments the club has attended (lowercased match
// against the calendar `name`). Each traced to a club article. These are the
// purely-domestic series WA does NOT list (verified: Sisak/Varaždin/Kutina/3D/etc
// return 0 WA hits). Samobor *Grand Prix* and CEC are intentionally NOT here —
// WA covers them (path A).
const ATTENDED_DOMESTIC: { needle: string; note: string }[] = [
	{ needle: "sisačka zima", note: "Sisačka zima — 2026-01-29 article (Tena/Velagić gold)" },
	{ needle: "sisak open", note: "Sisak events — 2026-02-08 article (6 medals in Sisak)" },
	{ needle: "dan grada siska", note: "Sisak — recurring club venue" },
	{ needle: "oluja", note: "Sisak (Oluja) — recurring club venue" },
	{ needle: "sveti nikola", note: "Sisak (Sveti Nikola) — recurring club venue" },
	{ needle: "koros", note: "12. dvoranski turnir SK Koros Kutina — 2026-02-23 article (Leda Crnčec)" },
	{ needle: "morčići", note: "Morčići Rijeka — Rijeka venue (PH Rijeka 2026-03-11 article)" },
	{ needle: "prvenstvo hrvatske", note: "Prvenstvo Hrvatske — multiple PH articles (ekipno zlato etc)" },
	{ needle: "kup mladih samobor", note: "Kup mladih Samobor — 2025-05-24 article (3 golds Samobor)" },
	{ needle: "rakitje", note: "Rakitje (Kup mladih) — 2025-05-24 article (gold Rakitje)" },
	{ needle: "martinjski", note: "Martinjski turnir Ljubešćica — 2025-11-09 article" },
	{ needle: "varaždin open", note: "Varaždin Open — 2026-05-24 article (Bistričić win)" },
	{ needle: "veliki pehar nikole zrinskog", note: "Veliki pehar — 2025-04-30 article (season opener)" },
	{ needle: "joševica", note: "Joševica 3D Glina — 3D series (Velagić 3D state champ article)" },
];

const PATH = join(process.cwd(), "seed-data", "hss-calendar-2026.json");

function attendedDomestic(name: string): { needle: string; note: string } | null {
	const lower = name.toLowerCase();
	return ATTENDED_DOMESTIC.find((s) => lower.includes(s.needle)) ?? null;
}

// Is this calendar event covered by WA (path A)? If so, skip it here (de-dupe).
function coveredByWa(name: string): boolean {
	const lower = name.toLowerCase();
	return ATTENDED_SERIES.some((s) => lower.includes(s.needle));
}

// Shift an ISO date's year 2026 -> 2027, preserving month/day.
function toNextYear(iso: string): string {
	return iso.replace(/^2026-/, "2027-");
}

const DISCIPLINE_MAP: Record<string, "outdoor" | "indoor" | "field" | "3d"> = {
	"wa 720": "outdoor", "wa 720 + or": "outdoor", "wa 720+or": "outdoor",
	"wa 2x18": "indoor", "wa 2x18+or": "indoor", "2x18": "indoor",
	"wa 2x25+2x18": "indoor", "wa 2x25+2x18m": "indoor", "wa720+mix tim": "outdoor",
	"wa 3d": "3d", "3d": "3d", "field 12+12": "field", "field & 3d": "field", "3x18": "indoor",
};
function mapDiscipline(d: string | null): "outdoor" | "indoor" | "field" | "3d" {
	const m = d ? DISCIPLINE_MAP[d.trim().toLowerCase()] : undefined;
	return m ?? "outdoor";
}

export async function importDomesticEvents(opts?: {
	today?: Date;
	levelIds?: Map<string, string>;
}): Promise<{
	created: number;
	updated: number;
	imported: { name: string; dateFrom: string; projected: boolean }[];
	skippedWaCovered: string[];
}> {
	const today = opts?.today ?? new Date(new Date().toISOString().slice(0, 10));
	const levelIds = opts?.levelIds;
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { events: CalEvent[] };

	const imported: { name: string; dateFrom: string; projected: boolean }[] = [];
	const skippedWaCovered: string[] = [];
	let created = 0;
	let updated = 0;

	for (const ev of raw.events) {
		if (!ev.domestic) continue; // path B = domestic only
		if (!attendedDomestic(ev.name)) continue; // only events the club attends
		if (coveredByWa(ev.name)) { skippedWaCovered.push(ev.name); continue; } // path A owns it

		// Date rule: passed (or cancelled) -> project to 2027; upcoming -> as-is.
		const original = new Date(ev.date);
		const passed = original.getTime() < today.getTime();
		const project = passed || ev.cancelled === true;
		const dateFrom = project ? toNextYear(ev.date) : ev.date;
		const dateTo = ev.dateTo ? (project ? toNextYear(ev.dateTo) : ev.dateTo) : null;

		// Resolve the calendar level (Svjetski/Europsko/Državno/Domaće) → levelId.
		const levelName = deriveEventLevel({
			name: ev.name,
			format: ev.format,
			country: ev.country,
			domestic: ev.domestic,
		});
		const levelId = levelIds?.get(levelName) ?? null;

		const neutral = {
			discipline: mapDiscipline(ev.discipline),
			format: ev.format,
			levelId,
			dateFrom: new Date(dateFrom),
			dateTo: dateTo ? new Date(dateTo) : null,
			location: ev.location,
			organizer: ev.organizer,
			sourceUrl: null,
			status: "published",
			hidden: false,
			// Projected-to-2027 events keep the calendar's cancelled flag false (a
			// future edition); only a genuinely-cancelled SAME-year row would be true.
			isCancelled: ev.cancelled === true && !project,
			hasUnlistedClubAttendee: true,
			sourceLocale: "hr",
		};

		// Match an existing domestic event by name + dateFrom (no waId for these).
		const existing = await prisma.clubEvent.findFirst({
			where: { waId: null, dateFrom: neutral.dateFrom, translations: { some: { locale: "hr", name: ev.name } } },
		});

		if (existing) {
			await prisma.clubEvent.update({ where: { id: existing.id }, data: neutral });
			updated++;
		} else {
			await prisma.clubEvent.create({
				data: { ...neutral, translations: { create: [{ locale: "hr", name: ev.name }] } },
			});
			created++;
		}
		imported.push({ name: ev.name, dateFrom, projected: project });
	}

	return { created, updated, imported, skippedWaCovered };
}
