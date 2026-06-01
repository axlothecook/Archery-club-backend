import { Router } from "express";
import { prisma } from "../db.ts";
import { toArcherCard, toArcherProfile } from "../mappers/archer.ts";
import { localeFromQuery } from "../http/locale.ts";
import { HttpError } from "../http/errors.ts";
import { safeMapList } from "../http/safe-map.ts";

export const teamRouter = Router();

// GET /team — roster cards (published, not hidden). Ordered by manual order;
// the front-end groups into bow sections by PRIMARY bow (bowType[0]). bowType is
// a list (archers can compete in multiple styles) so it can't be a DB sort key.
// (No locale needed: cards carry no translatable text.)
teamRouter.get("/", async (_req, res, next) => {
	try {
		const rows = await prisma.archer.findMany({
			where: { status: "published", hidden: false },
			orderBy: [{ order: "asc" }],
		});
		res.json(safeMapList(rows, toArcherCard, "archer", (r) => r.id));
	} catch (err) {
		next(err);
	}
});

// GET /team/:slug?locale=hr — full profile for one archer.
teamRouter.get("/:slug", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row = await prisma.archer.findFirst({
			where: { slug: req.params.slug, status: "published", hidden: false },
			include: {
				translations: true,
				careerStats: true,
				performance: true,
				coaches: true,
				students: true,
			},
		});
		if (!row) throw new HttpError(404, "Archer not found");
		res.json(toArcherProfile(row, locale));
	} catch (err) {
		next(err);
	}
});
