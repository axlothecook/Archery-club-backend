import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";

// Import the calendar-legend event levels (seed-data/event-levels.json) into
// EventLevel + EventLevelTranslation rows. The hr `name` is the stable match key
// (it lives in the translation table, so we match an existing level by its hr
// name, then create/update). Idempotent. Ignores _-prefixed annotation fields.
// Returns the resolved name -> id map so the event importers can link events to
// their level by name.

type SeedLevel = { name: string; color: string; order: number };

const PATH = join(process.cwd(), "seed-data", "event-levels.json");

export async function importEventLevels(): Promise<{
	upserted: number;
	nameToId: Map<string, string>;
}> {
	const raw = JSON.parse(readFileSync(PATH, "utf8")) as { eventLevels: SeedLevel[] };
	const levels = raw.eventLevels;

	const nameToId = new Map<string, string>();
	let upserted = 0;

	for (const l of levels) {
		// Match an existing level by its hr translation name.
		const existingTr = await prisma.eventLevelTranslation.findFirst({
			where: { locale: "hr", name: l.name },
			select: { eventLevelId: true },
		});

		if (existingTr) {
			await prisma.eventLevel.update({
				where: { id: existingTr.eventLevelId },
				data: { color: l.color, order: l.order },
			});
			nameToId.set(l.name, existingTr.eventLevelId);
		} else {
			const created = await prisma.eventLevel.create({
				data: {
					color: l.color,
					order: l.order,
					translations: { create: [{ locale: "hr", name: l.name }] },
				},
			});
			nameToId.set(l.name, created.id);
		}
		upserted++;
	}

	return { upserted, nameToId };
}
