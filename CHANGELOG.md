# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic
Versioning](https://semver.org/).

## [0.1.0] - 2026-09-12

### Added
- Public marketing site: home page with a traction strip, per-product pages
  (`/products/:slug`) built from synced positioning, capabilities, screenshots and FAQ, and a
  `/request-access` form.
- Invite-only portal (`/portal`): role-gated product overview, documentation and enablement
  readers, and the showcase recording/script/storyboard, for the three ARAG products (Document
  Processing, Call Analysis, VoiceBridge).
- Role and surface model (`src/permissions.ts`): five roles (`viewer`, `evaluator`, `operator`,
  `partner`, `admin`), additive per-product overrides, and site administration gated on the
  global role alone.
- Site administration: user management, one-time invitation links, access-request triage, and an
  audit log (`/admin`, `/admin/invites`, `/admin/audit`, `/admin/system`).
- Authentication: scrypt password hashing, stateless HMAC-signed session cookies with
  `sessionEpoch` invalidation, lockout after repeated failures, and a login throttle.
- `/api/v1`: every portal capability mirrored as a versioned, OpenAPI 3.1-documented REST API
  (Redoc at `/api/v1/docs`, Swagger UI at `/api/v1/swagger`), authenticated by the same session
  cookie as the HTML pages.
- Content sync (`scripts/sync-content.ts`): copies documentation, enablement material and
  showcase output from the three product repositories into a committed `content/<slug>/`
  snapshot, with a generated `manifest.json` and `facts.json` per product, plus optional
  marketing-copy and programme-document overrides from a sibling `../marketing/` directory.
- Zero-dependency Markdown renderer (`src/markdown.ts`) with a documented sanitisation
  guarantee, used to render all synced documentation.
- Fly.io deployment configuration (`fly.toml`, `Dockerfile`).
