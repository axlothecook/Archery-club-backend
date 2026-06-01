import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.ts";
import { Prisma } from "../../generated/prisma/client.ts";
import { validate } from "../../http/validate.ts";
import { HttpError } from "../../http/errors.ts";
import { slugify } from "../../http/slug.ts";

export const adminArticlesRouter = Router();

const mediaType = z.enum(["event", "gallery", "external-link", "video-only"]);
const imageInput = z.object({
	id: z.uuid().optional(), // present = existing row; absent = new image
	url: z.url(),
	alt: z.string().min(1),
	order: z.number().int(),
});

const createBody = z.object({
	slug: z.string().min(1).optional(), // auto-generated from title if omitted
	mediaType,
	posterImageUrl: z.url(),
	posterImageAlt: z.string().min(1),
	images: z.array(imageInput).max(10).default([]),
	videoUrl: z.url().nullable().default(null),
	videoPosterUrl: z.url().nullable().default(null),
	externalUrl: z.url().nullable().default(null),
	externalSourceName: z.string().min(1).nullable().default(null),
	status: z.enum(["draft", "published"]).default("draft"),
	hidden: z.boolean().default(false),
	mentionedArcherIds: z.array(z.uuid()).default([]),
	title: z.string().min(1), // Croatian source
	body: z.string().min(1),
	excerpt: z.string().min(1),
});

const updateBody = z.object({
	mediaType: mediaType.optional(),
	posterImageUrl: z.url().optional(),
	posterImageAlt: z.string().min(1).optional(),
	images: z.array(imageInput).max(10).optional(), // granular diff when present
	videoUrl: z.url().nullable().optional(),
	videoPosterUrl: z.url().nullable().optional(),
	externalUrl: z.url().nullable().optional(),
	externalSourceName: z.string().min(1).nullable().optional(),
	status: z.enum(["draft", "published"]).optional(),
	hidden: z.boolean().optional(),
	mentionedArcherIds: z.array(z.uuid()).optional(),
	title: z.string().min(1).optional(),
	body: z.string().min(1).optional(),
	excerpt: z.string().min(1).optional(),
});

const idParam = z.object({ id: z.uuid() });

// Ensure a unique slug: try `base`, then base-2, base-3, … (excluding `exceptId`).
async function uniqueSlug(base: string, exceptId?: string): Promise<string> {
	let slug = base;
	for (let n = 2; ; n++) {
		const clash = await prisma.article.findUnique({ where: { slug } });
		if (!clash || clash.id === exceptId) return slug;
		slug = `${base}-${n}`;
	}
}

// POST /admin/articles — create a manual article (+ hr translation, images,
// mentions). publishedAt is set when created already published.
adminArticlesRouter.post("/", validate({ body: createBody }), async (req, res, next) => {
	try {
		const b = req.body as z.infer<typeof createBody>;
		const slug = await uniqueSlug(b.slug ? slugify(b.slug) : slugify(b.title));
		const now = new Date();
		const article = await prisma.article.create({
			data: {
				slug,
				source: "manual",
				mediaType: b.mediaType,
				posterImageUrl: b.posterImageUrl,
				posterImageAlt: b.posterImageAlt,
				videoUrl: b.videoUrl,
				videoPosterUrl: b.videoPosterUrl,
				externalUrl: b.externalUrl,
				externalSourceName: b.externalSourceName,
				status: b.status,
				hidden: b.hidden,
				publishedAt: b.status === "published" ? now : null,
				createdAt: now,
				updatedAt: now,
				adminEdited: false,
				sourceLocale: "hr",
				mentionedArchers: { connect: b.mentionedArcherIds.map((id) => ({ id })) },
				images: { create: b.images.map((i) => ({ url: i.url, alt: i.alt, order: i.order })) },
				translations: { create: [{ locale: "hr", title: b.title, body: b.body, excerpt: b.excerpt }] },
			},
		});
		res.status(201).json({ id: article.id, slug });
	} catch (err) {
		next(err);
	}
});

