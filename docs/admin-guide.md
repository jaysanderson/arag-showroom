# Admin guide

This is for whoever holds the global `admin` role — the only role that can reach these pages
(`isSiteAdmin()` checks the global role alone, never a per-product one; see
[architecture.md](architecture.md#the-permission-model)).

## Signing in as the first administrator

On first boot, if the user store (`DATA_DIR`) is empty, the showroom creates one administrator
from `SHOWROOM_ADMIN_EMAIL` / `SHOWROOM_ADMIN_PASSWORD` and marks it `mustChangePassword: true`.
Sign in at `/login` and you will be sent straight to `/account?forced=1` to set a real password —
every other gated page redirects there too until you do. If both variables are unset, the store
stays empty and the log prints `showroom.no-users`; there is no other bootstrap path — you would
need to add a user directly to the store, or restart with the variables set against an empty
`DATA_DIR`.

## Users — `/admin`

- **Create a user directly** (bypassing the invitation flow): email, name, a global role, and
  optional per-product role overrides. A temporary password is generated and shown once — the
  admin must relay it out of band.
- **Change a user's role** or their per-product roles. Any change to role, product roles, or
  `disabled` bumps that user's `sessionEpoch`, which invalidates every session they currently hold
  (they are signed out everywhere).
- **Disable / enable** a user. You cannot disable your own account, and you cannot disable or
  demote the last remaining `admin` — the service refuses with a 409 rather than lock everyone out.
- **Reset a password** to a new generated temporary one (shown once, `mustChangePassword` set).
- **Delete** a user. Same last-administrator and self-protection rules apply.

## Invitations and access requests — `/admin/invites`

- **Create an invitation**: email, role, per-product roles, and an expiry (1–90 days, default 7).
  The one-time invitation URL is shown **once**, in the response to that submission — copy it
  immediately and send it to the person yourself. The showroom sends no email.
- **Revoke** a pending invitation. An already-accepted invitation cannot be revoked (it is now a
  user; disable or delete the user instead).
- **Access requests**: anyone can ask for access from the public `/request-access` form without an
  account. Requests appear here as `new`; resolving one to `invited` or `dismissed` is a manual
  administrator action — creating an invitation for the same email automatically marks any open
  request for that address as `invited`.

Invitation tokens are 32 random bytes; only their SHA-256 is stored, so the data directory alone
never yields a usable invitation link. See [SECURITY.md](../SECURITY.md).

## Audit log — `/admin/audit`

Every authentication event, administrative action and access-request resolution is recorded:
`auth.login`, `auth.login.failed`, `auth.login.locked`, `auth.logout`, `auth.password.changed`,
`user.created`, `user.updated`, `user.disabled`, `user.enabled`, `user.deleted`,
`user.password.reset`, `invite.created`, `invite.accepted`, `invite.revoked`, `access.requested`,
`access.resolved`, `user.bootstrapped`, and `admin.token.used` (see below). Filter by action from
the query string (`?action=`); the log is capped at 5000 entries (oldest dropped first) and this
page shows the most recent 200.

## System — `/admin/system`

Service health (uptime, user/invite counts, per-product sync freshness — `syncedAt`, `commit`),
usage counters since boot (`requests`, `pageViews`, `logins`, `failedLogins`, `deniedRequests`),
effective configuration (redacted), and the last ~80 structured log lines. Use this page first when
something looks wrong before reaching for `fly logs`.

## The break-glass operator token

`/api/v1/admin/*` (health, config, usage, logs — not the HTML pages above) accepts either an
administrator session **or** the deployment's platform `ADMIN_TOKEN` as a bearer token or
`arag_admin` cookie. This is intentionally the only place `ADMIN_TOKEN` has any power in this
repo (D-S1 in [DECISIONS.md](../DECISIONS.md)): it exists so an operator can pull health and logs
without a personal account, and every use is written to the audit log as `admin.token.used` with
the path that was called. It cannot sign in to the HTML `/admin` pages, create users, or create
invitations — those require a real administrator session.

## Per-product admin panels

A user with the `admin` (operator) surface for a product (`operator` role, globally or per-product)
sees that product's own live admin URL and its own `ADMIN_TOKEN` value (from
`SHOWROOM_ADMIN_TOKEN_<SLUG>`) on its portal page — that is a **separate** deployment's admin
panel and a **separate** secret from the showroom's own `ADMIN_TOKEN` described above. Rotating one
does not affect the other.

## Refreshing the catalogue without a restart

`Catalogue.reload()` re-reads `config/products.json` and rescans `content/`. There is currently no
HTML/API route wired to call it at runtime beyond process boot — a content update takes effect on
the next deploy (see [content-sync.md](content-sync.md) and [deploy.md](deploy.md)) or process
restart.
