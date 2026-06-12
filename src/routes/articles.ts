import { Router } from "express";
import { prisma } from "../db.ts";
import { toArticleCard, toArticleResolved } from "../mappers/article.ts";
import { localeFromQuery } from "../http/locale.ts";
import { HttpError } from "../http/errors.ts";
import { safeMapList } from "../http/safe-map.ts";

export const articlesRouter = Router();

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

// GET /articles?locale=hr&before=<ISO>&limit=<n>&mentions=<archerSlug> — news feed,
// newest first, cursor-paginated. Public: published, not hidden. Returns
// { items, nextCursor }.
// `before` = the publishedAt of the last item seen; pass it to load older posts.
// `limit` = page size (default 12, clamped 1..30) — the front-end loads a larger
// first page (to fill the carousel + highlights + first grid row) then 9 per click.
// `mentions` = an archer slug; when present, only articles that tag that archer are
// returned (used for the "related news" strip on a profile page).
// nextCursor is null when there are no more.
articlesRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const before = req.query["before"];
		const beforeDate = typeof before === "string" ? new Date(before) : null;
		const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : null;

		const rawLimit = Number(req.query["limit"]);
		const pageSize = Number.isInteger(rawLimit)
			? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
			: DEFAULT_PAGE_SIZE;

		const mentions = req.query["mentions"];
		const mentionsSlug = typeof mentions === "string" && mentions.length > 0 ? mentions : null;

		const rows = await prisma.article.findMany({
			where: {
				status: "published",
				hidden: false,
				...(validBefore ? { publishedAt: { lt: validBefore } } : {}),
				...(mentionsSlug ? { mentionedArchers: { some: { slug: mentionsSlug } } } : {}),
			},
			include: { translations: true },
			orderBy: { publishedAt: "desc" },
			take: pageSize + 1, // fetch one extra to know if there's a next page
		});

		const hasMore = rows.length > pageSize;
		const page = hasMore ? rows.slice(0, pageSize) : rows;
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
