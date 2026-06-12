import { prisma } from "../db.ts";
import { deriveEventLevel } from "./derive-event-level.ts";

// PATH A — external/upcoming events from World Archery.
//
// WA's public `content=COMPETITIONS` feed lists ALL competitions (30k+). We keep
// only UPCOMING ones (date >= today) whose name/series the club has attended
// before (the ATTENDED_SERIES list below, each traced to a club FB-post article).
// This is the WA-COVERAGE path: WA returns Veronica's/Conquest/CEC (incl. the
// Croatian CEC legs) + Samobor GP + the World/Euro events Amanda competes in, so
// those come from here. Purely-domestic events WA does NOT list (Sisak, Varaždin,
// Sava 3D, small turniri) are handled by the domestic path (import-domestic-events).
//
// Idempotent: upserts by waId. Imported as published (these are confirmed
// calendar fixtures of series the club regularly attends).

// Series/event-name fragments the club has attended (lowercased match against the
// WA event Name). Each is evidenced by a club article (FB post). Reviewed list —
// extend as the attendance record grows.
export const ATTENDED_SERIES: { needle: string; note: string }[] = [
	{ needle: "veronica", note: "Veronica's Cup — 2025-05-29 article" },
	{ needle: "conquest cup", note: "Conquest Cup — 2025-05-30 article" },
	{ needle: "central european cup", note: "CEC — 2025/2026 articles" },
	{ needle: "world cup", note: "Hyundai World Cup (Amanda/Alen) — Shanghai 2025 article" },
	{ needle: "indoor world series", note: "IWS (Amanda winner) — 2025-12 articles" },
	{ needle: "european indoor championship", note: "EIC Plovdiv — 2026-02 articles" },
	{ needle: "european outdoor championship", note: "EC — quota article 2026-05-23" },
	{ needle: "european youth", note: "EYC/EYCh — youth squad" },
	{ needle: "european grand prix", note: "EGP — Amanda field/outdoor" },
	{ needle: "samobor grand prix", note: "Samobor GP — 2025-10 article (WA-listed CRO)" },
	{ needle: "kings of archery", note: "Kings of Archery / JVD Open Eindhoven — 2025-11-25 article" },
	{ needle: "gt open", note: "GT Open Luxembourg — 2025-11-25 article" },
];

type WaComp = {
	ID?: number | string;
	Name?: string;
	Place?: string;
	Country?: string;
	CountryName?: string;
	DFrom?: string;
	DTo?: string;
};

function isUpcoming(dFrom: string | undefined, today: Date): boolean {
	if (!dFrom) return false;
	const d = new Date(dFrom);
	return !Number.isNaN(d.getTime()) && d.getTime() >= today.getTime();
}

function matchedSeries(name: string): { needle: string; note: string } | null {
	const lower = name.toLowerCase();
	return ATTENDED_SERIES.find((s) => lower.includes(s.needle)) ?? null;
}

// Fetch the WA competitions feed (one large page; the feed is date-sorted-ish but
// we filter client-side). `rbp` = page size.
async function fetchWaCompetitions(rbp = 2000): Promise<WaComp[]> {
	const url = `https://api.worldarchery.sport/?content=COMPETITIONS&v=3&RBP=${rbp}`;
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`WA COMPETITIONS feed failed (${res.status})`);
	const data = (await res.json()) as { items?: WaComp[] } | WaComp[];
	return Array.isArray(data) ? data : (data.items ?? []);
}

const DISCIPLINE_FALLBACK = "outdoor"; // WA COMPETITIONS rows carry no clean discipline; admin can refine

// Shift an ISO datetime's year to 2027 (preserving month/day/time).
function toYear2027(d: Date): Date {
	const next = new Date(d);
	next.setUTCFullYear(2027);
	return next;
}

