import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../db.ts";
import { slugify } from "../http/slug.ts";

// Import the club's Facebook posts (seed-data/posts.json) into Article rows.
// Idempotent: upserts by slug. Each post's mentioned-archer NAMES are resolved
// to Archer ids (run the roster importer FIRST), unmatched names logged loudly.
// hr title/body/excerpt go into the translation table; images into ArticleImage.
//
// mediaType comes from the post's `type`. video-only has two shapes: a club's own
// hosted clip (videoUrl present, < videoSizeMB gate) reuses posterImageUrl as the
// player poster; a reposted 3rd-party video (externalUrl + externalSourceName) is
// a link-out. No seeded post currently hosts a video, but the gate is honored.

const MAX_IMAGES = 10;
const VIDEO_SIZE_LIMIT_MB = 5;

type PostImage = { url: string; alt: string; order: number };

type SeedPost = {
	number: number;
	type: "event" | "gallery" | "external-link" | "video-only";
	status?: string;
	mentions?: string[];
	publishedAt: string; // 'DD/MM/YYYY'
	fbPermalinkUrl: string | null;
	title: string | null;
	body: string;
	posterImageUrl: string;
	posterImageAlt: string;
	images?: PostImage[];
	videoUrl?: string | null;
	videoSizeMB?: number | null;
	externalUrl?: string | null;
	externalSourceName?: string | null;
};

const POSTS_PATH = join(process.cwd(), "seed-data", "posts.json");

// 'DD/MM/YYYY' -> Date (UTC midnight). Falls back to epoch-safe parse if already ISO.
function parseDate(s: string): Date {
	const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
	if (m) return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
	return new Date(s);
}

// A short plain-text excerpt from the (Markdown-ish) body: strip links/markup,
// collapse whitespace, take the first ~160 chars on a word boundary.
function deriveExcerpt(body: string): string {
	const plain = body
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) -> text
		.replace(/[#*_>`]/g, "")
		.replace(/\s+/g, " ")
		.trim();
	if (plain.length <= 160) return plain;
	const cut = plain.slice(0, 160);
	const lastSpace = cut.lastIndexOf(" ");
	return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}

function titleFor(post: SeedPost): string {
	if (post.title && post.title.trim()) return post.title.trim();
	// video-only / untitled: derive from the body, else a generic stable label.
	const ex = deriveExcerpt(post.body);
	return ex && ex !== "…" ? ex.replace(/…$/, "") : `Objava ${post.number}`;
}

export async function importPosts(): Promise<{
	created: number;
	updated: number;
	skipped: number;
	posts: number;
	unmatchedMentions: string[];
}> {
	const raw = JSON.parse(readFileSync(POSTS_PATH, "utf8")) as { posts: SeedPost[] };
	const posts = raw.posts;

	// Resolve mention NAMES -> Archer ids once.
	const allArchers = await prisma.archer.findMany({ select: { id: true, firstName: true, lastName: true } });
	const idByFullName = new Map(allArchers.map((a) => [`${a.firstName} ${a.lastName}`, a.id]));

	let created = 0;
	let updated = 0;
	let skipped = 0;
	const unmatchedMentions = new Set<string>();
	const usedSlugs = new Set<string>();

	for (const post of posts) {
		// Hosted-video gate: a club's own video >= 5 MB is skipped (per import rules).
		if (post.type === "video-only" && post.videoUrl && (post.videoSizeMB ?? 0) >= VIDEO_SIZE_LIMIT_MB) {
			console.warn(`[posts-import] post ${post.number} skipped — hosted video ${post.videoSizeMB} MB >= ${VIDEO_SIZE_LIMIT_MB} MB limit`);
			skipped++;
			continue;
		}

		const title = titleFor(post);

		// Build a unique slug (stable within this run + against the DB).
		let slug = slugify(title);
		for (let n = 2; usedSlugs.has(slug); n++) slug = `${slugify(title)}-${n}`;
		usedSlugs.add(slug);

		const mentionIds: string[] = [];
		for (const name of post.mentions ?? []) {
			const id = idByFullName.get(name);
			if (id) mentionIds.push(id);
			else {
				unmatchedMentions.add(name);
				console.warn(`[posts-import] mention "${name}" (post ${post.number}) has no roster archer — link skipped`);
			}
		}

		const hosted = post.type === "video-only" && Boolean(post.videoUrl);
		const images = (post.images ?? []).slice(0, MAX_IMAGES);
		const status = post.status ?? "published";
		const publishedAt = parseDate(post.publishedAt);

		const neutral = {
			source: "facebook-seed",
			fbPermalinkUrl: post.fbPermalinkUrl,
			mediaType: post.type,
			posterImageUrl: post.posterImageUrl,
			posterImageAlt: post.posterImageAlt,
			videoUrl: hosted ? post.videoUrl ?? null : null,
			// Hosted video reuses the poster image as the player poster.
			videoPosterUrl: hosted ? post.posterImageUrl : null,
			externalUrl: post.externalUrl ?? null,
			externalSourceName: post.externalSourceName ?? null,
			status,
			hidden: false,
			publishedAt,
			adminEdited: false,
			sourceLocale: "hr",
		};
		const excerpt = deriveExcerpt(post.body) || title;

		const existing = await prisma.article.findUnique({ where: { slug } });

		if (existing) {
			await prisma.$transaction(async (tx) => {
				await tx.article.update({
					where: { id: existing.id },
					data: {
						...neutral,
						updatedAt: new Date(),
						mentionedArchers: { set: mentionIds.map((id) => ({ id })) },
					},
				});
				await tx.articleImage.deleteMany({ where: { articleId: existing.id } });
				if (images.length) await tx.articleImage.createMany({ data: images.map((i) => ({ ...i, articleId: existing.id })) });
				await tx.articleTranslation.upsert({
					where: { articleId_locale: { articleId: existing.id, locale: "hr" } },
					create: { articleId: existing.id, locale: "hr", title, body: post.body, excerpt },
					update: { title, body: post.body, excerpt },
				});
			});
			updated++;
		} else {
			const now = new Date();
			await prisma.article.create({
				data: {
					slug,
					...neutral,
					createdAt: now,
					updatedAt: now,
					mentionedArchers: { connect: mentionIds.map((id) => ({ id })) },
					images: { create: images },
					translations: { create: [{ locale: "hr", title, body: post.body, excerpt }] },
				},
			});
			created++;
		}
	}

	return {
		created,
		updated,
		skipped,
		posts: posts.length,
		unmatchedMentions: [...unmatchedMentions],
	};
}
