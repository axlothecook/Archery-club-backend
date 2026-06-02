import { Router } from "express";
import { prisma } from "../db.ts";
import { resolveLevel } from "../mappers/club-event.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";

export const eventLevelsRouter = Router();

// GET /event-levels?locale=hr — the calendar legend: every event level resolved
// to { id, name, color }, ordered by the legend `order`.
eventLevelsRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.eventLevel.findMany({
			include: { translations: true },
			orderBy: { order: "asc" },
		});
		res.json(
			safeMapList(rows, (row) => resolveLevel(row, locale), "eventLevel", (r) => r.id),
		);
	} catch (err) {
		next(err);
	}
});
