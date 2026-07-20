import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { toEventAdminRow, toEventEditData } from "../../mappers/club-event.ts";
import { safeMapList } from "../../http/safe-map.ts";

export const adminEventsRouter = Router();

const discipline = z.enum(["outdoor", "indoor", "field", "3d"]);

const createBody = z.object({
	discipline,
	format: z.string().min(1).nullable().default(null),
	dateFrom: z.coerce.date(), // accepts ISO string → Date
	dateTo: z.coerce.date().nullable().default(null),
	imageUrl: z.url().nullable().default(null),
	imageAlt: z.string().min(1).nullable().default(null),
	sourceUrl: z.url().nullable().default(null),
	isCancelled: z.boolean().default(false),
	status: z.enum(["draft", "published"]).default("draft"),
	hidden: z.boolean().default(false),
	location: z.string().min(1).nullable().default(null),
	organizer: z.string().min(1).nullable().default(null),
	levelId: z.uuid().nullable().default(null),
	attendingArcherIds: z.array(z.uuid()).default([]),
	hasUnlistedClubAttendee: z.boolean().default(false),
	name: z.string().min(1), // Croatian source
});

const updateBody = z.object({
	discipline: discipline.optional(),
	format: z.string().min(1).nullable().optional(),
	dateFrom: z.coerce.date().optional(),
	dateTo: z.coerce.date().nullable().optional(),
	imageUrl: z.url().nullable().optional(),
	imageAlt: z.string().min(1).nullable().optional(),
	sourceUrl: z.url().nullable().optional(),
	isCancelled: z.boolean().optional(),
	status: z.enum(["draft", "published"]).optional(),
	hidden: z.boolean().optional(),
	location: z.string().min(1).nullable().optional(),
	organizer: z.string().min(1).nullable().optional(),
	levelId: z.uuid().nullable().optional(),
	attendingArcherIds: z.array(z.uuid()).optional(),
	hasUnlistedClubAttendee: z.boolean().optional(),
	name: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.uuid() });

// GET /admin/events?status=published|draft — the dashboard's event LIST (Svi
// događaji). Auth-guarded by app.use('/admin', requireAuth). Unlike the PUBLIC
// GET /events (which hard-filters to published, non-hidden, club-attended), this
// returns EVERY event incl. drafts + hidden. Admin-only DTO (toEventAdminRow) so
// no admin fields leak publicly. Ordered by dateFrom desc (upcoming/newest first).
// status read from req.query directly (validate's query branch reassigns req.query,
// read-only in Express 5).
adminEventsRouter.get("/", async (req, res, next) => {
	try {
		const raw = req.query["status"];
		const status = raw === "draft" || raw === "published" ? raw : undefined;
		const rows = await prisma.clubEvent.findMany({
			where: status ? { status } : {},
			include: {
				translations: true,
				attendingArchers: true,
				level: { include: { translations: true } },
			},
			orderBy: { dateFrom: "desc" },
		});
		res.json(safeMapList(rows, toEventAdminRow, "event-admin-row", (r) => r.id));
	} catch (err) {
		next(err);
	}
});

// GET /admin/events/:id — the FULL event for the dashboard EDIT form (every editable
// field incl. attending archer IDs, HR source name). Auth-guarded. 404 if not found.
// Distinct method from PATCH/DELETE /:id so no route conflict. Admin-only DTO
// (toEventEditData). Mirrors GET /admin/articles/:id.
adminEventsRouter.get("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const row = await prisma.clubEvent.findUnique({
			where: { id },
			include: {
				translations: true,
				attendingArchers: true,
				level: { include: { translations: true } },
			},
		});
		if (!row) throw new HttpError(404, "Event not found");
		res.json(toEventEditData(row));
	} catch (err) {
		next(err);
	}
});

adminEventsRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const ev = await prisma.clubEvent.create({
			data: {
				discipline: b.discipline,
				format: b.format,
				dateFrom: b.dateFrom,
				dateTo: b.dateTo,
				imageUrl: b.imageUrl,
				imageAlt: b.imageAlt,
				sourceUrl: b.sourceUrl,
				isCancelled: b.isCancelled,
				status: b.status,
				hidden: b.hidden,
				location: b.location,
				organizer: b.organizer,
				hasUnlistedClubAttendee: b.hasUnlistedClubAttendee,
				sourceLocale: "hr",
				...(b.levelId ? { level: { connect: { id: b.levelId } } } : {}),
				attendingArchers: { connect: b.attendingArcherIds.map((id) => ({ id })) },
				translations: { create: [{ locale: "hr", name: b.name }] },
			},
		});
		res.status(201).json({ id: ev.id });
	} catch (err) {
		next(err);
	}
});

adminEventsRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		if (!(await prisma.clubEvent.findUnique({ where: { id } }))) throw new HttpError(404, "Event not found");

		await prisma.clubEvent.update({
			where: { id },
			data: {
				...(b.discipline !== undefined ? { discipline: b.discipline } : {}),
				...(b.format !== undefined ? { format: b.format } : {}),
				...(b.dateFrom !== undefined ? { dateFrom: b.dateFrom } : {}),
				...(b.dateTo !== undefined ? { dateTo: b.dateTo } : {}),
				...(b.imageUrl !== undefined ? { imageUrl: b.imageUrl } : {}),
				...(b.imageAlt !== undefined ? { imageAlt: b.imageAlt } : {}),
				...(b.sourceUrl !== undefined ? { sourceUrl: b.sourceUrl } : {}),
				...(b.isCancelled !== undefined ? { isCancelled: b.isCancelled } : {}),
				...(b.status !== undefined ? { status: b.status } : {}),
				...(b.hidden !== undefined ? { hidden: b.hidden } : {}),
				...(b.location !== undefined ? { location: b.location } : {}),
				...(b.organizer !== undefined ? { organizer: b.organizer } : {}),
				...(b.hasUnlistedClubAttendee !== undefined ? { hasUnlistedClubAttendee: b.hasUnlistedClubAttendee } : {}),
				// levelId: connect when given, disconnect when explicitly null
				...(b.levelId !== undefined
					? b.levelId === null
						? { level: { disconnect: true } }
						: { level: { connect: { id: b.levelId } } }
					: {}),
				...(b.attendingArcherIds !== undefined
					? { attendingArchers: { set: b.attendingArcherIds.map((aid) => ({ id: aid })) } }
					: {}),
			},
		});
		if (b.name !== undefined) {
			await prisma.clubEventTranslation.upsert({
				where: { clubEventId_locale: { clubEventId: id, locale: "hr" } },
				create: { clubEventId: id, locale: "hr", name: b.name },
				update: { name: b.name },
			});
		}
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

adminEventsRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.clubEvent.findUnique({ where: { id } }))) throw new HttpError(404, "Event not found");
		await prisma.clubEvent.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
