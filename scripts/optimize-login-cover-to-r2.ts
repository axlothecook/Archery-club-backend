/**
 * One-off: optimize the /prijava login cover image and upload it to R2.
 *
 * The original (Supabase) is a 4447x6670 / ~1.66 MB progressive JPEG shown in a
 * ~half-screen panel — the oversize is what makes the login feel slow (huge
 * decode + downscale cost on the client). This downscales it to a sane width,
 * re-encodes to WebP, and stores it on R2 at:
 *   <R2_PUBLIC_BASE>/archery/stock-bow-photos/background.webp
 * (same `archery/<bucket>/<file>` layout as migrate-supabase-to-r2.ts).
 *
 * Run:  npx tsx scripts/optimize-login-cover-to-r2.ts
 * Requires the R2_* env vars (same as src/storage/r2.ts). Idempotent — re-running
 * overwrites the same key. Safe to delete after the FE URL is repointed.
 */
import "dotenv/config";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env["R2_ACCOUNT_ID"];
const BUCKET = process.env["R2_BUCKET"];
const PUBLIC_BASE = (process.env["R2_PUBLIC_BASE"] || "").replace(/\/$/, "");
const ACCESS_KEY_ID = process.env["R2_ACCESS_KEY_ID"];
const SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"];

if (!ACCOUNT_ID || !BUCKET || !PUBLIC_BASE || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
	console.error("R2 env not configured (need R2_ACCOUNT_ID, R2_BUCKET, R2_PUBLIC_BASE, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY).");
	process.exit(1);
}

const SOURCE =
	"https://rsjqguihhwunvpjsybtw.supabase.co/storage/v1/object/public/stock-bow-photos/background.jpg";
const KEY = "archery/stock-bow-photos/background.webp";
// The panel is at most half the viewport, portrait. 1600px wide covers retina at
// that size; height is left to aspect (withoutEnlargement avoids upscaling).
const TARGET_WIDTH = 1600;
const WEBP_QUALITY = 82;

const s3 = new S3Client({
	region: "auto",
	endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED"
});

async function main() {
	console.log(`Fetching original: ${SOURCE}`);
	const res = await fetch(SOURCE);
	if (!res.ok) {
		console.error(`Fetch failed: HTTP ${res.status}`);
		process.exit(1);
	}
	const original = Buffer.from(await res.arrayBuffer());
	const src = sharp(original);
	const meta = await src.metadata();
	console.log(`  original: ${meta.width}x${meta.height}, ${(original.length / 1024) | 0} KB (${meta.format})`);

	const optimized = await src
		.rotate() // respect EXIF orientation
		.resize({ width: TARGET_WIDTH, withoutEnlargement: true })
		.webp({ quality: WEBP_QUALITY })
		.toBuffer();

	const outMeta = await sharp(optimized).metadata();
	console.log(
		`  optimized: ${outMeta.width}x${outMeta.height}, ${(optimized.length / 1024) | 0} KB (webp)  ` +
			`-> ${Math.round((1 - optimized.length / original.length) * 100)}% smaller`
	);

	await s3.send(
		new PutObjectCommand({
			Bucket: BUCKET,
			Key: KEY,
			Body: optimized,
			ContentType: "image/webp",
			CacheControl: "public, max-age=31536000, immutable"
		})
	);

	const url = `${PUBLIC_BASE}/${KEY}`;
	console.log(`\nUploaded -> ${url}`);
	console.log("Repoint the FE COVER_IMAGE in src/routes/prijava/+page.svelte to this URL.");
}

main().catch((e) => {
	console.error("ERROR:", (e as Error).message);
	process.exit(1);
});
