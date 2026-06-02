// Import the prepared seed data (seed-data/*.json) into the database.
// Runs roster FIRST (so posts' mentioned-archer names + coach names resolve to
// real Archer ids), then posts. Idempotent — safe to re-run after editing the
// JSON. Run:  npx tsx scripts/import-seed.ts
import "dotenv/config";
import { prisma } from "../src/db.ts";
import { importRoster } from "../src/import/import-roster.ts";
import { importPosts } from "../src/import/import-posts.ts";
import { importAchievements } from "../src/import/import-achievements.ts";
import { importAchievementCategories } from "../src/import/import-achievement-categories.ts";
import { importHomeStatImages } from "../src/import/import-home-stat-images.ts";
import { importClubHistory } from "../src/import/import-club-history.ts";
import { importClubInfo } from "../src/import/import-club-info.ts";
import { importSponsors } from "../src/import/import-sponsors.ts";
import { importEventLevels } from "../src/import/import-event-levels.ts";
import { importUpcomingWaEvents } from "../src/import/import-upcoming-wa-events.ts";
import { importDomesticEvents } from "../src/import/import-domestic-events.ts";

const roster = await importRoster();
console.log(`Roster: ${roster.created} created, ${roster.updated} updated (${roster.archers} total). Coach links: ${roster.coachLinks}.`);
if (roster.unmatchedCoaches.length) console.warn(`⚠️ unmatched coach names: ${roster.unmatchedCoaches.join(", ")}`);

const posts = await importPosts();
console.log(`Posts: ${posts.created} created, ${posts.updated} updated, ${posts.skipped} skipped (${posts.posts} total).`);
if (posts.unmatchedMentions.length) console.warn(`⚠️ unmatched mention names: ${posts.unmatchedMentions.join(", ")}`);

const achievements = await importAchievements();
console.log(`Achievements: ${achievements.created} created (${achievements.rows} rows).`);
if (achievements.unmatchedArchers.length) console.warn(`⚠️ unmatched achievement archers: ${achievements.unmatchedArchers.join(", ")}`);

const categories = await importAchievementCategories();
console.log(`Achievement categories: ${categories.upserted} upserted.`);
if (categories.orphans.length) console.warn(`⚠️ orphan category types (match no achievement title): ${categories.orphans.join(", ")}`);

const statImages = await importHomeStatImages();
console.log(`Home stat images: ${statImages.upserted} upserted.`);
if (statImages.unknownSlots.length) console.warn(`⚠️ unknown stat slots: ${statImages.unknownSlots.join(", ")}`);

const history = await importClubHistory();
console.log(`Club history: ${history.periods} periods, ${history.translations} translations upserted.`);

const clubInfo = await importClubInfo();
console.log(`Club info: singleton ${clubInfo.created ? "created (identity + contact)" : "updated (identity only; contact left to admin)"}.`);

const sponsors = await importSponsors();
console.log(`Sponsors: ${sponsors.created} created, ${sponsors.updated} updated.`);
if (sponsors.placeholders.length) console.warn(`⚠️ sponsor placeholders still unfilled: ${sponsors.placeholders.join(", ")}`);

const eventLevels = await importEventLevels();
console.log(`Event levels: ${eventLevels.upserted} upserted.`);

// /schedule events — two paths (see archery-events-generation-design):
// A) external/WA-covered (live WA feed, matched to attended series, projected),
// B) domestic (HSS calendar rows NOT covered by WA, passed->2027). Path B reuses
// path A's ATTENDED_SERIES list to de-dupe, so order doesn't matter for correctness.
const waEvents = await importUpcomingWaEvents();
console.log(`External events (WA): ${waEvents.kept.length} upcoming + ${waEvents.projected.length} projected->2027 (${waEvents.created} created, ${waEvents.updated} updated).`);

const domesticEvents = await importDomesticEvents();
console.log(`Domestic events: ${domesticEvents.imported.length} imported (${domesticEvents.created} created, ${domesticEvents.updated} updated).`);
if (domesticEvents.skippedWaCovered.length) console.log(`  (skipped ${new Set(domesticEvents.skippedWaCovered).size} WA-covered -> path A)`);

await prisma.$disconnect();
console.log("✅ Seed import complete.");
