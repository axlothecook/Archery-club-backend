import type {
	ArticleArcherRef,
	ArticleCard,
	ArticleMediaType,
	ArticleResolved,
	ArticleVideo,
	ExternalLink,
	Locale,
} from "archery-contracts";
import type {
	Archer,
	Article,
	ArticleImage,
	ArticleTranslation,
} from "../generated/prisma/client.ts";
import { resolveTranslation } from "./locale.ts";

// video {url, posterUrl} from its nullable column pair, or null.
function videoOrNull(url: string | null, posterUrl: string | null): ArticleVideo | null {
	return url !== null ? { url, posterUrl } : null;
}

// externalLink {url, sourceName} from its nullable column pair, or null.
function externalOrNull(url: string | null, sourceName: string | null): ExternalLink | null {
	return url !== null && sourceName !== null ? { url, sourceName } : null;
}

// Card needs only translation locale + title/excerpt.
type ArticleCardRow = Article & { translations: ArticleTranslation[] };

// Map an Article row -> the lightweight news-feed card.
export function toArticleCard(row: ArticleCardRow, requested: Locale): ArticleCard {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);
	return {
		slug: row.slug,
		mediaType: row.mediaType as ArticleMediaType,
		posterImage: { url: row.posterImageUrl, alt: row.posterImageAlt },
		publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		locale,
		title: t.title,
		excerpt: t.excerpt,
	};
}

// ── Admin list row ───────────────────────────────────────────────────────────
// Shape for the dashboard's article LIST (Objavljene vijesti / Nacrti). This is an
// ADMIN-ONLY DTO — deliberately separate from the public toArticleCard so admin
// fields (status, hidden, pending-draft, adminEdited) never leak into any public
// response (OWASP API3: cherry-pick fields, don't return raw entities). Uses the
// HR source translation for the title (the dashboard is Croatian-only). No excerpt/
// body — the list only needs enough to identify + triage each article.
export type ArticleAdminRow = {
	id: string;
	slug: string;
	title: string;
	mediaType: ArticleMediaType;
	status: "draft" | "published";
	hidden: boolean;
	source: "facebook" | "manual";
	posterImage: { url: string; alt: string };
	publishedAt: string | null; // ISO
	updatedAt: string; // ISO
	hasPendingDraft: boolean; // a published article with unpublished edits queued
	adminEdited: boolean; // display-only "edited since sync" flag
};

// Map an Article row -> the admin list row. Title comes from the HR source
// translation (falls back to the first translation, then empty — never throws).
export function toArticleAdminRow(row: ArticleCardRow): ArticleAdminRow {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		slug: row.slug,
		title: t?.title ?? "",
		mediaType: row.mediaType as ArticleMediaType,
		status: row.status as "draft" | "published",
		hidden: row.hidden,
		source: row.source as "facebook" | "manual",
		posterImage: { url: row.posterImageUrl, alt: row.posterImageAlt },
		publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		updatedAt: row.updatedAt.toISOString(),
		hasPendingDraft: row.draftRevision !== null,
		adminEdited: row.adminEdited,
	};
}

type ArticleResolvedRow = Article & {
	translations: ArticleTranslation[];
	images: ArticleImage[];
	mentionedArchers: Archer[];
};

// ── Admin edit data ──────────────────────────────────────────────────────────
// The FULL editable shape for the dashboard edit form (GET /admin/articles/:id).
// Admin-only: exposes every field the create/edit form drives, in the HR source
// locale. Separate from the public toArticleResolved (which omits admin fields and
// resolves a requested locale). mentionedArcherIds are IDs (the picker's value).
export type ArticleEditData = {
	id: string;
	slug: string;
	mediaType: ArticleMediaType;
	posterImageUrl: string;
	posterImageAlt: string;
	images: { url: string; alt: string; order: number }[];
	videoUrl: string | null;
	videoPosterUrl: string | null;
	externalUrl: string | null;
	externalSourceName: string | null;
	status: "draft" | "published";
	hidden: boolean;
	mentionedArcherIds: string[];
	title: string;
	body: string;
	excerpt: string;
};

export function toArticleEditData(
	row: Article & {
		translations: ArticleTranslation[];
		images: ArticleImage[];
		mentionedArchers: Archer[];
	},
): ArticleEditData {
	const hr = row.translations.find((t) => t.locale === row.sourceLocale);
	const t = hr ?? row.translations[0];
	return {
		id: row.id,
		slug: row.slug,
		mediaType: row.mediaType as ArticleMediaType,
		posterImageUrl: row.posterImageUrl,
		posterImageAlt: row.posterImageAlt,
		images: [...row.images]
			.sort((a, b) => a.order - b.order)
			.map((img) => ({ url: img.url, alt: img.alt, order: img.order })),
		videoUrl: row.videoUrl,
		videoPosterUrl: row.videoPosterUrl,
		externalUrl: row.externalUrl,
		externalSourceName: row.externalSourceName,
		status: row.status as "draft" | "published",
		hidden: row.hidden,
		mentionedArcherIds: row.mentionedArchers.map((a) => a.id),
		title: t?.title ?? "",
		body: t?.body ?? "",
		excerpt: t?.excerpt ?? "",
	};
}

function toRef(a: Archer): ArticleArcherRef {
	return { slug: a.slug, firstName: a.firstName, lastName: a.lastName };
}

// Map an Article row -> the full public article view. Serves the LIVE published
// content: draftRevision and the FB-sync fields (fbContentHash/fbRefusedHash/
// adminEdited) are intentionally NOT included.
export function toArticleResolved(row: ArticleResolvedRow, requested: Locale): ArticleResolved {
	const { row: t, locale } = resolveTranslation(
		row.translations,
		requested,
		row.sourceLocale as Locale,
	);
	return {
		slug: row.slug,
		source: row.source as ArticleResolved["source"],
		fbPermalinkUrl: row.fbPermalinkUrl,
		mediaType: row.mediaType as ArticleMediaType,

		posterImage: { url: row.posterImageUrl, alt: row.posterImageAlt },
		images: [...row.images]
			.sort((a, b) => a.order - b.order)
			.map((img) => ({ url: img.url, alt: img.alt, order: img.order })),
		video: videoOrNull(row.videoUrl, row.videoPosterUrl),
		externalLink: externalOrNull(row.externalUrl, row.externalSourceName),

		publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
		mentionedArchers: row.mentionedArchers.map(toRef),

		locale,
		title: t.title,
		body: t.body,
		excerpt: t.excerpt,
	};
}
