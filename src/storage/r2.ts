import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

// Cloudflare R2 (S3-compatible) image storage. Reuses the same bucket + public
// domain as the existing roster/event images (images.axlothecook.com, shared
// `axlothecook-images` bucket, `archery/` prefix — see the migration scripts).
//
// VERSIONED KEYS (binding decision, see TODO.md "Image storage on R2"): every
// upload's key embeds a content hash — `archery/<entityType>/<contentHash>.<ext>`.
// Same bytes ⇒ same key (no needless churn); ANY content change ⇒ a NEW key ⇒
// a new URL, so Cloudflare's ~4h edge cache can never serve a stale image after
// an edit. We never overwrite a key. On replace/delete, the OLD object is deleted
// so the bucket doesn't accumulate orphans.

const PROJECT_PREFIX = "archery";

const ACCOUNT_ID = process.env["R2_ACCOUNT_ID"];
const BUCKET = process.env["R2_BUCKET"];
const PUBLIC_BASE = (process.env["R2_PUBLIC_BASE"] || "").replace(/\/$/, "");
const ACCESS_KEY_ID = process.env["R2_ACCESS_KEY_ID"];
const SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"];

export function isR2Configured(): boolean {
	return Boolean(ACCOUNT_ID && BUCKET && PUBLIC_BASE && ACCESS_KEY_ID && SECRET_ACCESS_KEY);
}

let client: S3Client | null = null;
function s3(): S3Client {
	if (!isR2Configured()) {
		throw new Error("R2 is not configured — set R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_BASE, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env");
	}
	if (!client) {
		client = new S3Client({
			region: "auto",
			endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
			credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! },
			// R2 doesn't support the new default AWS integrity checksums — only send
			// them when the operation requires it (same flags as the migration scripts).
			requestChecksumCalculation: "WHEN_REQUIRED",
			responseChecksumValidation: "WHEN_REQUIRED",
		});
	}
	return client;
}

// Allowed file types → extension. Images club-wide; video is additionally
// allowed but ONLY for posts/articles (the route enforces that per entityType).
// `contentType` here is the type DETECTED from the file's magic bytes (file-type),
// never the client-sent Content-Type (which is spoofable — OWASP File Upload).
const IMAGE_TYPES: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};
const VIDEO_TYPES: Record<string, string> = {
	"video/mp4": "mp4",
	"video/webm": "webm",
};
const EXT_BY_TYPE: Record<string, string> = { ...IMAGE_TYPES, ...VIDEO_TYPES };

export function isAllowedImageType(contentType: string): boolean {
	return contentType in IMAGE_TYPES;
}
export function isAllowedVideoType(contentType: string): boolean {
	return contentType in VIDEO_TYPES;
}

// Build the versioned R2 key for a file's bytes: archery/<entityType>/<hash>.<ext>.
// The content hash makes the key change whenever the bytes change, so an edited
// image gets a NEW url the CDN has never cached (no 4h stale-image bug). Identical
// bytes re-uploaded ⇒ identical key+content ⇒ a harmless no-op overwrite.
export function r2KeyFor(entityType: string, contentType: string, bytes: Buffer): string {
	const ext = EXT_BY_TYPE[contentType] ?? "bin";
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
	return `${PROJECT_PREFIX}/${entityType}/${hash}.${ext}`;
}

export function publicUrlFor(key: string): string {
	return `${PUBLIC_BASE}/${key}`;
}

// Upload a file and return its permanent public URL. `contentType` MUST be the
// magic-byte-detected type (see r2KeyFor).
export async function uploadFile(
	entityType: string,
	contentType: string,
	bytes: Buffer,
): Promise<{ url: string; key: string }> {
	const key = r2KeyFor(entityType, contentType, bytes);
	await s3().send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: key,
			Body: bytes,
			ContentType: contentType,
		}),
	);
	return { url: publicUrlFor(key), key };
}

// Delete an object by its public URL (used when an image is replaced/removed and
// the old key is now orphaned). Best-effort: a missing object is not an error.
export async function deleteImageByUrl(url: string): Promise<void> {
	if (!PUBLIC_BASE || !url.startsWith(PUBLIC_BASE + "/")) return;
	const key = url.slice(PUBLIC_BASE.length + 1);
	await s3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
