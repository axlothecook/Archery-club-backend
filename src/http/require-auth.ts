import type { NextFunction, Request, Response } from "express";
import type { Admin } from "../generated/prisma/client.ts";
import { readSessionCookie } from "../auth/cookies.ts";
import { validateSession } from "../auth/session.ts";
import { HttpError } from "./errors.ts";

// Make the authenticated admin available on the request after requireAuth.
declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		interface Request {
			admin?: Admin;
		}
	}
}

// Gate for protected (dashboard) routes. Validates the session cookie; on
// success attaches req.admin and continues, else 401. Slides the idle window.
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
	try {
		const sessionId = readSessionCookie(req);
		if (!sessionId) throw new HttpError(401, "Not authenticated");

		const admin = await validateSession(sessionId);
		if (!admin) throw new HttpError(401, "Session expired or invalid");

		req.admin = admin;
		next();
	} catch (err) {
		next(err);
	}
}
