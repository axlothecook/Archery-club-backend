/**
 * One-off migration: copy the remaining static images from Supabase Storage to
 * Cloudflare R2, preserving paths as `archery/<bucket>/<filename>` so the public
 * URL becomes `<R2_PUBLIC_BASE>/archery/<bucket>/<filename>`.
 *
 * Reads the list of Supabase URLs from a file (one URL per line) passed as the
 * first arg (default: scripts/.supa-urls.txt). For each: download from Supabase,
 * upload to R2 under the path-preserving key, and print the old->new mapping.
 *
 * Idempotent-ish: re-running re-uploads the same bytes to the same key (cheap, no
 * key churn). Run:  npx tsx scripts/migrate-supabase-to-r2.ts [urls-file]
 *
 * Requires the R2_* env vars (same as src/storage/r2.ts).
 */
import "dotenv/config"; // load R2_* + other vars from .env (same as the other scripts)
import { readFileSync, writeFileSync } from "node:fs";
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

const PROJECT_PREFIX = "archery";
const SUPA_MARKER = "/storage/v1/object/public/";

const s3 = new S3Client({
	region: "auto",
	endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED"
});

const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	gif: "image/gif",
	svg: "image/svg+xml",
	mp4: "video/mp4"
};

function r2KeyFor(supaUrl: string): string {
	// Everything after `/public/` is `<bucket>/<path...>`; decode %20 etc.
	const after = supaUrl.split(SUPA_MARKER)[1];
	if (!after) throw new Error(`Not a Supabase public URL: ${supaUrl}`);
	// Normalise the legacy "front page" bucket (space) to a URL-safe "front-page".
	const decoded = decodeURIComponent(after).replace(/^front page\//, "front-page/");
	return `${PROJECT_PREFIX}/${decoded}`;
}

async function main() {
	const urlsFile = process.argv[2] || "scripts/.supa-urls.txt";
	const urls = readFileSync(urlsFile, "utf8")
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l && l.includes(SUPA_MARKER));

	console.log(`Migrating ${urls.length} file(s) from Supabase -> R2 (${PUBLIC_BASE})\n`);

	const mapping: { from: string; to: string }[] = [];
	let ok = 0;
	let fail = 0;

	for (const supaUrl of urls) {
		const key = r2KeyFor(supaUrl);
		const ext = key.split(".").pop()?.toLowerCase() || "";
		const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
		try {
			const res = await fetch(supaUrl);
			if (!res.ok) {
				console.error(`  FAIL ${res.status}  ${supaUrl}`);
				fail++;
				continue;
			}
			const body = Buffer.from(await res.arrayBuffer());
			await s3.send(
				new PutObjectCommand({
					Bucket: BUCKET,
					Key: key,
					Body: body,
					ContentType: contentType,
					CacheControl: "public, max-age=31536000, immutable"
				})
			);
			const to = `${PUBLIC_BASE}/${key}`;
			mapping.push({ from: supaUrl, to });
			ok++;
			console.log(`  OK  ${(body.length / 1024) | 0}KB  ${key}`);
		} catch (e) {
			console.error(`  FAIL  ${supaUrl}  ${(e as Error).message}`);
			fail++;
		}
	}

	writeFileSync("scripts/.r2-url-map.json", JSON.stringify(mapping, null, 2));
	console.log(`\nDone: ${ok} uploaded, ${fail} failed. Mapping -> scripts/.r2-url-map.json`);
	if (fail > 0) process.exit(1);
}

main();
