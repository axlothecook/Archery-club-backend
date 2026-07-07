import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { retranslateInBackground } from "../../translate/retranslate.ts";
import { slugify } from "../../http/slug.ts";
import { toArcherAdminRow, toArcherEditData } from "../../mappers/archer.ts";
import { safeMapList } from "../../http/safe-map.ts";

export const adminArchersRouter = Router();

const bow = z.enum(["recurve", "compound", "barebow"]);
const role = z.enum(["archer", "coach"]);

const careerStatInput = z.object({
	id: z.uuid().optional(),
	year: z.number().int(),
	discipline: z.string().min(1),
	averageScore: z.number().nullable().default(null),
	wins: z.number().int(),
	losses: z.number().int(),
	highestScore: z.number().nullable().default(null),
});
const performanceInput = z.object({
	id: z.uuid().optional(),
	date: z.string().min(1),
	name: z.string().min(1),
	scope: z.enum(["domestic", "global"]),
	type: z.enum(["outdoor", "indoor", "field", "3d"]),
	categories: z.array(z.string().min(1)).default([]),
	meters: z.string().min(1).nullable().default(null),
	placing: z.string().min(1).nullable().default(null),
	points: z.number().nullable().default(null),
});

const createBody = z.object({
	slug: z.string().min(1).optional(),
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	roles: z.array(role).min(1),
	bowType: z.array(bow).default([]),
	gender: z.enum(["male", "female"]).nullable().default(null),
	competitionCategories: z.array(z.string().min(1)).default([]),
	order: z.number().int().default(0),
	cardPhotoUrl: z.url().nullable().default(null),
	cardPhotoAlt: z.string().min(1).nullable().default(null),
	profilePhotoUrl: z.url().nullable().default(null),
	profilePhotoAlt: z.string().min(1).nullable().default(null),
	worldArcheryId: z.string().min(1).nullable().default(null),
	birthDate: z.coerce.date().nullable().default(null),
	hiddenSections: z.array(z.string()).default([]),
	coachIds: z.array(z.uuid()).default([]),
	status: z.enum(["draft", "published"]).default("draft"),
	hidden: z.boolean().default(false),
	bio: z.string().min(1), // Croatian source
	careerStats: z.array(careerStatInput).default([]),
	performance: z.array(performanceInput).default([]),
});

const updateBody = z.object({
	firstName: z.string().min(1).optional(),
	lastName: z.string().min(1).optional(),
	roles: z.array(role).min(1).optional(),
	bowType: z.array(bow).optional(),
	gender: z.enum(["male", "female"]).nullable().optional(),
	competitionCategories: z.array(z.string().min(1)).optional(),
	order: z.number().int().optional(),
	cardPhotoUrl: z.url().nullable().optional(),
	cardPhotoAlt: z.string().min(1).nullable().optional(),
	profilePhotoUrl: z.url().nullable().optional(),
	profilePhotoAlt: z.string().min(1).nullable().optional(),
	worldArcheryId: z.string().min(1).nullable().optional(),
	birthDate: z.coerce.date().nullable().optional(),
	hiddenSections: z.array(z.string()).optional(),
	coachIds: z.array(z.uuid()).optional(),
	status: z.enum(["draft", "published"]).optional(),
	hidden: z.boolean().optional(),
	bio: z.string().min(1).optional(),
	careerStats: z.array(careerStatInput).optional(),
	performance: z.array(performanceInput).optional(),
});

const idParam = z.object({ id: z.uuid() });

async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
	let slug = base;
	for (let n = 2; ; n++) {
		const clash = await prisma.archer.findUnique({ where: { slug } });
		if (!clash || clash.id === exceptId) return slug;
		slug = `${base}-${n}`;
	}
}

