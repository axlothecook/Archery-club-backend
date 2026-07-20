import type { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors.ts";

// Read-only gate for the public "guest" demo account. The dashboard is a
// portfolio piece: anyone can browse it via the login page's guest button, but
// a guest must never be able to change anything. Runs AFTER requireAuth (needs
// req.admin). GET/HEAD/OPTIONS pass; any mutating method gets a 403 with a
// message the dashboard surfaces as-is (hence Croatian, like the UI).
export function guestReadOnly(req: Request, _res: Response, next: NextFunction): void {
	if (req.admin?.role === "guest" && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
		next(new HttpError(403, "Gost pregled: izmjene su onemogućene."));
		return;
	}
	next();
}
