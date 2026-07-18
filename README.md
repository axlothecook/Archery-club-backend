# Archery club backend
The API server for the archery club website. Both the public site and the admin dashboard get their data from it. It's written in TypeScript with Express, it stores everything in PostgreSQL through Prisma and runs on my Raspberry Pi as a Docker container.
<br />

## What it does
The API has two halves:

### Public site
<ul>
  <li>available to every visitor: articles, events, team roster, achievements, sponsors, club history and club info</li>
  <li>every route returns the requested language and falls back to Croatian when a translation is missing</li>
</ul>

### Admin dashboard
<ul>
  <li>requires the visitor to be logged in </li>
  <li>enables creating and editing content, uploading files, reading and replying to inquiries</li>
</ul>

There is also a public inquiries endpoint for the contact forms. It's rate-limited and spam-guarded. Additionally, there is a `/health` endpoint that confirms the server can reach the database.
<br />

## How a request travels
Diagram below shows how the backend handles a request. It goes through shared middleware first, then the route decides which path it takes: either to the public half or the session-checked admin half, and from there to Postgres, R2 or Google Translate.

// graph goes here
<br />

## Auth
Admins log in with a password and get a session cookie: `__Host-session`: HttpOnly, Secure, SameSite=Lax. Sessions live server-side in the database, with an 8 hour absolute limit (logged out after 8 hours no matter what) and a 30 minute idle limit (logged out after 30 minutes of inactivity; activity extends it). New admins are invited by email with a 72 hour link, and forgotten passwords get a 30 minute reset link. There are two roles, admin and developer. Any admin can invite new admins or developers and creating or deleting any admin or developer are planned features.
<br />

## Background work
When an admin saves Croatian content, the backend translates it to English in the background with Google Cloud Translation, so a failed translation can never break the save. Emails such as inquiry notifications, replies to submitters, admin invites and password resets go through Brevo email service. Both services run in a mock mode when no API key is set, so the whole flow is testable in development without live keys.
<br />

## Uploads
Files are uploaded through the dashboard, validated by their actual file bytes instead of the client-claimed type, and stored in Cloudflare R2. The database stores only the final URL. This keeps large files off the Pi's small storage.
<br />

##Testing
141 tests run before every deploy so a broken data read or a failed CRUD action never reaches production. If any test fails, nothing gets deployed. The pipeline itself is explained in [homelab-ci-cd](https://github.com/axlothecook/homelab-ci-cd).
<ul>
  <li>65 unit tests for the mappers and helpers</li>
  <li>76 integration tests that run against a real throwaway Postgres database in CI, covering login and sessions, loading the public site's data, dashboard editing, uploads and security headers</li>
</ul>
<br />

## Tech stack
[Node.js](https://nodejs.org) / [Express](https://expressjs.com): runtime and web framework like routing and router middleware <br />
[Prisma 7](https://www.prisma.io): ORM used to communicate with Postgres db <br />
[PostgreSQL](https://www.postgresql.org): used as the db that stores text data and links to R2 stored images and videos <br />
[Zod](https://zod.dev): request validation in body, params and query <br />
[session-cookie auth](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies): `__Host-session` cookie, server-side sessions, requireAuth <br />
[Google Cloud Translation](https://cloud.google.com/translate): used to translate club history and info, plus everything admins create or edit <br />
[Brevo](https://www.brevo.com): used as a transactional email service: inquiry notifications (to club), inquiry replies (to submitter), admin invite links and password reset links <br />
[Cloudflare R2](https://developers.cloudflare.com/r2/): used for storing images and videos
<br />

## Shared types
The TypeScript data shapes shared with the frontend come from [archery-contracts](https://github.com/axlothecook/Archery-contracts), imported as a local file dependency.
