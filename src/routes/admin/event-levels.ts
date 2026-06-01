import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";

export const adminEventLevelsRouter = Router();

// EventLevel: admin-managed calendar-legend category. color = legend dot; name
// is translatable (hr source on create). Used by ClubEvent.level.
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #003DA5");

const createBody = z.object({
	color: hexColor,
	order: z.number().int(),
	name: z.string().min(1), // Croatian source
});

const updateBody = z.object({
	color: hexColor.optional(),
	order: z.number().int().optional(),
	name: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.uuid() });

adminEventLevelsRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const level = await prisma.eventLevel.create({
			data: {
				color: b.color,
				order: b.order,
				translations: { create: [{ locale: "hr", name: b.name }] },
			},
		});
		res.status(201).json({ id: level.id });
	} catch (err) {
		next(err);
	}
});

adminEventLevelsRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		if (!(await prisma.eventLevel.findUnique({ where: { id } }))) throw new HttpError(404, "Event level not found");

		await prisma.eventLevel.update({
			where: { id },
			data: {
				...(b.color !== undefined ? { color: b.color } : {}),
				...(b.order !== undefined ? { order: b.order } : {}),
			},
		});
		if (b.name !== undefined) {
			await prisma.eventLevelTranslation.upsert({
				where: { eventLevelId_locale: { eventLevelId: id, locale: "hr" } },
				create: { eventLevelId: id, locale: "hr", name: b.name },
				update: { name: b.name },
			});
		}
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// DELETE — note: ClubEvent.level uses onDelete: SetNull, so deleting a level
// just unsets it on any events using it (they survive, unleveled).
adminEventLevelsRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.eventLevel.findUnique({ where: { id } }))) throw new HttpError(404, "Event level not found");
		await prisma.eventLevel.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
