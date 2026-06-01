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

await prisma.$disconnect();
console.log("✅ Seed import complete.");
