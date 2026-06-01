import { Router } from "express";
import { prisma } from "../db.ts";
import { toHeroImage } from "../mappers/hero-image.ts";
import { safeMapList } from "../http/safe-map.ts";

export const heroRouter = Router();

// GET /hero — homepage hero images, in display order. No locale (image-only).
heroRouter.get("/", async (_req, res, next) => {
	try {
		const rows = await prisma.heroImage.findMany({ orderBy: { order: "asc" } });
		res.json(safeMapList(rows, toHeroImage, "heroImage", (r) => r.id));
	} catch (err) {
		next(err);
	}
});
