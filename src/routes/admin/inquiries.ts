import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { sendEmail } from "../../email/index.ts";

// ADMIN inquiry inboxes (protected via /admin mount). List, update workflow
// status, and reply (Brevo email → marks responded). One router covers the 3
// near-identical inbox types via a shared factory.
export const adminInquiriesRouter = Router();

const idParam = z.object({ id: z.uuid() });
const statusBody = z.object({ status: z.enum(["new", "read", "archived"]) });
const replyBody = z.object({ subject: z.string().min(1), text: z.string().min(1) });

type Delegate = {
	findMany: (a: object) => Promise<unknown[]>;
	findUnique: (a: object) => Promise<{ email: string } | null>;
	update: (a: object) => Promise<unknown>;
};

function mountInbox(path: string, delegate: Delegate) {
	// GET /admin/inquiries/<type> — newest first.
	adminInquiriesRouter.get(`/${path}`, async (_req, res, next) => {
		try {
			res.json(await delegate.findMany({ orderBy: { submittedAt: "desc" } }));
		} catch (err) {
			next(err);
		}
	});

	// PATCH /admin/inquiries/<type>/:id — set workflow status.
	adminInquiriesRouter.patch(`/${path}/:id`, validate({ params: idParam, body: statusBody }), async (req, res, next) => {
		try {
			const { id } = req.params as z.infer<typeof idParam>;
			const { status } = req.body as z.infer<typeof statusBody>;
			if (!(await delegate.findUnique({ where: { id } }))) throw new HttpError(404, "Inquiry not found");
			await delegate.update({ where: { id }, data: { status } });
			res.json({ ok: true });
		} catch (err) {
			next(err);
		}
	});

	// POST /admin/inquiries/<type>/:id/reply — email the submitter (Brevo) and
	// mark responded. (Logs to console until BREVO_API_KEY is set.)
	adminInquiriesRouter.post(`/${path}/:id/reply`, validate({ params: idParam, body: replyBody }), async (req, res, next) => {
		try {
			const { id } = req.params as z.infer<typeof idParam>;
			const { subject, text } = req.body as z.infer<typeof replyBody>;
			const inquiry = await delegate.findUnique({ where: { id } });
			if (!inquiry) throw new HttpError(404, "Inquiry not found");
			await sendEmail({ to: inquiry.email, subject, text });
			await delegate.update({ where: { id }, data: { responded: true, status: "read" } });
			res.json({ ok: true });
		} catch (err) {
			next(err);
		}
	});
}

mountInbox("membership", prisma.membershipSubmission as unknown as Delegate);
mountInbox("sponsor", prisma.sponsorInquiry as unknown as Delegate);
mountInbox("donation", prisma.donationInquiry as unknown as Delegate);
