# Seed data — how to fill it

This folder holds the real club data you provide. The backend's seed importer
reads these JSON files and creates the database rows. Fill them in your own time;
hand them back whenever ready and the importer turns them into a live site.

Everything here is the **Croatian (`hr`) source**. Other languages are filled
later by the translate pipeline — you only ever write Croatian.

Files (copy each `*.example.json` → the same name without `.example`, then fill):

- `roster.json` — the club's archers (team page). See `roster.example.json`.
- `posts.json` — the ~50 Facebook posts → news articles. See `posts.example.json`.
- `achievements.json` — club medals/titles/records. See `achievements.example.json`.
- `event-levels.json` — calendar-legend categories (name + color). See `event-levels.example.json`.
- `club-info.json` — the single about/history/contact/socials record. See `club-info.example.json`.
- Events themselves come from two places (you don't hand-write a full events file):
  - **Global** events: pulled automatically from World Archery (the 3 WA archers).
  - **Domestic** events: cross-referenced from your posts (the ones that mention
    a domestic event) against the Croatian Archery Association calendar. Anything
    missing, you add later in the dashboard.

## Images

Every image is a **public HTTPS URL** (no uploads here). Upload images to
Supabase Storage (public bucket) and paste the resulting URL. Never a temporary
/ signed URL — it must be permanent.

## Posts: the type + mentions annotation

For each post give its **type** and the **archers mentioned** (your
`number / type / mentions` scheme). The 4 types:

- **`event`** — full FB text kept; up to 10 photos.
- **`gallery`** — few words → template text added if ≤600 chars; any video discarded.
- **`external-link`** — an ARTICLE you link out to (newspaper etc.); cover image or fallback. **Articles only** — reposted videos go under `video-only`.
- **`video-only`** — a video post, TWO ways:
  - **(a) club's own video** you host — supply `videoUrl` (<5 MB, or the post is skipped).
  - **(b) reposted 3rd-party video** (news outlet / HSS / a member's FB) — DON'T host it: leave `videoUrl` out and instead give `externalUrl` + `externalSourceName` (link to the original).
  - Either way supply the thumbnail as `posterImageUrl`.

`mentions` = the roster archers named/shown in that post (used to link the
article to their profiles, and to help confirm the roster). **`mentions` is
optional** — if a post names no one specific (e.g. a "happy holidays" / team
photo with no individual tagged), use `"mentions": []` (or omit it). The post
still appears in the feed with its photo + text; it just links to no profiles.
