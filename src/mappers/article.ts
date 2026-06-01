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

type ArticleResolvedRow = Article & {
	translations: ArticleTranslation[];
	images: ArticleImage[];
	mentionedArchers: Archer[];
};

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
