import type { ImageRef } from "archery-contracts";

// Stock achievement icons (hosted once on R2). An achievement's display image is
// EITHER its own custom imageUrl (a special photo, e.g. a real podium shot) OR,
// when none is set, the stock icon derived from its medal colour (medals) or its
// scope level (records). Stored ONCE here — never repeated per achievement row.
// The 6 files were uploaded to R2 under archery/achievement-icons/ (2026-05-29).

const BASE = "https://images.axlothecook.com/archery/achievement-icons";

// Medal-colour icons (for type !== 'record' rows that have a medal).
const MEDAL_ICON: Record<"gold" | "silver" | "bronze", string> = {
	gold: `${BASE}/gold-medal.png`,
	silver: `${BASE}/silver-medal.png`,
	bronze: `${BASE}/bronze-medal.png`,
};

// Record scope icons (for type === 'record' rows), keyed by level. 'state' = the
// Croatian (national) record icon; 'european'/'world' as named.
const RECORD_ICON: Record<string, string> = {
	state: `${BASE}/croatia-record.svg`,
	european: `${BASE}/europe-record.svg`,
	world: `${BASE}/global-record.svg`,
};

// The stock icon for an achievement, or null if none applies (e.g. a record at
// an unmapped level, or a medal-less non-record row).
export function stockIcon(
	type: string,
	level: string,
	medal: string | null,
): ImageRef | null {
	if (type === "record") {
		const url = RECORD_ICON[level];
		return url ? { url, alt: "" } : null;
	}
	if (medal && medal in MEDAL_ICON) {
		return { url: MEDAL_ICON[medal as keyof typeof MEDAL_ICON], alt: "" };
	}
	return null;
}
