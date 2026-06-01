import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { recentSkipped } from "../../http/safe-map.ts";
import { HttpError } from "../../http/errors.ts";

// Developer-only diagnostics. Website/data-integrity problems are the
// DEVELOPER's concern (role 'developer'), not the club admin's — so these are
// gated tighter than the rest of /admin.
export const adminDevRouter = Router();

function requireDeveloper(req: Request, _res: Response, next: NextFunction): void {
	if (req.admin?.role !== "developer") {
		next(new HttpError(403, "Developer access required"));
		return;
	}
	next();
}

// GET /admin/dev/data-health — records skipped by the runtime fail-safe
// (safeMapList): a bad record was logged + dropped from a public feed instead
// of 500-ing it. Empty = healthy.
adminDevRouter.get("/data-health", requireDeveloper, (_req, res) => {
	const skipped = recentSkipped();
	res.json({ skippedCount: skipped.length, skipped });
});
