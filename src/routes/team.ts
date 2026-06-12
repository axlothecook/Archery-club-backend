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

// GET /team/cards?slugs=a,b,c — roster cards for a SPECIFIC set of archers (by
// slug), not the whole roster. Used by the news-article page to show the cards of
// the archers mentioned in an article. Returns ArcherCard[] in the requested order;
// unknown/hidden slugs are silently dropped. (Declared BEFORE /:slug so "cards"
// isn't swallowed by the slug param.)
teamRouter.get("/cards", async (req, res, next) => {
	try {
		const raw = req.query["slugs"];
		const slugs =
			typeof raw === "string"
				? raw.split(",").map((s) => s.trim()).filter(Boolean)
				: [];
		if (slugs.length === 0) {
			res.json([]);
			return;
		}
		const rows = await prisma.archer.findMany({
			where: { slug: { in: slugs }, status: "published", hidden: false },
		});
		const cards = safeMapList(rows, toArcherCard, "archer", (r) => r.id);
		// preserve the requested slug order
		const bySlug = new Map(cards.map((c) => [c.slug, c]));
		res.json(slugs.map((s) => bySlug.get(s)).filter(Boolean));
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
				achievements: { include: { translations: true } },
			},
		});
		if (!row) throw new HttpError(404, "Archer not found");
		res.json(toArcherProfile(row, locale));
	} catch (err) {
		next(err);
	}
});
