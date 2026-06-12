import { prisma } from "../db.ts";

// Assign per-event attending archers (the "Streličari" shown on the /schedule
// cards) by event LEVEL. Idempotent: clears each event's existing attendee links
// and re-assigns from the rules below, so re-running import-seed is stable.
//
// Rules (set with the user 2026-06-12):
//   Svjetski kup (global)      → Amanda Mlinarić + Alen Remar
//   Europsko prvenstvo (EU)    → Aurelia Mlinarić + a random subset of
//                                {Leo Sulik, Ela Drožđek, Alen Remar, Mia Međimurec}
//   Državno                    → 1–6 random from the pool EXCLUDING Amanda + Sulik
//                                (Alen IS allowed)
//   Domaće (local)             → 1–6 random from the pool EXCLUDING Alen, Amanda,
//                                Sulik; BUT leave 2 local events unlisted
//                                (no archers, hasUnlistedClubAttendee stays true)
//   Anything else / no level   → left as-is (unlisted)
//
// Only PUBLISHED archers are eligible (draft roster entries are excluded entirely).
// "Random" is a DETERMINISTIC seeded shuffle (no Math.random) keyed by event id, so
// the same archers are picked every import — stable, reviewable seed data.

// Named archers we key on explicitly (matched by full name to the roster).
const GLOBAL_NAMES = ["Amanda Mlinarić", "Alen Remar"];
const EU_FIXED = ["Aurelia Mlinarić"];
const EU_RANDOM_POOL = ["Leo Sulik", "Ela Drožđek", "Alen Remar", "Mia Međimurec"];
const EXCLUDE_LOCAL = new Set(["Alen Remar", "Amanda Mlinarić", "Leo Sulik"]);
const EXCLUDE_DRZAVNO = new Set(["Amanda Mlinarić", "Leo Sulik"]); // Alen allowed
const UNLISTED_LOCAL_COUNT = 2; // local events left with no named archers

// Deterministic PRNG (mulberry32) seeded from a string → reproducible per event.
function seedFrom(str: string): number {
	let h = 1779033703 ^ str.length;
	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return h >>> 0;
}
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
// Seeded Fisher–Yates shuffle of a copy.
function shuffle<T>(arr: T[], rng: () => number): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const tmp = a[i]!;
		a[i] = a[j]!;
		a[j] = tmp;
	}
	return a;
}

export async function assignEventAttendees(): Promise<{
	assigned: number;
	unlistedLocal: number;
}> {
	// ONLY published archers are eligible — draft/unpublished roster entries (no
	// real profile) must never be listed as event attendees.
	const archers = await prisma.archer.findMany({
		where: { status: "published" },
		select: { id: true, firstName: true, lastName: true },
	});
	const byName = new Map(archers.map((a) => [`${a.firstName} ${a.lastName}`, a.id]));
	const idsFor = (names: string[]) =>
		names.map((n) => byName.get(n)).filter((x): x is string => Boolean(x));

	// Pools (ids) for the random buckets.
	const localPool = archers
		.filter((a) => !EXCLUDE_LOCAL.has(`${a.firstName} ${a.lastName}`))
		.map((a) => a.id);
	const drzavnoPool = archers
		.filter((a) => !EXCLUDE_DRZAVNO.has(`${a.firstName} ${a.lastName}`))
		.map((a) => a.id);

	// All events with their resolved hr level name.
	const events = await prisma.clubEvent.findMany({
		include: { level: { include: { translations: true } } },
	});
	const levelName = (ev: (typeof events)[number]) =>
		ev.level?.translations.find((t) => t.locale === "hr")?.name ?? null;

	// Decide which local events stay unlisted: the first N by a stable sort (event
	// id) so it's deterministic and the same 2 every run.
	const localEventIds = events
		.filter((e) => levelName(e) === "Domaće")
		.map((e) => e.id)
		.sort();
	const unlistedLocalIds = new Set(localEventIds.slice(0, UNLISTED_LOCAL_COUNT));

	let assigned = 0;
	for (const ev of events) {
		const lvl = levelName(ev);
		const rng = mulberry32(seedFrom(ev.id));
		let archerIds: string[] = [];
		let unlisted = false;

		if (lvl === "Svjetski kup") {
			archerIds = idsFor(GLOBAL_NAMES);
		} else if (lvl === "Europsko prvenstvo") {
			// Aurelia + a random 1–4 subset of the EU random pool.
			const extra = shuffle(idsFor(EU_RANDOM_POOL), rng).slice(0, 1 + Math.floor(rng() * 4));
			archerIds = [...new Set([...idsFor(EU_FIXED), ...extra])];
		} else if (lvl === "Državno") {
			const n = 1 + Math.floor(rng() * 6); // 1..6
			archerIds = shuffle(drzavnoPool, rng).slice(0, n);
		} else if (lvl === "Domaće") {
			if (unlistedLocalIds.has(ev.id)) {
				unlisted = true; // leave with no archers
			} else {
				const n = 1 + Math.floor(rng() * 6); // 1..6
				archerIds = shuffle(localPool, rng).slice(0, n);
			}
		} else {
			continue; // no level / other → leave untouched
		}

		// Idempotent: replace the set; set hasUnlistedClubAttendee so the event stays
		// publicly visible (the public query needs >=1 archer OR this flag).
		await prisma.clubEvent.update({
			where: { id: ev.id },
			data: {
				attendingArchers: { set: archerIds.map((id) => ({ id })) },
				hasUnlistedClubAttendee: archerIds.length === 0 ? true : unlisted ? true : false,
			},
		});
		if (archerIds.length > 0) assigned++;
	}

	return { assigned, unlistedLocal: unlistedLocalIds.size };
}
