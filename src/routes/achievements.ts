import { Router } from "express";
import type { Locale } from "archery-contracts";
import { prisma } from "../db.ts";
import { toAchievementResolved } from "../mappers/achievement.ts";
import { stockIcon } from "../mappers/achievement-icons.ts";
import { resolveTranslation } from "../mappers/locale.ts";
import { localeFromQuery } from "../http/locale.ts";
import { safeMapList } from "../http/safe-map.ts";

export const achievementsRouter = Router();

// GET /achievements?locale=hr — all achievements, newest year first (the club
// history timeline is reverse-chronological), resolved to the requested locale.
// This is the RAW LIST (used to filter an individual archer's honours, etc.).
achievementsRouter.get("/", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);
		const rows = await prisma.achievement.findMany({
			include: { translations: true, archers: true },
			orderBy: { year: "desc" },
		});
		res.json(safeMapList(rows, (row) => toAchievementResolved(row, locale), "achievement", (r) => r.id));
	} catch (err) {
		next(err);
	}
});

// vsk.hr club totals — manual, because our data only covers ~1 year of posts so
// the full historical national tallies can't be derived (they live on vsk.hr).
const DOMESTIC_TITLES = 64; // naslova državnih prvaka
const DOMESTIC_RECORDS = 65; // državnih rekorda u raznim kategorijama i stilovima
const TRAINING_RANGES = 1;

// An achievement counts toward a level if it's the PRIMARY level OR listed in
// alsoLevels (e.g. a world+European record counts toward both).
function atLevel(level: string) {
	return { OR: [{ level }, { alsoLevels: { has: level } }] };
}

// GET /achievements/summary?locale=hr — the data for the club ACHIEVEMENTS PAGE
// (PSG style) AND the homepage banner. Returns { stats, groups }, all derived
// LIVE so a new title/record/archer updates the numbers automatically.
//  - stats  = the big-number banner (intl counts derived; domestic + statics config)
//  - groups = per-competition cards: { title, count, years, level, type, medal,
//             scope, image }, grouped by the (hr) title, count desc.
achievementsRouter.get("/summary", async (req, res, next) => {
	try {
		const locale = localeFromQuery(req.query["locale"]);

		const [worldTitles, europeanTitles, worldRecords, europeanRecords, archers, coaches] = await Promise.all([
			prisma.achievement.count({ where: { type: "title", medal: "gold", ...atLevel("world") } }),
			prisma.achievement.count({ where: { type: "title", medal: "gold", ...atLevel("european") } }),
			prisma.achievement.count({ where: { type: "record", ...atLevel("world") } }),
			prisma.achievement.count({ where: { type: "record", ...atLevel("european") } }),
			prisma.archer.count({ where: { status: "published", roles: { has: "archer" } } }),
			prisma.archer.count({ where: { status: "published", roles: { has: "coach" } } }),
		]);

		const stats = {
			archers,
			coaches,
			trainingRanges: TRAINING_RANGES,
			worldTitles,
			europeanTitles,
			nationalTitles: DOMESTIC_TITLES,
			worldRecords,
			europeanRecords,
			nationalRecords: DOMESTIC_RECORDS,
		};

		// Homepage card photo per stat slot (the 6 banner numbers), keyed by the same
		// slot name as in `stats`. Sibling to `stats` so the number shape is unchanged;
		// a slot with no row is simply absent (front-end falls back as it sees fit).
		const statImageRows = await prisma.homeStatImage.findMany();
		const statImages: Record<string, { url: string; alt: string }> = {};
		for (const r of statImageRows) statImages[r.slot] = { url: r.imageUrl, alt: r.imageAlt };

		// Group every achievement by its stored (hr) title — the stacking key — into
		// PSG count cards. Display title resolves per requested locale.
		const rows = await prisma.achievement.findMany({ include: { translations: true } });
		const byTitle = new Map<string, typeof rows>();
		for (const r of rows) {
			const key = r.translations.find((t) => t.locale === r.sourceLocale)?.title ?? r.id;
			(byTitle.get(key) ?? byTitle.set(key, []).get(key)!).push(r);
		}

		// Custom category card images, keyed by the same hr title the groups use.
		// A category's image overrides the stock icon for its whole group.
		const categoryRows = await prisma.achievementCategory.findMany();
		const imageByCategory = new Map(categoryRows.map((c) => [c.type, { url: c.imageUrl, alt: c.imageAlt }]));

		const groups = [...byTitle.entries()].map(([groupTitle, allRows]) => {
			// WORLD groups show GOLD only (count titles, not lesser medals) — UNLESS
			// the group has no gold, in which case show its medals as-is so nothing
			// world-level vanishes (e.g. World Cup Stage shows its 1 bronze).
			// European/domestic groups always show all medal colours. Display rule
			// only — the silver/bronze rows stay in the data for archer profiles.
			const isWorld = allRows[0]!.level === "world";
			const golds = allRows.filter((r) => r.medal === "gold");
			const rs = isWorld && golds.length > 0 ? golds : allRows;

			const first = rs[0]!;
			const { row: t } = resolveTranslation(first.translations, locale, first.sourceLocale as Locale);
			const years = [...new Set(rs.map((r) => r.year).filter((y) => y > 0))].sort((a, b) => b - a);
			// One representative image for the card, in priority order: the category's
			// custom photo (by hr title) wins; else a custom photo on any row; else the
			// stock icon for the group's type/level/medal.
			const rowCustom = rs.find((r) => r.imageUrl && r.imageAlt);
			const image =
				imageByCategory.get(groupTitle) ??
				(rowCustom ? { url: rowCustom.imageUrl!, alt: rowCustom.imageAlt! } : stockIcon(first.type, first.level, first.medal));
			return {
				title: t.title,
				count: rs.length,
				years,
				level: first.level,
				type: first.type,
				medal: first.medal,
				scope: first.scope,
				image,
			};
		}).sort((a, b) => b.count - a.count);

		res.json({ locale, stats, statImages, groups });
	} catch (err) {
		next(err);
	}
});
