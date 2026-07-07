import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { retranslateInBackground } from "../../translate/retranslate.ts";
import { toSponsorAdminRow } from "../../mappers/sponsor.ts";
import { safeMapList } from "../../http/safe-map.ts";

export const adminSponsorsRouter = Router();

// Create: writes the Sponsor + the Croatian (source) translation row only;
// other locales are backfilled by the translate pipeline later (reads fall back
// to hr meanwhile). description is the translatable text (required).
const createBody = z.object({
	name: z.string().min(1),
	logoUrl: z.url(),
	logoAlt: z.string().min(1),
	website: z.url().nullable().default(null),
	description: z.string().min(1), // Croatian source
});

const updateBody = z.object({
	name: z.string().min(1).optional(),
	logoUrl: z.url().optional(),
	logoAlt: z.string().min(1).optional(),
	website: z.url().nullable().optional(),
	description: z.string().min(1).optional(), // updates the hr translation
});

const idParam = z.object({ id: z.uuid() });

// GET /admin/sponsors — the dashboard's sponsor LIST (Svi sponzori). Auth-guarded.
// Admin DTO (HR description). Ordered by name.
adminSponsorsRouter.get("/", async (_req, res, next) => {
	try {
		const rows = await prisma.sponsor.findMany({
			include: { translations: true },
			orderBy: { name: "asc" },
		});
		res.json(safeMapList(rows, toSponsorAdminRow, "sponsor-admin-row", (r) => r.id));
	} catch (err) {
		next(err);
	}
});

// GET /admin/sponsors/:id — the FULL sponsor for the dashboard EDIT form. 404 if not
// found. Distinct method from PATCH/DELETE /:id so no route conflict. Same admin DTO
// (it already carries every editable field).
adminSponsorsRouter.get("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const row = await prisma.sponsor.findUnique({
			where: { id },
			include: { translations: true },
		});
		if (!row) throw new HttpError(404, "Sponsor not found");
		res.json(toSponsorAdminRow(row));
	} catch (err) {
		next(err);
	}
});

// POST /admin/sponsors
adminSponsorsRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const sponsor = await prisma.sponsor.create({
			data: {
				name: b.name,
				logoUrl: b.logoUrl,
				logoAlt: b.logoAlt,
				website: b.website,
				sourceLocale: "hr",
				translations: { create: [{ locale: "hr", description: b.description }] },
			},
		});
		res.status(201).json({ id: sponsor.id });
		retranslateInBackground("sponsor"); // fire-and-forget: backfill target locales
	} catch (err) {
		next(err);
	}
});

// PATCH /admin/sponsors/:id
adminSponsorsRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;

		const exists = await prisma.sponsor.findUnique({ where: { id } });
		if (!exists) throw new HttpError(404, "Sponsor not found");

		await prisma.sponsor.update({
			where: { id },
			data: {
				...(b.name !== undefined ? { name: b.name } : {}),
				...(b.logoUrl !== undefined ? { logoUrl: b.logoUrl } : {}),
				...(b.logoAlt !== undefined ? { logoAlt: b.logoAlt } : {}),
				...(b.website !== undefined ? { website: b.website } : {}),
			},
		});

		// description edits the hr translation row (upsert in case it's missing).
		if (b.description !== undefined) {
			await prisma.sponsorTranslation.upsert({
				where: { sponsorId_locale: { sponsorId: id, locale: "hr" } },
				create: { sponsorId: id, locale: "hr", description: b.description },
				update: { description: b.description },
			});
		}
		res.json({ ok: true });
		if (b.description !== undefined) retranslateInBackground("sponsor"); // re-translate only if hr text changed
	} catch (err) {
		next(err);
	}
});

// DELETE /admin/sponsors/:id — hard delete (cascade removes translations).
adminSponsorsRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const exists = await prisma.sponsor.findUnique({ where: { id } });
		if (!exists) throw new HttpError(404, "Sponsor not found");
		await prisma.sponsor.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
