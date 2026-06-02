# TODO — Archery club backend

Pre-launch / known-issues to address before this becomes an official client product.

## Harden the Google Translate API key at deploy

The `GOOGLE_TRANSLATE_KEY` is created with Application restriction = **None** for
dev (API restriction = Cloud Translation API only, which is the real guardrail).
A backend key can't use a "Websites" restriction (no browser Origin on
server-side calls). AT DEPLOY: switch the key's Application restriction to **IP
addresses** = the Pi's public IP, so a leaked key can't be used from elsewhere.
(Do NOT add archeryclub.axlothecook.com as a website restriction — the front-end
never calls Google directly; the backend does.)

## Set up system for event generation

Build the input/generation path for the `/schedule` page's events. Today only
`import-wa-events.ts` exists (pulls GLOBAL World Archery events from the WA API);
there is NO path for the DOMESTIC events the schedule page actually needs (local
tournaments, club-hosted events, national-calendar entries). Decide the source
(manual seed `seed-data/events.json` + importer, an admin-create flow, a domestic
calendar feed, or a mix) and how WA-global vs domestic events coexist on the page.
Also decide whether to wire `import-wa-events.ts` into `import-seed`. See the
Dev-DB cleanup note below for the current event rows + the WA-global-vs-domestic
gap. (EventLevel — the calendar legend — has `event-levels.example.json` but no
real seed/importer yet either; fold its input into this work.)

## Translate pipeline — go-live + optional refinement

The Google-translate pipeline (src/translate/) is built + the fire-and-forget
`retranslateInBackground(entity)` write-hook is WIRED into every admin route that
edits translatable text: sponsors, achievements, archers, events, event-levels,
and articles (create + edit + publish-draft). NOT wired (intentionally): club-info
(admin PUT edits only contact/socials = non-translatable; identity is seed-owned),
hero (image-only), club-history (no admin route — seed-only for now).

GO-LIVE: add a real `GOOGLE_TRANSLATE_KEY` to `.env`, then run
`npx tsx scripts/translate-backfill.ts --force` ONCE to replace the "[locale] …"
mock stubs with real translations. New content thereafter auto-translates via the
write-hook (and `import-seed`/backfill cover bulk).

Optional refinement: make the write-hook per-ROW (not per entity-type) to cut
Google calls on a single edit (the per-entity fillers in fill.ts already exist;
a per-id variant would target just the edited row).

## Dev-DB cleanup — defer to the events/sponsors backend work

The DEV database (`archery_club`) holds leftover manual-test rows that are NOT
load-bearing (tests use the separate `archery_club_test` DB; deployment ships a
fresh seeded DB — the dev DB never travels). Verified 2026-06-01:

- **72 `clubEvents`** — real global World Archery events from an earlier
  `import-wa-events.ts` run; stale (2021–2024). NOT wired into `import-seed`, so
  they don't regenerate on a seed; re-importable anytime from the WA API.
- **2 `sponsors`** — `GoodCo` / `BrokenCo` placeholder test rows (real sponsor
  list still pending from the user).
- plus a test hero image + 1 test membership submission + a few test admins.
Decision (user, 2026-06-01): **leave as-is for now; clear + reconcile when we build
the events + sponsors backend.** At that point also decide whether to wire
`import-wa-events.ts` into `import-seed`, and build the DOMESTIC-events input path
(the real `/schedule` blocker — global WA events ≠ the domestic events the page needs).

## Image storage on Cloudflare R2: handle the 4-hour edge cache on UPDATES

**Context:** Images will be served via a Cloudflare R2 bucket behind a custom
domain (planned: `images.axlothecook.com`, shared `axlothecook-images` bucket
with an `archery/` path prefix — see the sibling game-shop project, which
already migrated to this setup). Objects served through an R2 custom domain are
**edge-cached by Cloudflare for ~4 hours** (`cache-control: max-age=14400`,
`cf-cache-status: HIT`). Verified on the game-shop project 2026-05-27.

**The problem (matters for an official/client site):**
- **Update flow:** if an admin edits an entity's image and the new file is
  uploaded under the **same object key** (same filename), the CDN keeps serving
  the **old image for up to 4 hours**. On a real client site this looks like a
  bug ("I changed the photo and it didn't update").
- **Delete flow:** a deleted image's URL may still serve a cached copy for ~4h.
  Mostly harmless (nothing links to it once the DB row is gone), but worth knowing.

**✅ DECISION LOCKED (2026-05-27): VERSION THE OBJECT KEY PER UPLOAD (option 1).**
This is now a BINDING convention for the future image-upload/R2 module — build it
this way from the start so the 4h stale-update bug can never occur (correct by
construction), rather than retrofitting later. The chosen rule:
- Every uploaded image gets a key that **changes whenever its content changes**:
  `archery/<entity-type>/<id>-<contentHash>.<ext>` (e.g.
  `archery/archer/clx123-9f8a2c.jpg`). Use a content hash (preferred — same bytes
  re-uploaded ⇒ same key ⇒ no needless churn) or, if hashing is awkward in the
  upload path, a per-upload timestamp/uuid (`-<ts>`).