export async function importUpcomingWaEvents(opts?: {
	today?: Date;
	levelIds?: Map<string, string>;
}): Promise<{
	created: number;
	updated: number;
	kept: { name: string; date: string; place: string; via: string }[];
	projected: { name: string; date: string; via: string }[];
}> {
	const today = opts?.today ?? new Date(new Date().toISOString().slice(0, 10)); // midnight today
	const levelIds = opts?.levelIds;
	const comps = await fetchWaCompetitions();

	// All WA events matching an attended series (past + future), tagged.
	type Tagged = { c: WaComp; waId: string; name: string; match: { needle: string; note: string }; upcoming: boolean };
	const matched: Tagged[] = [];
	for (const c of comps) {
		const name = (c.Name ?? "").trim();
		const waId = c.ID != null ? String(c.ID) : null;
		if (!name || !waId || !c.DFrom) continue;
		const match = matchedSeries(name);
		if (!match) continue;
		matched.push({ c, waId, name, match, upcoming: isUpcoming(c.DFrom, today) });
	}

	// Which series already have a real FUTURE WA entry? (so we don't project a
	// duplicate). Keyed by the matched needle.
	const seriesWithFuture = new Set(matched.filter((m) => m.upcoming).map((m) => m.match.needle));

	const kept: { name: string; date: string; place: string; via: string }[] = [];
	const projected: { name: string; date: string; via: string }[] = [];
	let created = 0;
	let updated = 0;

	async function writeEvent(waId: string, name: string, dateFrom: Date, dateTo: Date | null, location: string | null, country: string | null): Promise<void> {
		const existing = await prisma.clubEvent.findUnique({ where: { waId } });
		// WA events are international (domestic: false); the level is derived mostly
		// from the NAME (World Cup / European …), with country as the rule-7 tiebreak.
		const levelName = deriveEventLevel({ name, country, domestic: false });
		const levelId = levelIds?.get(levelName) ?? null;
		const neutral = {
			waId,
			discipline: DISCIPLINE_FALLBACK,
			levelId,
			dateFrom,
			dateTo,
			location,
			sourceUrl: null,
			status: "published",
			hidden: false,
			isCancelled: false,
			hasUnlistedClubAttendee: true, // WA-series the club attends; specific roster set unknown here
			sourceLocale: "hr",
		};
		if (existing) {
			await prisma.clubEvent.update({ where: { id: existing.id }, data: neutral });
			updated++;
		} else {
			await prisma.clubEvent.create({ data: { ...neutral, translations: { create: [{ locale: "hr", name }] } } });
			created++;
		}
	}

	// 1) Import all UPCOMING matched events as-is.
	for (const m of matched.filter((x) => x.upcoming)) {
		const loc = m.c.Place ?? m.c.CountryName ?? m.c.Country ?? null;
		kept.push({ name: m.name, date: m.c.DFrom!.slice(0, 10), place: `${m.c.Place ?? "?"}, ${m.c.Country ?? m.c.CountryName ?? "?"}`, via: m.match.note });
		await writeEvent(m.waId, m.name, new Date(m.c.DFrom!), m.c.DTo ? new Date(m.c.DTo) : null, loc, m.c.Country ?? m.c.CountryName ?? null);
	}

	// 2) For attended series that have NO real future entry, project their most
	//    recent PASSED edition to 2027 (so a regular fixture isn't missing). Skip
	//    series WA already carries forward (avoids duplicate 2027 entries).
	const passedBySeries = new Map<string, Tagged>();
	for (const m of matched.filter((x) => !x.upcoming)) {
		if (seriesWithFuture.has(m.match.needle)) continue; // WA has a real future one
		const prev = passedBySeries.get(m.match.needle);
		if (!prev || new Date(m.c.DFrom!).getTime() > new Date(prev.c.DFrom!).getTime()) {
			passedBySeries.set(m.match.needle, m); // keep the most recent passed edition
		}
	}
	for (const m of passedBySeries.values()) {
		const projFrom = toYear2027(new Date(m.c.DFrom!));
		const projTo = m.c.DTo ? toYear2027(new Date(m.c.DTo)) : null;
		// Synthetic waId for a projected edition (real waId belongs to the past one).
		const projWaId = `proj2027-${m.waId}`;
		projected.push({ name: m.name, date: projFrom.toISOString().slice(0, 10), via: m.match.note });
		await writeEvent(projWaId, m.name, projFrom, projTo, m.c.Place ?? m.c.CountryName ?? m.c.Country ?? null, m.c.Country ?? m.c.CountryName ?? null);
	}

	return { created, updated, kept, projected };
}
