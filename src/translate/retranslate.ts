import {
	fillSponsors, fillArchers, fillAchievements, fillEventLevels,
	fillClubEvents, fillArticles, fillClubHistory, fillClubInfo,
} from "./fill.ts";
import type { FillOpts } from "./fill.ts";

// Write-hook helper: after an admin creates/edits hr content, that entity TYPE's
// target translations are stale. This re-runs ONLY that entity's filler with
// force=true so the edited locales are regenerated (mock: "[locale] …" stubs;
// live: fresh Google translations).
//
// FIRE-AND-FORGET (research: translate-and-store should not BLOCK the write — see
// archery-i18n-design). The admin route awaits its DB write + responds, THEN calls
// this WITHOUT awaiting. Failures are logged, never bubbled to the request (a
// translate hiccup must not fail a content save; reads fall back to hr meanwhile).
//
// Scoped per entity-type (not per-id) for simplicity — the filler skips rows whose
// targets already exist unless force=true, so a force re-fill re-translates every
// row of that type. At club scale + given edits are infrequent that's acceptable;
// a per-id refinement can come later if Google call volume matters.

export type TranslatableEntity =
	| "sponsor" | "archer" | "achievement" | "eventLevel"
	| "clubEvent" | "article" | "clubHistoryPeriod" | "clubInfo";

const FILLERS: Record<TranslatableEntity, (o: FillOpts) => Promise<unknown>> = {
	sponsor: fillSponsors,
	archer: fillArchers,
	achievement: fillAchievements,
	eventLevel: fillEventLevels,
	clubEvent: fillClubEvents,
	article: fillArticles,
	clubHistoryPeriod: fillClubHistory,
	clubInfo: fillClubInfo,
};

// Re-translate one entity type in the background. Call AFTER responding to the
// admin request; do NOT await.
export function retranslateInBackground(entity: TranslatableEntity): void {
	const filler = FILLERS[entity];
	void filler({ force: true })
		.then(() => console.log(`[retranslate] ${entity} re-translated`))
		.catch((err) =>
			console.error(`[retranslate] ${entity} failed (content save was NOT affected): ${err instanceof Error ? err.message : String(err)}`),
		);
}
