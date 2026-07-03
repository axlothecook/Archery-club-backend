import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";

// POST /admin/client-errors — a "report a problem" report from the dashboard UI.
// When a widget can't load its data it degrades (still renders + shows a warning)
// and posts the failure here. Stored for developer triage; a dev-only view listing
// these is deferred to adoption (see memory). Auth-guarded by app.use('/admin',
// requireAuth) so only signed-in admins can write. Deliberately minimal + tolerant.
export const adminClientErrorsRouter = Router();

const reportBody = z.object({
	context: z.string().min(1).max(200),
	message: z.string().min(1).max(2000),
	url: z.string().max(500).nullable().default(null),
});

adminClientErrorsRouter.post("/", validate({ body: reportBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof reportBody>;
		await prisma.clientErrorReport.create({
			data: { context: b.context, message: b.message, url: b.url },
		});
		res.status(201).json({ ok: true });
	} catch (err) {
		next(err);
	}
});
