import { prisma } from "../db.ts";
import { fetchClubGlobalEvents, type WaClubEvent } from "./world-archery.ts";

// Map World Archery's discipline label → our enum. Unknown values are flagged
// (logged) and the event still imports with discipline 'outdoor' as a safe
// default for admin review — we don't silently guess a wrong value.
const DISCIPLINE_MAP: Record<string, "outdoor" | "indoor" | "field" | "3d"> = {
	"outdoor archery": "outdoor",
	"indoor archery": "indoor",
	"field archery": "field",
	"3d archery": "3d",
};

function mapDiscipline(waDescr: string | null): "outdoor" | "indoor" | "field" | "3d" {
	const key = (waDescr ?? "").trim().toLowerCase();
	const mapped = DISCIPLINE_MAP[key];
	if (!mapped) {
		console.warn(`[wa-import] unknown discipline "${waDescr}" — defaulting to 'outdoor' (review)`);
		return "outdoor";
	}
	return mapped;
}

// Import the club's global events from World Archery into ClubEvent rows.
// Idempotent: upserts by waId. Links attending archers (WA archer id →
// our Archer via worldArcheryId). Imported as published (recovered rule).
// Returns a summary for logging.
export async function importWorldArcheryEvents(): Promise<{ created: number; updated: number; events: number }> {
	const events: WaClubEvent[] = await fetchClubGlobalEvents();

	// Map our archers' worldArcheryId → our Archer id, once.
	const archers = await prisma.archer.findMany({
		where: { worldArcheryId: { not: null } },
		select: { id: true, worldArcheryId: true },
	});
	const waToArcherId = new Map(archers.map((a) => [a.worldArcheryId as string, a.id]));

	let created = 0;
	let updated = 0;

	for (const ev of events) {
		const attendingArcherIds = ev.attendingWaIds
			.map((waId) => waToArcherId.get(waId))
			.filter((id): id is string => Boolean(id));

		const existing = await prisma.clubEvent.findUnique({ where: { waId: ev.waId } });

		const neutral = {
			waId: ev.waId,
			discipline: mapDiscipline(ev.discipline),
			dateFrom: ev.dateFrom ? new Date(ev.dateFrom) : new Date(),
			dateTo: ev.dateTo ? new Date(ev.dateTo) : null,
			location: ev.country,
			sourceUrl: null,
			status: "published",
			hidden: false,
			isCancelled: false,
			hasUnlistedClubAttendee: false,
			sourceLocale: "hr",
		};

		if (existing) {
			await prisma.clubEvent.update({
				where: { id: existing.id },
				data: {
					...neutral,
					attendingArchers: { set: attendingArcherIds.map((id) => ({ id })) },
				},
			});
			updated++;
		} else {
			await prisma.clubEvent.create({
				data: {
					...neutral,
					attendingArchers: { connect: attendingArcherIds.map((id) => ({ id })) },
					translations: { create: [{ locale: "hr", name: ev.name }] },
				},
			});
			created++;
		}
	}

	return { created, updated, events: events.length };
}
