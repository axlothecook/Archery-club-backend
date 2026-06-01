import { Router } from "express";
import { prisma } from "../db.ts";
import { toClubInfoResolved } from "../mappers/club-info.ts";
import { localeFromQuery } from "../http/locale.ts";
import { HttpError } from "../http/errors.ts";

export const clubInfoRouter = Router();

// GET /club-info?locale=hr — the club info singleton, resolved to the locale.
clubInfoRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row = await prisma.clubInfo.findFirst({
			include: { translations: true, historyPhotos: true },
		});
		if (!row) throw new HttpError(404, "Club info not configured");
		res.json(toClubInfoResolved(row, locale));
	} catch (err) {
		next(err);
	}
});
