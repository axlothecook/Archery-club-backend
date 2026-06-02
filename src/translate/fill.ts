import { prisma } from "../db.ts";
import type { Locale } from "archery-contracts";
import { TARGET_LOCALES, SOURCE_LOCALE, translateBatch } from "./index.ts";

// Translate-and-store FILL service. For each entity it reads the hr SOURCE
// translation row, translates its text into every target locale, and upserts the
// per-locale rows. Handles BOTH shapes: plain-string fields (title/name/bio/…)
// and JSON-structured fields (valuesBlocks/paragraphs = [{header,body}], the
// officerRoleLabels/photoCaptions = {key:value} maps), by flattening every inner
// string into one batch per locale then rebuilding the structure from the
// translated values (order preserved by translateBatch).
//
// Idempotent: by default only MISSING target locales are filled; pass force=true
// to re-translate existing rows (e.g. after a source edit). The hr row is never
// touched (it is the human-authored source of truth).

export type FillOpts = { force?: boolean; targets?: Locale[] };

type FillResult = { entity: string; rowsFilled: number; localesPerRow: number };

// Translate a flat list of strings into every target, returning a map
// locale -> translated[] (same length/order as `strings`).
async function translateToAll(
	strings: string[],
	targets: Locale[],
): Promise<Map<Locale, string[]>> {
	const byLocale = new Map<Locale, string[]>();
	for (const target of targets) {
		byLocale.set(target, await translateBatch(strings, target, SOURCE_LOCALE));
	}
	return byLocale;
}

// ── Generic field shapes ──────────────────────────────────────────────────────
// A "block list" field: [{ header, body }]  (valuesBlocks, paragraphs)
type Block = { header: string; body: string };
// A "string map" field: { key: value }      (officerRoleLabels, photoCaptions)
type StrMap = Record<string, string>;

function flattenBlocks(blocks: Block[]): string[] {
	return blocks.flatMap((b) => [b.header, b.body]);
}
function rebuildBlocks(blocks: Block[], flat: string[]): Block[] {
	return blocks.map((_, i) => ({ header: flat[i * 2] ?? "", body: flat[i * 2 + 1] ?? "" }));
}
function flattenMap(map: StrMap): { keys: string[]; values: string[] } {
	const keys = Object.keys(map);
	return { keys, values: keys.map((k) => map[k] ?? "") };
}
function rebuildMap(keys: string[], values: string[]): StrMap {
	const out: StrMap = {};
	keys.forEach((k, i) => { out[k] = values[i] ?? ""; });
	return out;
}

// Which target locales are missing for a row, given the locales that already exist.
function missingTargets(existing: Set<string>, targets: Locale[], force: boolean): Locale[] {
	return force ? targets : targets.filter((t) => !existing.has(t));
}

