import { Router } from "express";
import { prisma } from "../db.ts";
import { toClubEventResolved } from "../mappers/club-event.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";

export const eventsRouter = Router();

// GET /events?locale=hr — public events, resolved to the requested locale.
// Public visibility: published, not hidden, and the club actually attended
// (>=1 named roster archer OR an unlisted club member). Ordered by start date.
eventsRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.clubEvent.findMany({
			where: {
				status: "published",
				hidden: false,
				OR: [
					{ attendingArchers: { some: {} } },
					{ hasUnlistedClubAttendee: true },
				],
			},
			include: {
				translations: true,
				attendingArchers: true,
				level: { include: { translations: true } },
			},
			orderBy: { dateFrom: "asc" },
		});
		res.json(safeMapList(rows, (row) => toClubEventResolved(row, locale), "clubEvent", (r) => r.id));
	} catch (err) {
		next(err);
	}
});
