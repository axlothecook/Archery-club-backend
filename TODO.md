# TODO — Archery club backend

Pre-launch / known-issues to address before this becomes an official client product.

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
