import { Router } from "express";
import { prisma } from "../db.ts";
import { toSponsorResolved } from "../mappers/sponsor.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";

export const sponsorsRouter = Router();

// GET /sponsors?locale=hr — all sponsors, resolved to the requested locale.
sponsorsRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.sponsor.findMany({
			include: { translations: true },
		});
		res.json(safeMapList(rows, (row) => toSponsorResolved(row, locale), "sponsor", (r) => r.id));
	} catch (err) {
		next(err); // → global error middleware
	}
});
