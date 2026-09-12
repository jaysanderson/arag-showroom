# Deploy (Fly.io)

A runbook for a first deploy and for every deploy after it. Commands match `fly.toml` and
`Dockerfile` as they stand in this repo — read the note below before your first deploy.

> **Known issue — fix before first deploy.** `Dockerfile` currently does not `COPY` `config/` or
> `content/` into the image, and it `COPY`s a directory named `admin/` that does not exist in this
> repo (the showroom has no separate admin app — administration is server-rendered pages under
> `src/routes/pages.ts`). As written, `docker build` fails outright on the missing `admin/`
> source, and even with that line removed the running container would boot with an empty product
> catalogue because `config/products.json` and `content/<slug>/` would not be present at
> `/app/config` and `/app/content`. The lead needs to add `COPY config ./config` and
> `COPY content ./content` and remove the `COPY admin ./admin` line (and the stale
> `__PRODUCT_TITLE__` placeholder in the Dockerfile's first comment) before this runbook's
> `fly deploy` step will produce a working deployment.

## First-time setup

```bash
fly launch --no-deploy --copy-config --name arag-showroom
fly volumes create data --size 1 --region iad
```

`fly.toml` already names the app `arag-showroom`, targets `iad`, and mounts the volume at
`/data` (matching `DATA_DIR=/data` in `[env]`), so `--copy-config` picks that up rather than
generating a new one.

## Secrets

```bash
fly secrets set \
  SHOWROOM_SESSION_SECRET=$(openssl rand -hex 32) \
  SHOWROOM_ADMIN_EMAIL=admin@example.com \
  SHOWROOM_ADMIN_PASSWORD="$(openssl rand -base64 24)"

fly secrets set \
  SHOWROOM_ADMIN_TOKEN_DOC_PROCESSING=… \
  SHOWROOM_ADMIN_TOKEN_CALL_ANALYSIS=… \
  SHOWROOM_ADMIN_TOKEN_VOICEBRIDGE=…
```

- `SHOWROOM_SESSION_SECRET` signs every session cookie. It must be stable across restarts and
  deploys — a value that changes signs everyone out. In production the process refuses to start
  without one at least 16 characters long (`src/server.ts`); there is no fallback to a random
  per-boot secret outside development.
- `SHOWROOM_ADMIN_EMAIL` / `SHOWROOM_ADMIN_PASSWORD` create the **one** bootstrap administrator,
  and only when the user store is completely empty — set both before the very first boot of a
  fresh volume, or there will be no way to sign in.
- The three `SHOWROOM_ADMIN_TOKEN_*` secrets are each **product's own** `ADMIN_TOKEN` for its own
  deployment (Document Processing, Call Analysis, VoiceBridge) — copy them from each product's own
  Fly secrets, not from the showroom's. They are shown, per product, only to a user whose role
  includes that product's `admin` surface, and only when the value is actually set.
- Optionally also set the platform's own `ADMIN_TOKEN` on the showroom itself (a **different**
  secret from the three above) if you want the break-glass operator token described in
  [docs/admin-guide.md](admin-guide.md#the-break-glass-operator-token) available on this
  deployment, and `SHOWROOM_PUBLIC_DEMO_LINKS=1` if the public pages should link straight to each
  product's live demo.

## Deploy

```bash
fly deploy
```

## First login

1. Open `https://arag-showroom.fly.dev/login` and sign in with `SHOWROOM_ADMIN_EMAIL` /
   `SHOWROOM_ADMIN_PASSWORD`.
2. You are redirected to `/account?forced=1` — **change the password immediately**. The bootstrap
   account is created with `mustChangePassword: true` and every other gated page redirects here
   until you do.
3. From `/admin/invites`, invite the people who need real accounts, then consider whether the
   bootstrap admin's email/password should be rotated again or the account otherwise treated as a
   break-glass account rather than a daily-use one.

## Re-syncing content and redeploying

Content is baked into the image at build time (see the known issue above and
[content-sync.md](content-sync.md)) — there is no way to update the portal's documentation without
a new image:

```bash
make sync-content
git add content/ && git commit -m "chore: sync content from product repos"
fly deploy
```

### Content lives in the image, not the volume

The `data` volume mounted at `/data` (`DATA_DIR`) holds only what changes at runtime: users,
invites, the audit log and access requests, in the platform's JSON `Store`. It holds **no**
documentation, screenshots or recordings — those come from `content/` and `config/` in the image
itself. This is why a content sync requires a redeploy rather than a volume write, and why
redeploying never touches user accounts or the audit log.

## Rollback

```bash
fly releases                        # list past releases and their images
fly deploy --image <image-ref>      # redeploy a specific previous image
```

## Logs

```bash
fly logs
```

Logs are structured JSON lines (`{ts, level, msg, requestId, ...}`); the last ~500 are also kept
in memory and visible at `/admin/system` without shelling out.

## Scaling

`fly.toml` runs a single `shared-cpu-1x` / 512 MB machine with `min_machines_running = 1` and
`auto_stop_machines = "suspend"` — fine for a partner-facing showroom with light, bursty traffic.
Because sessions are stateless HMAC-signed cookies (no server-side session table) and the only
server-side state is the small JSON store on the volume, scaling to more than one machine is safe
for reads; be aware that the JSON `Store` is a **single-writer** file store, so running more than
one machine concurrently risks two processes writing `DATA_DIR` at once. Raise
`min_machines_running` before scaling the volume-backed store across machines, or move the store
to something that tolerates concurrent writers first.

## What to check after deploy

- `curl https://arag-showroom.fly.dev/healthz` → `{"ok":true}`.
- `/admin/system` shows all three products with a recent `syncedAt` and a `commit` matching what
  you expect.
- Sign in as the bootstrap admin, confirm the forced password-change flow works, then create a
  real invitation from `/admin/invites` and confirm the one-time link works end to end.
- `GET /api/v1/admin/health` with the showroom's own `ADMIN_TOKEN` (if set) as
  `Authorization: Bearer …` returns 200, and the action shows up in `/admin/audit` as
  `admin.token.used`.
- Each product's admin URL/token shown on `/p/:slug` (to a user with that product's `admin`
  surface) actually opens that product's live admin panel.
