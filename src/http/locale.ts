import type { Locale } from "archery-contracts";

const LOCALES: readonly Locale[] = ["hr", "en", "ko", "ar", "es", "de", "fr", "zh"];
const DEFAULT_LOCALE: Locale = "hr";

// Read & validate the ?locale= query param. Unknown/missing → default 'hr'.
export function localeFromQuery(value: unknown): Locale {
	if (typeof value === "string" && (LOCALES as readonly string[]).includes(value)) {
		return value as Locale;
	}
	return DEFAULT_LOCALE;
}
