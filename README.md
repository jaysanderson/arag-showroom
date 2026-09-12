# ARAG Showroom

The ARAG Showroom is a partner-accelerator site and invite-only portal for three open-source
products built on Progress Agentic RAG (ARAG): **Document Processing**, **Call Analysis** and
**VoiceBridge**. It has two front doors:

- A **public marketing site** (`/`, `/products/:slug`, `/partners`) — positioning, capabilities, screenshots and a request-access
  form for each product. No sign-in required.
- An **invite-only portal** (`/portal`) — documentation, enablement material, the showcase
  recording and, for the right role, each product's live demo and admin panel.

The showroom holds no Knowledge Box of its own and talks to no ARAG service. Its content is a
**committed snapshot**: `scripts/sync-content.ts` copies documentation and enablement material out
of the three product repositories into `content/<slug>/` ahead of time, so what ships in a deploy
is exactly what was reviewed, and the portal keeps working even when a sibling repo is mid-rebase.

## What you see

Public routes (no account needed):

| Route | What it is |
|---|---|
| `/` | The programme: hero, platform, the three products, traction, market, roadmap |
| `/products/:slug` | Customer-facing product page — outcomes, capabilities, how it works, proof, FAQ. A white-label asset: see [docs/white-label-pages.md](docs/white-label-pages.md) |
| `/partners` | For ISV partners: engagement models, white-label surface, extension points, enablement |
| `/request-access` | Records a partner-access request for an administrator to act on |
| `/programme/:doc` | Partner-programme documents synced from `../marketing/` (the pilot playbook) |

Gated routes (sign in required; further gated by role, see below):

| Route | What it is |
|---|---|
| `/portal` | The product catalogue, filtered to what your role can see |
| `/account` | Your profile and password |
| `/p/:slug` | Product overview inside the portal |
| `/p/:slug/docs[/...]` | The product's synced documentation |
| `/p/:slug/enablement[/...]` | Developer and architect enablement tracks |
| `/p/:slug/showcase` | The recorded walkthrough, script and storyboard |
| `/admin`, `/admin/invites`, `/admin/audit`, `/admin/system` | Site administration (see below) |

## Quick start

```bash
make install                                       # bun install (dev tooling only; no npm)
cp .env.example .env
# set SHOWROOM_SESSION_SECRET, SHOWROOM_ADMIN_EMAIL, SHOWROOM_ADMIN_PASSWORD in .env
make dev                                           # http://localhost:8080
```

On first boot, if the user store is empty, the showroom creates one administrator from
`SHOWROOM_ADMIN_EMAIL` / `SHOWROOM_ADMIN_PASSWORD` and flags it `mustChangePassword`, so sign in
and set a real password straight away. There is no other way to get an administrator account —
if you forget these variables before the first boot, add a user directly to the store or restart
against an empty `DATA_DIR` with them set.

## How to invite people

Only a site administrator (global role `admin`) can create invitations.

1. Sign in and open **`/admin/invites`**.
2. Fill in the email, a global role, and optionally per-product role overrides, then submit.
3. The page shows the one-time invitation URL **once** — copy it and send it to the person
   yourself (the showroom does not send email).
4. They open the link, set a password, and are signed in as a new user with the role you chose.

The same flow exists on the API:

```bash
# Sign in and keep the session cookie
curl -c cookies.txt -X POST http://localhost:8080/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"correct-horse-battery-42"}'

# Create an invitation (role is one of viewer, evaluator, operator, partner, admin)
curl -b cookies.txt -X POST http://localhost:8080/api/v1/invites \
  -H 'content-type: application/json' \
  -d '{"email":"partner@example.org","role":"evaluator","expiresInDays":7}'
# → 201, body includes "inviteUrl" — shown only in this response, send it to them yourself

# They accept it themselves, no session needed:
curl -X POST http://localhost:8080/api/v1/invites/<token>/accept \
  -H 'content-type: application/json' \
  -d '{"password":"a-long-unique-passphrase"}'
```

Anyone can also ask for access without an account, from the public `/request-access` form (or
`POST /api/v1/access-requests`); it shows up on `/admin/invites` for an administrator to turn into
a real invitation with one click.

## Roles

A person has one **global** role, applied to every product, plus optional **per-product** role
overrides. The surfaces they get for a given product are the **union** of the two — roles are
additive and never take access away. This is defined in one place, `src/permissions.ts`, so a
route can never invent its own interpretation of a role.

| Role | What they see | Per-product? |
|---|---|---|
| `viewer` | Positioning, marketing assets, documentation and the showcase recording | Yes |
| `evaluator` | Everything a viewer sees, plus the live demo and the enablement labs | Yes |
| `operator` | Everything an evaluator sees, plus the product admin panel and its admin token | Yes |
| `partner` | Everything an evaluator sees, plus the partner pitch and the enablement solutions | Yes |
| `admin` | Every surface of every product, plus user, invite and audit administration | Global only |

**Site administration is global-role-only.** Managing users, invites and the audit log is gated
purely on the global role being `admin` — it is deliberately not a "surface" a per-product role
can grant, so a per-product `admin` role can never become a back door into the user table.

## Re-syncing content

```bash
make sync-content            # every product listed in config/products.json
node scripts/sync-content.ts call-analysis   # just one
```

This copies each product's `docs/` and `enablement/` trees (Markdown only), its `README.md` and
`CHANGELOG.md`, and its `showcase/out/` screenshots and recording, into `content/<slug>/`. It also
writes `manifest.json` (recommended name, one-liner, synced commit, file counts) and `facts.json`
(commits, endpoints, tests, coverage, runtime dependencies — all counted from the source repo,
never hand-typed) alongside the copied content.

**Content is committed**, not generated at deploy time — see [docs/content-sync.md](docs/content-sync.md)
for the full mechanism, why it's a snapshot rather than a live read, and how to keep it current.

The script also looks for an optional sibling `../marketing/` directory: `../marketing/site/*.json`
becomes `content/site/*.json` (authored copy that overrides parsed documentation) and
`../marketing/*.md` / `../marketing/programme/*.md` become the public `/programme/:doc` pages. Its
absence is not an error — the showroom falls back to what it parsed out of the synced docs.

## The API

Every capability that exists in the portal's HTML also exists on `/api/v1` — the page routes call
the same service objects the API does, never the API over HTTP, so the two front doors can never
disagree about what a role is allowed to do. Authentication is a signed, HttpOnly session cookie
issued by `POST /api/v1/auth/login`.

- Interactive reference (Redoc): **http://localhost:8080/api/v1/docs**
- Try-it-out (Swagger UI): **http://localhost:8080/api/v1/swagger**
- Raw spec: `http://localhost:8080/api/v1/openapi.json`

## Testing

```bash
make check     # Biome, tsc --noEmit, unit/integration/contract tests with an 80% line-coverage gate
make e2e       # Playwright against a mock-backed server
```

Tests run with `ARAG_MOCK` irrelevant — the showroom never talks to ARAG at all, so `make dev` and
the test suite need no ARAG credentials.

## Deploy

The showroom deploys to Fly.io as a single container: content and code live in the image, a small
persistent volume holds only `DATA_DIR` (users, invites, audit log, access requests). See
**[docs/deploy.md](docs/deploy.md)** for the exact runbook — `fly launch`, secrets, `fly deploy`,
first-login, re-sync-and-redeploy, and rollback.

## Licence

Apache-2.0 — see [LICENSE](LICENSE). See also [CONTRIBUTING.md](CONTRIBUTING.md),
[SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md) and [DECISIONS.md](DECISIONS.md).