// PATCH /admin/articles/:id — update fields; images use a granular diff
// (existing-by-id updated, missing deleted, id-less created), all in one tx.
adminArticlesRouter.patch("/:id", validate({ params: idParam, body: updateBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof updateBody>;
		const existing = await prisma.article.findUnique({ where: { id }, include: { images: true } });
		if (!existing) throw new HttpError(404, "Article not found");

		await prisma.$transaction(async (tx) => {
			// publishedAt: set the first time it goes published; keep otherwise.
			const becomingPublished = b.status === "published" && existing.status !== "published";

			await tx.article.update({
				where: { id },
				data: {
					...(b.mediaType !== undefined ? { mediaType: b.mediaType } : {}),
					...(b.posterImageUrl !== undefined ? { posterImageUrl: b.posterImageUrl } : {}),
					...(b.posterImageAlt !== undefined ? { posterImageAlt: b.posterImageAlt } : {}),
					...(b.videoUrl !== undefined ? { videoUrl: b.videoUrl } : {}),
					...(b.videoPosterUrl !== undefined ? { videoPosterUrl: b.videoPosterUrl } : {}),
					...(b.externalUrl !== undefined ? { externalUrl: b.externalUrl } : {}),
					...(b.externalSourceName !== undefined ? { externalSourceName: b.externalSourceName } : {}),
					...(b.status !== undefined ? { status: b.status } : {}),
					...(b.hidden !== undefined ? { hidden: b.hidden } : {}),
					...(becomingPublished ? { publishedAt: new Date() } : {}),
					...(b.mentionedArcherIds !== undefined
						? { mentionedArchers: { set: b.mentionedArcherIds.map((aid) => ({ id: aid })) } }
						: {}),
					updatedAt: new Date(),
					adminEdited: true,
				},
			});

			if (b.images !== undefined) {
				const keepIds = new Set(b.images.filter((i) => i.id).map((i) => i.id as string));
				// delete rows the admin dropped
				await tx.articleImage.deleteMany({
					where: { articleId: id, id: { notIn: [...keepIds] } },
				});
				// update existing (alt/order) and create new ones
				for (const img of b.images) {
					if (img.id && existing.images.some((e) => e.id === img.id)) {
						await tx.articleImage.update({ where: { id: img.id }, data: { url: img.url, alt: img.alt, order: img.order } });
					} else {
						await tx.articleImage.create({ data: { articleId: id, url: img.url, alt: img.alt, order: img.order } });
					}
				}
			}

			if (b.title !== undefined || b.body !== undefined || b.excerpt !== undefined) {
				await tx.articleTranslation.upsert({
					where: { articleId_locale: { articleId: id, locale: "hr" } },
					create: {
						articleId: id, locale: "hr",
						title: b.title ?? "", body: b.body ?? "", excerpt: b.excerpt ?? "",
					},
					update: {
						...(b.title !== undefined ? { title: b.title } : {}),
						...(b.body !== undefined ? { body: b.body } : {}),
						...(b.excerpt !== undefined ? { excerpt: b.excerpt } : {}),
					},
				});
			}
		});
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// DELETE /admin/articles/:id — cascade removes images + translations.
adminArticlesRouter.delete("/:id", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		if (!(await prisma.article.findUnique({ where: { id } }))) throw new HttpError(404, "Article not found");
		await prisma.article.delete({ where: { id } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// ── Draft-revision flow (edit a PUBLISHED article without disrupting the live
// version) ──────────────────────────────────────────────────────────────────
// draftRevision holds the Croatian (source) text + editable neutral fields.
// On publish it overwrites the live hr translation + neutral fields; the other
// 7 locales are left stale and reads fall back to hr until the translate
// pipeline backfills (TODO: re-translate hook when GOOGLE key is added).
const draftBody = z.object({
	title: z.string().min(1),
	body: z.string().min(1),
	excerpt: z.string().min(1),
	images: z.array(imageInput).max(10).default([]),
	video: z.object({ url: z.url(), posterUrl: z.url().nullable() }).nullable().default(null),
	externalLink: z.object({ url: z.url(), sourceName: z.string().min(1) }).nullable().default(null),
	mediaType,
	mentionedArcherIds: z.array(z.uuid()).default([]),
});

// PUT /admin/articles/:id/draft — save pending edits (live version untouched).
// Only valid on a published article.
adminArticlesRouter.put("/:id/draft", validate({ params: idParam, body: draftBody }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const b = req.body as z.infer<typeof draftBody>;
		const article = await prisma.article.findUnique({ where: { id } });
		if (!article) throw new HttpError(404, "Article not found");
		if (article.status !== "published") throw new HttpError(400, "Draft revisions are only for published articles");

		await prisma.article.update({
			where: { id },
			data: { draftRevision: b, adminEdited: true, updatedAt: new Date() },
		});
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// POST /admin/articles/:id/publish-draft — apply draftRevision to the live
// article (overwrite hr text + neutral fields + images), then clear it.
adminArticlesRouter.post("/:id/publish-draft", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const article = await prisma.article.findUnique({ where: { id } });
		if (!article) throw new HttpError(404, "Article not found");
		if (!article.draftRevision) throw new HttpError(400, "No pending draft to publish");

		const d = draftBody.parse(article.draftRevision); // validate the stored snapshot

		await prisma.$transaction(async (tx) => {
			await tx.article.update({
				where: { id },
				data: {
					mediaType: d.mediaType,
					videoUrl: d.video?.url ?? null,
					videoPosterUrl: d.video?.posterUrl ?? null,
					externalUrl: d.externalLink?.url ?? null,
					externalSourceName: d.externalLink?.sourceName ?? null,
					mentionedArchers: { set: d.mentionedArcherIds.map((aid) => ({ id: aid })) },
					draftRevision: Prisma.JsonNull,
					updatedAt: new Date(),
				},
			});
			// images: replace-all from the draft snapshot
			await tx.articleImage.deleteMany({ where: { articleId: id } });
			for (const img of d.images) {
				await tx.articleImage.create({ data: { articleId: id, url: img.url, alt: img.alt, order: img.order } });
			}
			// hr translation: overwrite with the edited source text. Other locales
			// left stale → reads fall back to hr. TODO: re-translate when GOOGLE key set.
			await tx.articleTranslation.upsert({
				where: { articleId_locale: { articleId: id, locale: "hr" } },
				create: { articleId: id, locale: "hr", title: d.title, body: d.body, excerpt: d.excerpt },
				update: { title: d.title, body: d.body, excerpt: d.excerpt },
			});
		});
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});

// DELETE /admin/articles/:id/draft — discard the pending draft (live unchanged).
adminArticlesRouter.delete("/:id/draft", validate({ params: idParam }), async (req, res, next) => {
	try {
		const { id } = req.params as z.infer<typeof idParam>;
		const article = await prisma.article.findUnique({ where: { id } });
		if (!article) throw new HttpError(404, "Article not found");
		await prisma.article.update({ where: { id }, data: { draftRevision: Prisma.JsonNull } });
		res.json({ ok: true });
	} catch (err) {
		next(err);
	}
});
