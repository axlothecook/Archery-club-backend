// Rewrite every migrated Supabase URL -> its R2 URL across the BE seed JSON and the
// FE source, using scripts/.r2-url-map.json produced by migrate-supabase-to-r2.ts.
// Also rewrites the FE homepage hero BASE const ("front page/" -> R2 "front-page/").
// Preserves file bytes otherwise (plain string replace). Run with: node scripts/rewrite-supabase-urls.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BE = process.cwd(); // Archery-club-backend
const FE = join(BE, '..', 'Archery-club-front-end');

const map = JSON.parse(readFileSync('scripts/.r2-url-map.json', 'utf8'));

// Build replacement pairs. Each migrated file gets BOTH its raw and %20-encoded
// Supabase form mapped to the R2 URL (covers seed + FE literal variants).
const pairs = [];
for (const { from, to } of map) {
	pairs.push([from, to]);
	const enc = from.replace(/ /g, '%20');
	if (enc !== from) pairs.push([enc, to]);
	const dec = from.replace(/%20/g, ' ');
	if (dec !== from) pairs.push([dec, to]);
}
// FE homepage hero BASE const: the bare "front page/" base -> R2 "front-page/".
pairs.push([
	'https://rsjqguihhwunvpjsybtw.supabase.co/storage/v1/object/public/front%20page/',
	'https://images.axlothecook.com/archery/front-page/'
]);
pairs.push([
	'https://rsjqguihhwunvpjsybtw.supabase.co/storage/v1/object/public/front page/',
	'https://images.axlothecook.com/archery/front-page/'
]);

const targets = [
	// BE seed JSON (committed data files only — skip .bak/.example)
	...['posts.json','achievements.json','club-history.json','club-info.json','crest.json',
	    'home-stat-images.json','jersey.json','roster.json','sponsors.json','achievement-categories.json']
		.map((f) => join(BE, 'seed-data', f)),
];

// FE source files that referenced Supabase
const FE_FILES = [
	'src/lib/components/Flourish.svelte','src/lib/components/Footer.svelte','src/lib/components/NavBar.svelte',
	'src/lib/components/RosterCard.svelte','src/lib/components/SectionExplore.svelte','src/routes/+page.svelte',
	'src/routes/klub/identitet/+layout.svelte','src/routes/klub/identitet/+page.svelte',
	'src/routes/klub/povijest/+layout.svelte','src/routes/klub/povijest/[slug]/+page.svelte',
	'src/routes/momcad/+page.svelte','src/routes/momcad/[slug]/+page.svelte','src/routes/najnovije/+page.svelte',
	'src/routes/postignuca/+page.svelte','src/routes/raspored/+page.svelte','src/routes/sponzori/+page.svelte'
].map((f) => join(FE, f));

let totalEdits = 0;
for (const file of [...targets, ...FE_FILES]) {
	let s;
	try { s = readFileSync(file, 'utf8'); } catch { console.log('skip (missing):', file); continue; }
	let n = 0;
	for (const [a, b] of pairs) {
		if (s.includes(a)) { const before = s; s = s.split(a).join(b); n += (before.length !== s.length) ? 1 : 0; }
	}
	if (n > 0) { writeFileSync(file, s); totalEdits += n; console.log(`${n} pattern(s) -> ${file}`); }
}
console.log(`\nDone. ${totalEdits} pattern-replacements applied.`);

// Report any remaining supabase refs (should be only .bak/.example or none).
console.log('\nRemaining "supabase.co" in rewritten files:');
for (const file of [...targets, ...FE_FILES]) {
	try {
		const s = readFileSync(file, 'utf8');
		const c = (s.match(/supabase\.co/g) || []).length;
		if (c) console.log(`  ${c}  ${file}`);
	} catch {}
}