// ── Sponsor (description) ─────────────────────────────────────────────────────
async function fillSponsors(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.sponsor.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const s of rows) {
		const hr = s.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(s.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const byLocale = await translateToAll([hr.description], need);
		for (const loc of need) {
			const [description] = byLocale.get(loc)!;
			await prisma.sponsorTranslation.upsert({
				where: { sponsorId_locale: { sponsorId: s.id, locale: loc } },
				create: { sponsorId: s.id, locale: loc, description: description ?? "" },
				update: { description: description ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "sponsor", rowsFilled, localesPerRow: targets.length };
}

// ── Archer (bio) ──────────────────────────────────────────────────────────────
async function fillArchers(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.archer.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const a of rows) {
		const hr = a.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(a.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const byLocale = await translateToAll([hr.bio], need);
		for (const loc of need) {
			const [bio] = byLocale.get(loc)!;
			await prisma.archerTranslation.upsert({
				where: { archerId_locale: { archerId: a.id, locale: loc } },
				create: { archerId: a.id, locale: loc, bio: bio ?? "" },
				update: { bio: bio ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "archer", rowsFilled, localesPerRow: targets.length };
}

// ── Achievement (title) ───────────────────────────────────────────────────────
async function fillAchievements(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.achievement.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const a of rows) {
		const hr = a.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(a.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const byLocale = await translateToAll([hr.title], need);
		for (const loc of need) {
			const [title] = byLocale.get(loc)!;
			await prisma.achievementTranslation.upsert({
				where: { achievementId_locale: { achievementId: a.id, locale: loc } },
				create: { achievementId: a.id, locale: loc, title: title ?? "" },
				update: { title: title ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "achievement", rowsFilled, localesPerRow: targets.length };
}

// ── EventLevel (name) ─────────────────────────────────────────────────────────
async function fillEventLevels(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.eventLevel.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const l of rows) {
		const hr = l.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(l.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const byLocale = await translateToAll([hr.name], need);
		for (const loc of need) {
			const [name] = byLocale.get(loc)!;
			await prisma.eventLevelTranslation.upsert({
				where: { eventLevelId_locale: { eventLevelId: l.id, locale: loc } },
				create: { eventLevelId: l.id, locale: loc, name: name ?? "" },
				update: { name: name ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "eventLevel", rowsFilled, localesPerRow: targets.length };
}

// ── ClubEvent (name) ──────────────────────────────────────────────────────────
async function fillClubEvents(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.clubEvent.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const e of rows) {
		const hr = e.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(e.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const byLocale = await translateToAll([hr.name], need);
		for (const loc of need) {
			const [name] = byLocale.get(loc)!;
			await prisma.clubEventTranslation.upsert({
				where: { clubEventId_locale: { clubEventId: e.id, locale: loc } },
				create: { clubEventId: e.id, locale: loc, name: name ?? "" },
				update: { name: name ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "clubEvent", rowsFilled, localesPerRow: targets.length };
}

// ── Article (title, body, excerpt) ────────────────────────────────────────────
async function fillArticles(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.article.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const a of rows) {
		const hr = a.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(a.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		// 3 fields per locale: [title, body, excerpt]
		const byLocale = await translateToAll([hr.title, hr.body, hr.excerpt], need);
		for (const loc of need) {
			const [title, body, excerpt] = byLocale.get(loc)!;
			await prisma.articleTranslation.upsert({
				where: { articleId_locale: { articleId: a.id, locale: loc } },
				create: { articleId: a.id, locale: loc, title: title ?? "", body: body ?? "", excerpt: excerpt ?? "" },
				update: { title: title ?? "", body: body ?? "", excerpt: excerpt ?? "" },
			});
		}
		rowsFilled++;
	}
	return { entity: "article", rowsFilled, localesPerRow: targets.length };
}

// ── ClubHistoryPeriod (title, subtitle, lead + paragraphs[{header,body}]) ─────
async function fillClubHistory(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const rows = await prisma.clubHistoryPeriod.findMany({ include: { translations: true } });
	let rowsFilled = 0;
	for (const p of rows) {
		const hr = p.translations.find((t) => t.locale === SOURCE_LOCALE);
		if (!hr) continue;
		const have = new Set(p.translations.map((t) => t.locale));
		const need = missingTargets(have, targets, !!opts.force);
		if (need.length === 0) continue;
		const paras = hr.paragraphs as unknown as Block[];
		// Flatten: [title, subtitle, lead, ...paraHeader/body pairs]
		const flat = [hr.title, hr.subtitle, hr.lead, ...flattenBlocks(paras)];
		const byLocale = await translateToAll(flat, need);
		for (const loc of need) {
			const out = byLocale.get(loc)!;
			const [title, subtitle, lead] = out;
			const paragraphs = rebuildBlocks(paras, out.slice(3));
			await prisma.clubHistoryPeriodTranslation.upsert({
				where: { periodId_locale: { periodId: p.id, locale: loc } },
				create: { periodId: p.id, locale: loc, title: title ?? "", subtitle: subtitle ?? "", lead: lead ?? "", paragraphs },
				update: { title: title ?? "", subtitle: subtitle ?? "", lead: lead ?? "", paragraphs },
			});
		}
		rowsFilled++;
	}
	return { entity: "clubHistoryPeriod", rowsFilled, localesPerRow: targets.length };
}

// ── ClubInfo singleton (valuesBlocks[{header,body}] + officerRoleLabels{} + photoCaptions{} + historyText) ──
async function fillClubInfo(opts: FillOpts): Promise<FillResult> {
	const targets = opts.targets ?? TARGET_LOCALES;
	const ci = await prisma.clubInfo.findFirst({ include: { translations: true } });
	if (!ci) return { entity: "clubInfo", rowsFilled: 0, localesPerRow: targets.length };
	const hr = ci.translations.find((t) => t.locale === SOURCE_LOCALE);
	if (!hr) return { entity: "clubInfo", rowsFilled: 0, localesPerRow: targets.length };
	const have = new Set(ci.translations.map((t) => t.locale));
	const need = missingTargets(have, targets, !!opts.force);
	if (need.length === 0) return { entity: "clubInfo", rowsFilled: 0, localesPerRow: targets.length };

	const valueBlocks = hr.valuesBlocks as unknown as Block[];
	const roleLabels = hr.officerRoleLabels as unknown as StrMap;
	const captions = hr.photoCaptions as unknown as StrMap;
	const roleFlat = flattenMap(roleLabels);
	const capFlat = flattenMap(captions);

	// One flat batch: [historyText, ...valueBlock pairs, ...roleLabel values, ...caption values]
	const flat = [hr.historyText, ...flattenBlocks(valueBlocks), ...roleFlat.values, ...capFlat.values];
	const byLocale = await translateToAll(flat, need);
	for (const loc of need) {
		const out = byLocale.get(loc)!;
		let i = 0;
		const historyText = out[i++] ?? "";
		const vbCount = valueBlocks.length * 2;
		const valuesBlocks = rebuildBlocks(valueBlocks, out.slice(i, i + vbCount)); i += vbCount;
		const officerRoleLabels = rebuildMap(roleFlat.keys, out.slice(i, i + roleFlat.keys.length)); i += roleFlat.keys.length;
		const photoCaptions = rebuildMap(capFlat.keys, out.slice(i, i + capFlat.keys.length));
		await prisma.clubInfoTranslation.upsert({
			where: { clubInfoId_locale: { clubInfoId: ci.id, locale: loc } },
			create: { clubInfoId: ci.id, locale: loc, historyText, valuesBlocks, officerRoleLabels, photoCaptions },
			update: { historyText, valuesBlocks, officerRoleLabels, photoCaptions },
		});
	}
	return { entity: "clubInfo", rowsFilled: 1, localesPerRow: targets.length };
}

// Fill EVERY translatable entity. Returns per-entity results for logging.
export async function fillAllTranslations(opts: FillOpts = {}): Promise<FillResult[]> {
	return [
		await fillSponsors(opts),
		await fillArchers(opts),
		await fillAchievements(opts),
		await fillEventLevels(opts),
		await fillClubEvents(opts),
		await fillArticles(opts),
		await fillClubHistory(opts),
		await fillClubInfo(opts),
	];
}

// Individual fillers exported for the write-hook (re-translate one entity type).
export {
	fillSponsors, fillArchers, fillAchievements, fillEventLevels,
	fillClubEvents, fillArticles, fillClubHistory, fillClubInfo,
};
