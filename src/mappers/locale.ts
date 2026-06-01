import type { Locale } from "archery-contracts";

// Pick the translation row for the requested locale, falling back to the
// record's source locale so the public API never returns blank text.
// `translations` is any per-locale row array ({ locale, ... }); returns the
// chosen row plus the locale it actually resolved to.
export function resolveTranslation<T extends { locale: string }>(
	translations: T[],
	requested: Locale,
	sourceLocale: Locale,
): { row: T; locale: Locale } {
	const wanted = translations.find((t) => t.locale === requested);
	if (wanted) return { row: wanted, locale: requested };

	const source = translations.find((t) => t.locale === sourceLocale);
	if (source) return { row: source, locale: sourceLocale };

	// No source row either (shouldn't happen for valid data) — fall back to the
	// first available, or throw if there are genuinely none.
	const first = translations[0];
	if (!first) throw new Error("Record has no translations");
	return { row: first, locale: first.locale as Locale };
}