// GET /admin/archers/options — lightweight { id, name } list of PUBLISHED archers,
// for pickers in other editors (e.g. tagging mentioned archers on an article). Only
// published archers are offered — you wouldn't tag a draft/unpublished profile in a
// public article. Auth-guarded by app.use('/admin', requireAuth). Sorted by display
// order then last name. This is the endpoint the Vijesti "Označeni streličari"
// picker loads; it's separate from any admin archer LIST (that comes with Momčad).
adminArchersRouter.get("/options", async (_req, res, next) => {
	try {
		const rows = await prisma.archer.findMany({
			where: { status: "published" },
			select: { id: true, firstName: true, lastName: true },
			orderBy: [{ order: "asc" }, { lastName: "asc" }],
		});
		res.json(rows.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}` })));
	} catch (err) {
		next(err);
	}
});

// GET /admin/archers — the dashboard's archer LIST (Momčad: Svi streličari + Nacrti
// share it, filtered by status client-side). Admin DTO. Ordered by display order,
// then last name. Registered AFTER /options so the literal route still wins.
adminArchersRouter.get("/", async (_req, res, next) => {
	try {
		const rows = await prisma.archer.findMany({
			orderBy: [{ order: "asc" }, { lastName: "asc" }],
		});
		res.json(safeMapList(rows, toArcherAdminRow, "archer-admin-row", (r) => r.id));
	} catch (err) {
		next(err);
	}
});

// GET /admin/archers/:id — the FULL archer for the dashboard EDIT form (every
// editable field incl. HR bio, coach IDs, hidden sections, and nested careerStats /
// performance rows with ids). 404 if not found. Distinct method from PATCH/DELETE
// /:id so no route conflict; registered after /options + / so those literals win.
adminArchersRouter.get("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const row = await prisma.archer.findUnique({
			where: { id },
			include: { translations: true, careerStats: true, performance: true, coaches: true },
		});
		if (!row) throw new HttpError(404, "Archer not found");
		res.json(toArcherEditData(row));
	} catch (err) {
		next(err);
	}
});

adminArchersRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const slug = await uniqueSlug(b.slug ? slugify(b.slug) : slugify(`${b.firstName} ${b.lastName}`));
		const archer = await prisma.archer.create({
			data: {
				slug,
				firstName: b.firstName,
				lastName: b.lastName,
				roles: b.roles,
				bowType: b.bowType,
				gender: b.gender,
				competitionCategories: b.competitionCategories,
				order: b.order,
				cardPhotoUrl: b.cardPhotoUrl,
				cardPhotoAlt: b.cardPhotoAlt,
				profilePhotoUrl: b.profilePhotoUrl,
				profilePhotoAlt: b.profilePhotoAlt,
				worldArcheryId: b.worldArcheryId,
				birthDate: b.birthDate,
				hiddenSections: b.hiddenSections,
				status: b.status,
				hidden: b.hidden,
				sourceLocale: "hr",
				coaches: { connect: b.coachIds.map((id) => ({ id })) },
				careerStats: { create: b.careerStats.map(({ id: _id, ...s }) => s) },
				performance: { create: b.performance.map(({ id: _id, ...p }) => p) },
				translations: { create: [{ locale: "hr", bio: b.bio }] },
			},
		});
		res.status(201).json({ id: archer.id, slug });
		retranslateInBackground("archer");
	} catch (err) {
		next(err);
	}
});

adminArchersRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		const existing = await prisma.archer.findUnique({
			where: { id },
			include: { careerStats: true, performance: true },
		});
		if (!existing) throw new HttpError(404, "Archer not found");

		await prisma.$transaction(async (tx) => {
			await tx.archer.update({
				where: { id },
				data: {
					...(b.firstName !== undefined ? { firstName: b.firstName } : {}),
					...(b.lastName !== undefined ? { lastName: b.lastName } : {}),
					...(b.roles !== undefined ? { roles: b.roles } : {}),
					...(b.bowType !== undefined ? { bowType: b.bowType } : {}),
					...(b.gender !== undefined ? { gender: b.gender } : {}),
					...(b.competitionCategories !== undefined ? { competitionCategories: b.competitionCategories } : {}),
					...(b.order !== undefined ? { order: b.order } : {}),
					...(b.cardPhotoUrl !== undefined ? { cardPhotoUrl: b.cardPhotoUrl } : {}),
					...(b.cardPhotoAlt !== undefined ? { cardPhotoAlt: b.cardPhotoAlt } : {}),
					...(b.profilePhotoUrl !== undefined ? { profilePhotoUrl: b.profilePhotoUrl } : {}),
					...(b.profilePhotoAlt !== undefined ? { profilePhotoAlt: b.profilePhotoAlt } : {}),
					...(b.worldArcheryId !== undefined ? { worldArcheryId: b.worldArcheryId } : {}),
					...(b.birthDate !== undefined ? { birthDate: b.birthDate } : {}),
					...(b.hiddenSections !== undefined ? { hiddenSections: b.hiddenSections } : {}),
					...(b.status !== undefined ? { status: b.status } : {}),
					...(b.hidden !== undefined ? { hidden: b.hidden } : {}),
					...(b.coachIds !== undefined ? { coaches: { set: b.coachIds.map((cid) => ({ id: cid })) } } : {}),
				},
			});

			await diffRows(tx, "archerCareerStat", id, existing.careerStats, b.careerStats);
			await diffRows(tx, "archerPerformance", id, existing.performance, b.performance);

			if (b.bio !== undefined) {
				await tx.archerTranslation.upsert({
					where: { archerId_locale: { archerId: id, locale: "hr" } },
					create: { archerId: id, locale: "hr", bio: b.bio },
					update: { bio: b.bio },
				});
			}
		});
		res.json({ ok: true });
		if (b.bio !== undefined) retranslateInBackground("archer");
	} catch (err) {
		next(err);
	}
});

// Granular diff for an archer's child rows (careerStats / performance): rows
// present-by-id are updated, missing ones deleted, id-less ones created.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function diffRows(tx: any, model: "archerCareerStat" | "archerPerformance", archerId: string, existing: { id: string }[], incoming?: ({ id?: string } & Record<string, unknown>)[]) {
	if (incoming === undefined) return;
	const keepIds = new Set(incoming.filter((r) => r.id).map((r) => r.id as string));
	await tx[model].deleteMany({ where: { archerId, id: { notIn: [...keepIds] } } });
	for (const row of incoming) {
		const { id: rowId, ...data } = row;
		if (rowId && existing.some((e) => e.id === rowId)) {
			await tx[model].update({ where: { id: rowId }, data });
		} else {
			await tx[model].create({ data: { archerId, ...data } });
		}
	}
}

adminArchersRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.archer.findUnique({ where: { id } }))) throw new HttpError(404, "Archer not found");
		await prisma.archer.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
