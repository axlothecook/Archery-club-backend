import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";

export const adminClubInfoRouter = Router();

// ClubInfo is a SINGLETON. Its IDENTITY (foundedDate, officers, valuesBlocks,
// history fields) is SEED-MANAGED (seed-data/club-info.json + the importer) and
// is NOT admin-editable. Admins may only update the changeable CONTACT details +
// social links. The body is `.strict()` so any attempt to send identity fields is
// REJECTED (400) rather than silently dropped — the lock is explicit. The
// singleton must already exist (created by the importer); this is update-only.
const social = z.object({ platform: z.string().min(1), url: z.url() });

const body = z
	.object({
		address: z.string().min(1).nullable().default(null),
		email: z.email().nullable().default(null),
		oib: z.string().min(1).nullable().default(null),
		socials: z.array(social).default([]),
	})
	.strict(); // reject identity fields (foundedDate/officers/valuesBlocks/…)

// PUT /admin/club-info — update the singleton's contact + socials only.
adminClubInfoRouter.put("/", validate({ body }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof body>;

		const existing = await prisma.clubInfo.findFirst();
		if (!existing) {
			// Identity is seed-owned; the row must be imported before contact edits.
			throw new HttpError(409, "Club info not initialized — run the seed import first");
		}

		await prisma.clubInfo.update({
			where: { id: existing.id },
			data: {
				address: b.address,
				email: b.email,
				oib: b.oib,
				socials: b.socials,
			},
		});

		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
