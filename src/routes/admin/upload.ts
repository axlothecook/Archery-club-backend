import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { HttpError } from "../../http/errors.ts";
import {
	isR2Configured,
	isAllowedImageType,
	isAllowedVideoType,
	uploadFile,
} from "../../storage/r2.ts";

export const adminUploadRouter = Router();

// Which entities an admin can upload a file for. The entityType becomes the R2
// key prefix (archery/<entityType>/<hash>.<ext>) AND gates whether video is
// allowed: ONLY 'article' (a post) may carry video; everything else is
// images-only. (Decided 2026-05-28.)
const ENTITY_TYPES = ["archer", "article", "event", "sponsor", "hero", "club-info", "achievement"] as const;
const bodySchema = z.object({ entityType: z.enum(ENTITY_TYPES) });

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (matches the article video gate)

// memoryStorage: the file is held as a Buffer in RAM, then streamed straight to
// R2 — no temp file on the Pi's disk. fileFilter is a CHEAP first gate on the
// CLIENT-CLAIMED mimetype (spoofable); the real check is the magic-byte test in
// the handler. We can't enforce the per-entity video rule here because req.body
// (entityType) is not reliably populated inside fileFilter — multipart field
// order is client-controlled — so that rule lives in the handler (OWASP/multer
// docs both say: validate file-vs-fields AFTER multer finishes).
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_BYTES, files: 1 },
	fileFilter: (_req, file, cb) => {
		const claimed = file.mimetype;
		if (isAllowedImageType(claimed) || isAllowedVideoType(claimed)) cb(null, true);
		else cb(new HttpError(400, `Unsupported file type "${claimed}". Allowed: JPEG, PNG, WebP (and MP4/WebM for posts).`));
	},
}).single("file");

// Run the multer middleware and normalise its callback errors into HttpError so
// the global error handler returns our standard { error: { message } } shape.
// NOTE on the old multer fileSize bug: multer 1.x could silently pass a TRUNCATED
// buffer through (with file.truncated=true and no error). VERIFIED 2026-05-28 that
// multer 2.1.1 + memoryStorage does NOT do this — an over-limit upload reliably
// rejects with a LIMIT_FILE_SIZE MulterError (caught below → 413), and the handler
// never sees the file. So no req.file.truncated guard is needed here (and the
// property isn't even set in 2.x). The 413 path below is the real guard.
function runMulter(req: Request, res: Response): Promise<void> {
	return new Promise((resolve, reject) => {
		upload(req, res, (err: unknown) => {
			if (!err) return resolve();
			if (err instanceof multer.MulterError) {
				if (err.code === "LIMIT_FILE_SIZE") return reject(new HttpError(413, "File too large (max 5 MB)."));
				return reject(new HttpError(400, `Upload error: ${err.message}`));
			}
			reject(err); // already an HttpError (from fileFilter) or unknown
		});
	});
}

// POST /admin/upload — multipart/form-data with field `file` + text field
// `entityType`. Returns { url } (a permanent images.axlothecook.com URL) which
// the admin then saves into the entity's image/video field.
adminUploadRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
	try {
		if (!isR2Configured()) throw new HttpError(503, "Image storage (R2) is not configured on the server.");

		await runMulter(req, res);

		const parsed = bodySchema.safeParse(req.body);
		if (!parsed.success) {
			throw new HttpError(400, `Invalid entityType. Must be one of: ${ENTITY_TYPES.join(", ")}.`);
		}
		const { entityType } = parsed.data;

		const file = req.file;
		if (!file) throw new HttpError(400, "No file uploaded (expected multipart field 'file').");

		// MAGIC-BYTE check: derive the REAL type from the bytes, not the spoofable
		// client Content-Type (OWASP File Upload). Reject if it isn't a type we allow.
		const detected = await fileTypeFromBuffer(file.buffer);
		const realType = detected?.mime ?? "";
		const isImage = isAllowedImageType(realType);
		const isVideo = isAllowedVideoType(realType);
		if (!isImage && !isVideo) {
			throw new HttpError(400, "File content is not a supported image or video.");
		}

		// PER-ENTITY rule: video only for posts/articles.
		if (isVideo && entityType !== "article") {
			throw new HttpError(400, `Video uploads are only allowed for posts; '${entityType}' accepts images only.`);
		}

		// Upload under a versioned key derived from the DETECTED type.
		const { url } = await uploadFile(entityType, realType, file.buffer);
		res.status(201).json({ url });
	} catch (err) {
		next(err);
	}
});
