import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { prisma } from './db.ts';
import { sponsorsRouter } from './routes/sponsors.ts';
import { achievementsRouter } from './routes/achievements.ts';
import { eventsRouter } from './routes/events.ts';
import { teamRouter } from './routes/team.ts';
import { articlesRouter } from './routes/articles.ts';
import { heroRouter } from './routes/hero.ts';
import { clubInfoRouter } from './routes/club-info.ts';
import { clubHistoryRouter } from './routes/club-history.ts';
import { clubIdentityRouter } from './routes/club-identity.ts';
import { eventLevelsRouter } from './routes/event-levels.ts';
import { authRouter } from './routes/auth.ts';
import { requireAuth } from './http/require-auth.ts';
import { adminSponsorsRouter } from './routes/admin/sponsors.ts';
import { adminAchievementsRouter } from './routes/admin/achievements.ts';
import { adminArticlesRouter } from './routes/admin/articles.ts';
import { adminEventLevelsRouter } from './routes/admin/event-levels.ts';
import { adminEventsRouter } from './routes/admin/events.ts';
import { adminArchersRouter } from './routes/admin/archers.ts';
import { adminHeroRouter } from './routes/admin/hero.ts';
import { adminClubInfoRouter } from './routes/admin/club-info.ts';
import { inquiriesRouter } from './routes/inquiries.ts';
import { adminInquiriesRouter } from './routes/admin/inquiries.ts';
import { adminUploadRouter } from './routes/admin/upload.ts';
import { adminDevRouter } from './routes/admin/dev.ts';
import { errorHandler } from './http/errors.ts';

const app = express();

// Security headers (helmet). This is a JSON API — HTML/page CSP is the
// SvelteKit front-end's job (kit.csp), so CSP is disabled here. HSTS is also set
// (1y); if Cloudflare sets it at the edge too, dedupe at deploy (one layer only).
app.use(
	helmet({
		contentSecurityPolicy: false, // no HTML served; CSP belongs on the front-end
		hsts: { maxAge: 31536000, includeSubDomains: true },
	}),
);

// CORS — the SvelteKit front-end is a different origin (dev: localhost:5173/4173;
// prod: the public domain). Allowed origins come from CORS_ORIGINS (comma-list);
// dev defaults cover the local Vite ports. credentials:true so session cookies
// (admin auth) can ride along on cross-origin requests.
const DEV_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:4173',
	'http://localhost:5174',
];
const allowedOrigins = (process.env.CORS_ORIGINS ?? DEV_ORIGINS.join(','))
	.split(',')
	.map((o) => o.trim())
	.filter(Boolean);

app.use(
	cors({
		origin: allowedOrigins,
		credentials: true,
	}),
);

app.use(express.json());

// Health check — confirms the server is alive AND can reach the database.
// `SELECT 1` is the cheapest query that proves the Prisma client + driver
// adapter actually connect to Postgres. Returns 503 if the DB is down.
app.get('/health', async (_req, res) => {
	try {
		await prisma.$queryRaw`SELECT 1`;
		res.json({ status: 'ok', service: 'archery-club-backend', db: 'ok', time: new Date().toISOString() });
	} catch {
		res.status(503).json({ status: 'error', service: 'archery-club-backend', db: 'down', time: new Date().toISOString() });
	}
});

// Public read API (no auth) — front-end consumes these.
app.use('/sponsors', sponsorsRouter);
app.use('/achievements', achievementsRouter);
app.use('/events', eventsRouter);
app.use('/event-levels', eventLevelsRouter);
app.use('/team', teamRouter);
app.use('/articles', articlesRouter);
app.use('/hero', heroRouter);
app.use('/club-info', clubInfoRouter);
app.use('/club-history', clubHistoryRouter);
app.use('/club-identity', clubIdentityRouter);

// Auth (login/logout/me).
app.use('/auth', authRouter);

// Public inquiry intake (NO auth — rate-limited + spam-guarded per route).
app.use('/inquiries', inquiriesRouter);

// Dashboard write API — every /admin route requires a valid session.
app.use('/admin', requireAuth);
app.use('/admin/sponsors', adminSponsorsRouter);
app.use('/admin/achievements', adminAchievementsRouter);
app.use('/admin/articles', adminArticlesRouter);
app.use('/admin/event-levels', adminEventLevelsRouter);
app.use('/admin/events', adminEventsRouter);
app.use('/admin/archers', adminArchersRouter);
app.use('/admin/hero', adminHeroRouter);
app.use('/admin/club-info', adminClubInfoRouter);
app.use('/admin/inquiries', adminInquiriesRouter);
app.use('/admin/upload', adminUploadRouter);
app.use('/admin/dev', adminDevRouter);

// Global error handler — must be registered AFTER all routes.
app.use(errorHandler);

export { app };
