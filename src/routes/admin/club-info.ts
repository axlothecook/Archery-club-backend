import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";

export const adminClubInfoRouter = Router();

// ClubInfo is a SINGLETON, so this is an upsert-style PUT: write the one row
// (creating it if none exists yet) + its hr translation. historyPhotos use a
// granular diff (id present = keep/update, absent = new, missing = deleted).
const officer = z.object({ name: z.string().min(1), roleKey: z.string().min(1) });
const social = z.object({ platform: z.string().min(1), url: z.url() });
const photo = z.object({
	id: z.uuid().optional(),
	url: z.url(),
	alt: z.string().min(1),
	order: z.number().int(),
});

const body = z.object({
	foundedDate: z.coerce.date().nullable().default(null),
	address: z.string().min(1).nullable().default(null),
	email: z.email().nullable().default(null),
	oib: z.string().min(1).nullable().default(null),
	officers: z.array(officer).default([]),
	socials: z.array(social).default([]),
	historyPhotos: z.array(photo).default([]),
	// hr translation
	valuesText: z.string().default(""),
	historyText: z.string().default(""),
	officerRoleLabels: z.record(z.string(), z.string()).default({}),
	photoCaptions: z.record(z.string(), z.string()).default({}),
});

// PUT /admin/club-info — create or replace the singleton.
adminClubInfoRouter.put("/", validate({ body }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof body>;

		await prisma.$transaction(async (tx) => {
			const existing = await tx.clubInfo.findFirst({ include: { historyPhotos: true } });

			const scalar = {
				foundedDate: b.foundedDate,
				address: b.address,
				email: b.email,
				oib: b.oib,
				officers: b.officers,
				socials: b.socials,
				sourceLocale: "hr",
			};

			const ci = existing
				? await tx.clubInfo.update({ where: { id: existing.id }, data: scalar })
				: await tx.clubInfo.create({ data: scalar });

			// history photos — granular diff
			const keepIds = new Set(b.historyPhotos.filter((p) => p.id).map((p) => p.id as string));
			await tx.clubHistoryPhoto.deleteMany({ where: { clubInfoId: ci.id, id: { notIn: [...keepIds] } } });
			for (const p of b.historyPhotos) {
				if (p.id && existing?.historyPhotos.some((e) => e.id === p.id)) {
					await tx.clubHistoryPhoto.update({ where: { id: p.id }, data: { url: p.url, alt: p.alt, order: p.order } });
				} else {
					await tx.clubHistoryPhoto.create({ data: { clubInfoId: ci.id, url: p.url, alt: p.alt, order: p.order } });
				}
			}

			await tx.clubInfoTranslation.upsert({
				where: { clubInfoId_locale: { clubInfoId: ci.id, locale: "hr" } },
				create: {
					clubInfoId: ci.id, locale: "hr",
					valuesText: b.valuesText, historyText: b.historyText,
					officerRoleLabels: b.officerRoleLabels, photoCaptions: b.photoCaptions,
				},
				update: {
					valuesText: b.valuesText, historyText: b.historyText,
					officerRoleLabels: b.officerRoleLabels, photoCaptions: b.photoCaptions,
				},
			});
		});
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
