import { Router } from "express";
import { prisma } from "../db.ts";
import { toClubHistoryPeriodResolved } from "../mappers/club-history.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";
import { HttpError } from "../http/errors.ts";

export const clubHistoryRouter = Router();

// GET /club-history?locale=hr — the ordered grid of history period cards,
// resolved to the requested locale. Foundation first (by `order`).
clubHistoryRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.clubHistoryPeriod.findMany({
			include: { translations: true },
			orderBy: { order: "asc" },
		});
		res.json(
			safeMapList(
				rows,
				(row) => toClubHistoryPeriodResolved(row, locale),
				"clubHistoryPeriod",
				(r) => r.id,
			),
		);
	} catch (err) {
		next(err); // → global error middleware
	}
});

// GET /club-history/:slug?locale=hr — one history period's detail page.
clubHistoryRouter.get("/:slug", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row = await prisma.clubHistoryPeriod.findUnique({
			where: { slug: req.params.slug },
			include: { translations: true },
		});
		if (!row) throw new HttpError(404, "History period not found");
		res.json(toClubHistoryPeriodResolved(row, locale));
	} catch (err) {
		next(err);
	}
});
