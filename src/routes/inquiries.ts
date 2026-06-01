import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.ts";
import { validate } from "../http/validate.ts";
import { inquiryRateLimit, spamGuard } from "../http/spam.ts";

// PUBLIC inquiry intake (unauthenticated). Each POST is rate-limited +
// spam-guarded (honeypot + Turnstile). Stored as status 'new'. The control
// fields _hp + turnstileToken are validated loosely (stripped by spamGuard).
export const inquiriesRouter = Router();

const spam = { _hp: z.string().optional(), turnstileToken: z.string().optional() };

const membershipBody = z.object({
	salutation: z.string().min(1).nullable().default(null),
	fullName: z.string().min(1),
	email: z.email(),
	phone: z.string().min(1).nullable().default(null),
	birthDate: z.coerce.date().nullable().default(null),
	experience: z.string().min(1).nullable().default(null),
	forMinor: z.boolean().default(false),
	minorDetails: z.string().min(1).nullable().default(null),
	message: z.string().min(1).nullable().default(null),
	consentAccepted: z.literal(true), // must accept GDPR consent
	...spam,
});

const sponsorBody = z.object({
	companyName: z.string().min(1),
	contactName: z.string().min(1),
	email: z.email(),
	phone: z.string().min(1).nullable().default(null),
	sponsorshipInterest: z.string().min(1).nullable().default(null),
	message: z.string().min(1).nullable().default(null),
	consentAccepted: z.literal(true),
	...spam,
});

const donationBody = z.object({
	donorName: z.string().min(1),
	email: z.email(),
	phone: z.string().min(1).nullable().default(null),
	message: z.string().min(1).nullable().default(null),
	consentAccepted: z.literal(true),
	...spam,
});

inquiriesRouter.post("/membership", inquiryRateLimit, validate({ body: membershipBody }), spamGuard, async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof membershipBody>;
		await prisma.membershipSubmission.create({
			data: {
				salutation: b.salutation, fullName: b.fullName, email: b.email, phone: b.phone,
				birthDate: b.birthDate, experience: b.experience, forMinor: b.forMinor,
				minorDetails: b.minorDetails, message: b.message, consentAccepted: b.consentAccepted,
			},
		});
		res.status(201).json({ ok: true });
	} catch (err) {
		next(err);
	}
});

inquiriesRouter.post("/sponsor", inquiryRateLimit, validate({ body: sponsorBody }), spamGuard, async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof sponsorBody>;
		await prisma.sponsorInquiry.create({
			data: {
				companyName: b.companyName, contactName: b.contactName, email: b.email, phone: b.phone,
				sponsorshipInterest: b.sponsorshipInterest, message: b.message, consentAccepted: b.consentAccepted,
			},
		});
		res.status(201).json({ ok: true });
	} catch (err) {
		next(err);
	}
});

inquiriesRouter.post("/donation", inquiryRateLimit, validate({ body: donationBody }), spamGuard, async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof donationBody>;
		await prisma.donationInquiry.create({
			data: {
				donorName: b.donorName, email: b.email, phone: b.phone,
				message: b.message, consentAccepted: b.consentAccepted,
			},
		});
		res.status(201).json({ ok: true });
	} catch (err) {
		next(err);
	}
});
