// Derive an event's calendar LEVEL (one of the four seeded EventLevel names) from
// the signals available at import time: the event NAME, the HSS calendar FORMAT
// code, and the COUNTRY / domestic flag. Both event importers (domestic + WA) use
// this so every ClubEvent gets a level → the /schedule calendar colours + the
// scope icon (globe / Europe / Croatia) on the front-end.
//
// Mapping (locked with the user 2026-06-12), in priority order:
//   1. Name says World/Olympic/Mediterranean → Svjetski kup   (overrides a
//      misleading format, e.g. "Hyundai World Cup Stage 3" carries format "Kup")
//   2. Name says European                    → Europsko prvenstvo
//   3. HSS format WC / IWS / WRE             → Svjetski kup
//   4. HSS format EWC / EC / EGP / EYC       → Europsko prvenstvo
//   5. Domestic (HR) + format PH (national)  → Državno
//   6. Domestic (HR), anything else          → Domaće
//   7. International, no clearer signal       → Europsko prvenstvo if a European
//      country, else Svjetski kup (world-level by default).

// The four seeded level names (hr). Kept here as the single source of the strings
// the importer resolves to EventLevel ids via importEventLevels()'s nameToId map.
export const LEVEL = {
	world: "Svjetski kup",
	european: "Europsko prvenstvo",
	state: "Državno",
	domestic: "Domaće",
} as const;

export type LevelName = (typeof LEVEL)[keyof typeof LEVEL];

// Country codes treated as European for rule 7 (the CEC / regional cups host
// nations + common neighbours). Non-exhaustive on purpose — only the ones that
// actually appear, plus obvious neighbours; anything else falls to world.
const EUROPEAN_COUNTRIES = new Set([
	"HR", "SLO", "SRB", "SVK", "AUT", "HUN", "ITA", "ESP", "FRA", "BUL", "NL",
	"LUX", "GER", "DEU", "POL", "CZE", "GBR", "UKR", "ROU", "GRE", "POR", "BEL",
	"SUI", "SWE", "NOR", "FIN", "DEN", "TUR",
]);

type LevelSignals = {
	name: string;
	format?: string | null;
	country?: string | null;
	domestic?: boolean;
};

export function deriveEventLevel({ name, format, country, domestic }: LevelSignals): LevelName {
	const n = name.toLowerCase();
	const fmt = (format ?? "").toUpperCase();

	// 1. Name-based WORLD signals (win over a misleading format code).
	if (
		n.includes("world cup") ||
		n.includes("world championship") ||
		n.includes("world series") ||
		n.includes("olympic") ||
		n.includes("mediterranean")
	) {
		return LEVEL.world;
	}

	// 2. Name-based EUROPEAN signals.
	if (n.includes("european") || n.includes("euro ") || n.startsWith("euro")) {
		return LEVEL.european;
	}

	// 3 & 4. HSS format codes.
	if (fmt === "WC" || fmt === "IWS" || fmt === "WRE") return LEVEL.world;
	if (fmt === "EWC" || fmt === "EC" || fmt === "EGP" || fmt === "EYC") return LEVEL.european;

	// 5 & 6. Domestic (Croatia).
	const isDomestic = domestic ?? country === "HR";
	if (isDomestic) {
		// PH = Prvenstvo Hrvatske (national championship). "PH,H3DK" combo counts too.
		if (fmt.startsWith("PH")) return LEVEL.state;
		return LEVEL.domestic;
	}

	// 7. International with no clearer signal: European country → Europsko, else world.
	if (country && EUROPEAN_COUNTRIES.has(country.toUpperCase())) return LEVEL.european;
	return LEVEL.world;
}
