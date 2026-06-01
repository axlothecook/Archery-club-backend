// Slugify a title into a URL-safe slug, handling Croatian diacritics
// (č/ć→c, ž→z, š→s, đ→d) before stripping the rest.
const MAP: Record<string, string> = {
	č: "c", ć: "c", ž: "z", š: "s", đ: "d",
	Č: "c", Ć: "c", Ž: "z", Š: "s", Đ: "d",
};

export function slugify(title: string): string {
	return title
		.split("")
		.map((ch) => MAP[ch] ?? ch)
		.join("")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip remaining accents
		.replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → hyphen
		.replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
		.slice(0, 80) || "article";
}
