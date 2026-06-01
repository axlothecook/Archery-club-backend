import { Router } from "express";
import { prisma } from "../db.ts";
import { toArticleCard, toArticleResolved } from "../mappers/article.ts";
import { localeFromQuery } from "../http/locale.ts";
import { HttpError } from "../http/errors.ts";
import { safeMapList } from "../http/safe-map.ts";

export const articlesRouter = Router();

const PAGE_SIZE = 12;

// GET /articles?locale=hr&before=<ISO> — news feed, newest first, cursor-paginated
// for infinite scroll. Public: published, not hidden. Returns { items, nextCursor }.
// `before` = the publishedAt of the last item seen; pass it to load older posts.
// nextCursor is null when there are no more.
articlesRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const before = req.query["before"];
		const beforeDate = typeof before === "string" ? new Date(before) : null;
		const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

		const rows = await prisma.article.findMany({
			where: {
				status: "published",
				hidden: false,
				...(validBefore ? { publishedAt: { lt: validBefore } } : {}),
			},
			include: { translations: true },
			orderBy: { publishedAt: "desc" },
			take: PAGE_SIZE + 1, // fetch one extra to know if there's a next page
		});

		const hasMore = rows.length > PAGE_SIZE;
		const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
		const last = page.at(-1);
		const nextCursor = hasMore && last?.publishedAt ? last.publishedAt.toISOString() : null;

		res.json({
			items: safeMapList(page, (row) => toArticleCard(row, locale), "article", (r) => r.id),
			nextCursor,
		});
	} catch (err) {
		next(err);
	}
});

// GET /articles/:slug?locale=hr — the full article (live published version).
articlesRouter.get("/:slug", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const row = await prisma.article.findFirst({
			where: { slug: req.params.slug, status: "published", hidden: false },
			include: { translations: true, images: true, mentionedArchers: true },
		});
		if (!row) throw new HttpError(404, "Article not found");
		res.json(toArticleResolved(row, locale));
	} catch (err) {
		next(err);
	}
});