- **Editing an image = upload under a NEW key + write the new URL to the DB.** Never
  overwrite an existing key. So a new image = a new URL ⇒ the CDN never serves a
  stale copy. No cache-purge call, no short Cache-Control needed.
- **On replace/delete, also delete the OLD R2 object** (the old key is now orphaned
  once the DB no longer references it) so the bucket doesn't accumulate dead files.
  The old URL may still serve a cached copy ~4h — harmless, nothing links to it.
- Store the FULL key/URL in the DB (already the pattern — images are `url` strings).
- ⚠️ Do NOT copy game-shop's `storage.js` wrapper verbatim — it uploads under a
  STABLE key and is therefore subject to this exact quirk. Reuse its S3/R2 client
  setup (endpoint, `WHEN_REQUIRED` checksum flags, region:auto) but make the KEY
  versioned here.

(Considered + rejected for the runtime path: option 2 "purge the cache on update"
— extra API token + wiring, more failure modes; option 3 "short Cache-Control" —
trades the bug for lost CDN benefit / more origin hits. Versioned keys sidestep the
problem entirely with no extra moving parts.)

NOTE: the one-time Supabase→R2 migration (done 2026-05-27, 173 post images under
`archery/img1/<filename>`) used STABLE keys — that's fine and NOT affected by this
bug, because migration writes each key exactly once and never overwrites. The
versioned-key rule applies only to the RUNTIME upload/edit path built later.

**Status:** archery has NOT built its image-upload/R2 module yet (images are
stored as `url` strings in the DB; no S3/R2 client present as of 2026-05-27).
So address this when implementing that module — don't blindly copy game-shop's
wrapper, which uploads under a stable key and is therefore subject to this quirk.

## "IF ADOPTED" features (build only if the club adopts the website)

These are deferred per the user's "expand if adopted" scope decision — NOT for the
pre-launch/demo build. Implement only after the club commits to the site.

- **Roster photos for the remaining members.** As of 2026-05-28 the 21 active
  published archers have card + profile photos; the other 9 archers do NOT
  (Kiara Pavličević — set `status:draft`, inactive since 06/2025 — plus the 8
  vsk.hr-only draft stubs: Nikola Kokotec, Ana Štimac, Ivan Novak, Sara Kelemenić,
  Ana Žuti, Karla Sklepić, Ksenija Mikulčić, Robert Pavličević). Whether to take
  and add their photos is **the admin's call once adopted** — surface it in the
  admin UI (e.g. "archers missing a photo") rather than chasing the photos now.
  Their `cardPhotoUrl` stays `"TODO-PHOTO"` and `profilePhoto*` stays null
  (front-end shows a placeholder) until then.

- **Admin CRUD for achievement-category + homepage stat images (deferred 2026-05-29).**
  Two seed-only image tables should become admin-editable if adopted:

  - `AchievementCategory` (one row per category: `type` = hr title join key,
    `imageUrl`, `imageAlt`; seed `seed-data/achievement-categories.json` →
    `import-achievement-categories.ts`, upsert by `type`). Admin should **add/edit/remove
    a category row** — pick/upload the card photo (R2 upload flow), set title + alt —
    so a brand-new achievement category (a new event the club starts medalling at)
    gets its card image without a code change. The `type` must equal the achievement
    group's hr title or the image won't attach (importer warns on orphan types; the
    admin UI should validate — e.g. pick from existing achievement groups, not free-type).
  - `HomeStatImage` (one row per homepage stat slot: `slot` PK ∈ {worldTitles,
    europeanTitles, nationalTitles, worldRecords, europeanRecords, nationalRecords},
    `imageUrl`, `imageAlt`; seed `seed-data/home-stat-images.json` →
    `import-home-stat-images.ts`, upsert by `slot`; surfaced as `statImages` in
    `GET /achievements/summary`). Admin should **edit the 6 slot photos** (the slot
    set is fixed — edit-only, not add/remove). The photo is a free choice and need
    not depict that exact level/type.

  Both use the existing versioned-key R2 upload rule above.

- **Add Berlin Open to achievements (deferred 2026-05-29).** Amanda Mlinarić won
  SILVER at the Berlin Open (international indoor tournament, Dec 2025; posts
  29/30/31/34). It is NOT a World Cup Stage (separate event) and is NOT currently
  in `seed-data/achievements.json`. If the club adopts the site, add it as its own
  group — `title: "Berlin Open"`, Amanda individual silver 2025, `level: "other"`,
  `type: "other"`, `medal: "silver"` (won't affect the world/EU headline counts).
  Same treatment as the other non-championship opens (Vegas, Conquest Cup).
