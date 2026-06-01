import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";

export const adminHeroRouter = Router();

// HeroImage: homepage cursor-image hero. Image-only, ordered. No i18n.
const createBody = z.object({
	imageUrl: z.url(),
	imageAlt: z.string().min(1),
	order: z.number().int(),
});
const updateBody = z.object({
	imageUrl: z.url().optional(),
	imageAlt: z.string().min(1).optional(),
	order: z.number().int().optional(),
});
const idParam = z.object({ id: z.uuid() });

adminHeroRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const h = await prisma.heroImage.create({ data: b });
		res.status(201).json({ id: h.id });
	} catch (err) {
		next(err);
	}
});

adminHeroRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		if (!(await prisma.heroImage.findUnique({ where: { id } }))) throw new HttpError(404, "Hero image not found");
		await prisma.heroImage.update({ where: { id }, data: b });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

adminHeroRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.heroImage.findUnique({ where: { id } }))) throw new HttpError(404, "Hero image not found");
		await prisma.heroImage.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
