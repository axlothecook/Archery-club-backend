// World Archery import: fetch an athlete's results from WA's public JSON API
// (no token) and map the cryptic WA fields → a clean shape. The 3 club WA
// archers are the source of truth for the club's GLOBAL events (they attend all
// global matches the club attends), so we merge their events into one deduped set.
// See [[archery-research-findings]] for the field mapping + archer ids.

export const CLUB_WA_ARCHER_IDS = ["17411", "15290", "30434"] as const; // Amanda, Alen, Leo

// One global event (a competition the archer participated in), cleaned.
export type WaEvent = {
	waId: string; // WA competition id (Id)
	name: string; // Name
	level: string | null; // ComLevelDescr (World Cup, European Champ, …)
	discipline: string | null; // ComDisDescr (Outdoor/Indoor/Field/3D)
	country: string | null; // CountryName
	dateFrom: string | null; // DFrom (ISO if parseable)
	dateTo: string | null; // DTo
};

type WaResultRow = {
	Id?: number | string;
	Name?: string;
	ComLevelDescr?: string;
	ComDisDescr?: string;
	CountryName?: string;
	DFrom?: string;
	DTo?: string;
};

function toIso(d: string | undefined): string | null {
	if (!d) return null;
	const parsed = new Date(d);
	return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

// Fetch + clean one athlete's results. RBP = result page size (larger = more).
export async function fetchAthleteEvents(waId: string, opts?: { endDate?: string; rbp?: number }): Promise<WaEvent[]> {
	const endDate = opts?.endDate ?? new Date().toISOString().slice(0, 10);
	const rbp = opts?.rbp ?? 50;
	const url =
		`https://api.worldarchery.sport/?Id=${encodeURIComponent(waId)}` +
		`&Detailed=1&IndividualTeam=1&EndDate=${endDate}&content=ATHLETERESULTS&v=3&RBP=${rbp}`;

	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) throw new Error(`WA API failed for ${waId} (${res.status})`);
	const data = (await res.json()) as { items?: WaResultRow[] } | WaResultRow[];

	// Real WA response shape: { pageInfo, items: [...] }. Be defensive in case a
	// bare array is ever returned.
	const rows: WaResultRow[] = Array.isArray(data) ? data : (data.items ?? []);
	return rows
		.filter((r) => r.Id != null && r.Name)
		.map((r) => ({
			waId: String(r.Id),
			name: String(r.Name),
			level: r.ComLevelDescr ?? null,
			discipline: r.ComDisDescr ?? null,
			country: r.CountryName ?? null,
			dateFrom: toIso(r.DFrom),
			dateTo: toIso(r.DTo),
		}));
}

// A club global event + which of our WA archers attended it (by WA archer id).
export type WaClubEvent = WaEvent & { attendingWaIds: string[] };

// The club's global event set = union of the 3 truth-source archers' events,
// deduplicated by WA competition id, each tagged with who attended.
export async function fetchClubGlobalEvents(
	archerIds: readonly string[] = CLUB_WA_ARCHER_IDS,
): Promise<WaClubEvent[]> {
	const perArcher = await Promise.all(
		archerIds.map(async (id) => ({ id, events: await fetchAthleteEvents(id).catch(() => []) })),
	);
	const byEvent = new Map<string, WaClubEvent>();
	for (const { id, events } of perArcher) {
		for (const ev of events) {
			const existing = byEvent.get(ev.waId);
			if (existing) {
				if (!existing.attendingWaIds.includes(id)) existing.attendingWaIds.push(id);
			} else {
				byEvent.set(ev.waId, { ...ev, attendingWaIds: [id] });
			}
		}
	}
	return [...byEvent.values()];
}
