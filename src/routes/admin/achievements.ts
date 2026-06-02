import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { retranslateInBackground } from "../../translate/retranslate.ts";

export const adminAchievementsRouter = Router();

const scope = z.enum(["individual", "team", "club"]);
const level = z.enum(["world", "european", "state", "other"]);
const type = z.enum(["title", "record", "other"]);
const medal = z.enum(["gold", "silver", "bronze"]).nullable().default(null);

const createBody = z.object({
	year: z.number().int(),
	archerIds: z.array(z.uuid()).default([]), // empty = club-level
	scope,
	level,
	type,
	medal,
	imageUrl: z.url().nullable().default(null),
	imageAlt: z.string().min(1).nullable().default(null),
	title: z.string().min(1), // Croatian source
});

const updateBody = z.object({
	year: z.number().int().optional(),
	archerIds: z.array(z.uuid()).optional(),
	scope: scope.optional(),
	level: level.optional(),
	type: type.optional(),
	medal: z.enum(["gold", "silver", "bronze"]).nullable().optional(),
	imageUrl: z.url().nullable().optional(),
	imageAlt: z.string().min(1).nullable().optional(),
	title: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.uuid() });

// POST /admin/achievements
adminAchievementsRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const a = await prisma.achievement.create({
			data: {
				year: b.year,
				scope: b.scope,
				level: b.level,
				type: b.type,
				medal: b.medal,
				imageUrl: b.imageUrl,
				imageAlt: b.imageAlt,
				sourceLocale: "hr",
				archers: { connect: b.archerIds.map((id) => ({ id })) },
				translations: { create: [{ locale: "hr", title: b.title }] },
			},
		});
		res.status(201).json({ id: a.id });
		retranslateInBackground("achievement");
	} catch (err) {
		next(err);
	}
});

// PATCH /admin/achievements/:id
adminAchievementsRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		if (!(await prisma.achievement.findUnique({ where: { id } }))) throw new HttpError(404, "Achievement not found");

		await prisma.achievement.update({
			where: { id },
			data: {
				...(b.year !== undefined ? { year: b.year } : {}),
				...(b.scope !== undefined ? { scope: b.scope } : {}),
				...(b.level !== undefined ? { level: b.level } : {}),
				...(b.type !== undefined ? { type: b.type } : {}),
				...(b.medal !== undefined ? { medal: b.medal } : {}),
				...(b.imageUrl !== undefined ? { imageUrl: b.imageUrl } : {}),
				...(b.imageAlt !== undefined ? { imageAlt: b.imageAlt } : {}),
				// `set` replaces the whole M:N list with the given archers.
				...(b.archerIds !== undefined ? { archers: { set: b.archerIds.map((aid) => ({ id: aid })) } } : {}),
			},
		});

		if (b.title !== undefined) {
			await prisma.achievementTranslation.upsert({
				where: { achievementId_locale: { achievementId: id, locale: "hr" } },
				create: { achievementId: id, locale: "hr", title: b.title },
				update: { title: b.title },
			});
		}
		res.json({ ok: true });
		if (b.title !== undefined) retranslateInBackground("achievement");
	} catch (err) {
		next(err);
	}
});

// DELETE /admin/achievements/:id
adminAchievementsRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.achievement.findUnique({ where: { id } }))) throw new HttpError(404, "Achievement not found");
		await prisma.achievement.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
