import { Router } from "express";
import { prisma } from "../db.ts";
import { toClubIdentitySectionResolved } from "../mappers/club-identity.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";
import { HttpError } from "../http/errors.ts";

export const clubIdentityRouter = Router();

// GET /club-identity?locale=hr — the ordered identity sub-pages (Values, Crest,
// Jersey), resolved to the requested locale. Values first (by `order`); the
// `isDefault` flag marks the page shown at the bare /club/identity landing.
clubIdentityRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.clubIdentitySection.findMany({
			include: { translations: true },
			orderBy: { order: "asc" },
		});
		res.json(
			safeMapList(
				rows,
				(row) => toClubIdentitySectionResolved(row, locale),
				"clubIdentitySection",
				(r) => r.id,
			),
		);
	} catch (err) {
		next(err); // → global error middleware
	}
});

// GET /club-identity/default?locale=hr — the default landing section (Values).
// Defined before /:slug so "default" is not treated as a slug.
clubIdentityRouter.get("/default", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row =
			(await prisma.clubIdentitySection.findFirst({
				where: { isDefault: true },
				include: { translations: true },
			})) ??
			(await prisma.clubIdentitySection.findFirst({
				include: { translations: true },
				orderBy: { order: "asc" },
			}));
		if (!row) throw new HttpError(404, "No identity sections configured");
		res.json(toClubIdentitySectionResolved(row, locale));
	} catch (err) {
		next(err);
	}
});

// GET /club-identity/:slug?locale=hr — one identity sub-page (values | crest | jersey).
clubIdentityRouter.get("/:slug", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row = await prisma.clubIdentitySection.findUnique({
			where: { slug: req.params.slug },
			include: { translations: true },
		});
		if (!row) throw new HttpError(404, "Identity section not found");
		res.json(toClubIdentitySectionResolved(row, locale));
	} catch (err) {
		next(err);
	}
});
