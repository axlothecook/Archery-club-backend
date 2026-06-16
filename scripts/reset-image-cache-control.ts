// One-off: change the Cache-Control on the BULK-MIGRATED static images under the
// archery/ prefix from `immutable, max-age=1yr` to a REVALIDATING policy, so an
// image replaced at the same key is picked up within a day (the ETag lets the edge
// revalidate cheaply) instead of being stuck for a year.
//
// NB: admin-uploaded images use content-hashed keys (new bytes → new URL), so they
// don't need this — but a uniform revalidating policy on the whole prefix is safe.
// Run: npx tsx scripts/reset-image-cache-control.ts
import "dotenv/config";
import {
	S3Client,
	ListObjectsV2Command,
	CopyObjectCommand
} from "@aws-sdk/client-s3";

const ACCOUNT_ID = process.env["R2_ACCOUNT_ID"];
const BUCKET = process.env["R2_BUCKET"];
const ACCESS_KEY_ID = process.env["R2_ACCESS_KEY_ID"];
const SECRET_ACCESS_KEY = process.env["R2_SECRET_ACCESS_KEY"];

if (!ACCOUNT_ID || !BUCKET || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
	console.error("R2 env not configured.");
	process.exit(1);
}

const PREFIX = "archery/";
const NEW_CACHE_CONTROL = "public, max-age=86400, must-revalidate"; // 1 day + revalidate

const CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
	webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", mp4: "video/mp4"
};

const s3 = new S3Client({
	region: "auto",
	endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
	credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED"
});

async function main() {
	let token: string | undefined;
	let total = 0;
	do {
		const list = await s3.send(
			new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token })
		);
		for (const obj of list.Contents ?? []) {
			const key = obj.Key!;
			const ext = key.split(".").pop()?.toLowerCase() ?? "";
			const ct = CONTENT_TYPES[ext] ?? "application/octet-stream";
			// CopyObject onto itself with MetadataDirective REPLACE = change metadata in place.
			await s3.send(
				new CopyObjectCommand({
					Bucket: BUCKET,
					Key: key,
					CopySource: `${BUCKET}/${key}`,
					MetadataDirective: "REPLACE",
					CacheControl: NEW_CACHE_CONTROL,
					ContentType: ct
				})
			);
			total++;
			console.log(`  set cache-control: ${key}`);
		}
		token = list.IsTruncated ? list.NextContinuationToken : undefined;
	} while (token);
	console.log(`\nDone: ${total} object(s) re-set to "${NEW_CACHE_CONTROL}".`);
}

main();
