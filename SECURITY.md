# Security policy

## Supported versions

The `main` branch and the latest tagged release receive security fixes.

## Reporting a vulnerability

Email the maintainers (see the repository owner's profile) with a description, reproduction steps
and impact. Please do not open public issues for security reports. We aim to acknowledge within 3
business days and to publish a fix or mitigation within 30 days for high/critical issues.

## Design notes

### Passwords

Hashed with **scrypt** from `node:crypto` (`N=16384, r=8, p=1`, ~64 MB / ~100 ms on a modern
core), keeping the showroom's zero-runtime-dependency posture. The stored format is
`scrypt$N$r$p$<salt-base64>$<hash-base64>`, so the cost parameters travel with each hash and can be
raised later without invalidating existing ones. Minimum length is 12 characters; the email local
part and the words "password"/"showroom" are rejected outright (`passwordProblem()` in
`src/services/users.ts`).

### Sessions

Stateless, signed **HMAC-SHA256** tokens carried in an HttpOnly cookie (`showroom_session`) —
there is no server-side session table. Each token embeds the user id, an expiry, and the user's
current `sessionEpoch`. Changing a user's role, product roles, or `disabled` flag — or the user
changing their own password — increments `sessionEpoch`, which invalidates every outstanding
session for that user instantly, without a revocation list, because `verify()` rejects any token
whose embedded epoch no longer matches the stored one.

Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` in production, `path=/`, 12-hour `maxAge`
(`SESSION_TTL_SEC`).

### CSRF

Every state-changing form POST carries a CSRF token derived as
`HMAC-SHA256(sessionSecret + ":csrf", sessionToken)` — bound to the session cookie itself, so it
cannot be replayed against a different session and needs no separate server-side store. Combined
with `SameSite=Lax`, this defends the HTML form-POST surface; the JSON `/api/v1` surface is
cookie-authenticated too but is not intended to be called cross-site from a browser session.

### Lockout and throttling

An account locks for **15 minutes** after **10** failed password attempts
(`MAX_FAILED_ATTEMPTS` / `LOCKOUT_MS`). Independently, a per-(IP, email) in-memory throttle allows
at most **10 attempts per 15-minute window** before answering `429` — this exists specifically to
blunt spraying before it reaches the deliberately slow scrypt call. Login answers identically
("Email or password is not correct") for an unknown email and a wrong password, and still performs
a full scrypt verification against a dummy hash for unknown emails, so response timing does not
reveal whether an account exists.

### Invitations

Invite tokens are **32 cryptographically random bytes**; only their **SHA-256** is stored
(`InviteDoc.tokenHash`). A leaked `DATA_DIR` therefore does not hand out usable invitation links —
the tokens themselves exist only in the one-time API/HTML response at creation time and in
whatever channel the administrator used to relay them. Invites expire (1–90 days, default 7),
can be revoked, and cannot be reused once accepted.

### Audit log

Every authentication event and administrative action is recorded to an append-only, capped
(5000-entry) collection: who (`actorId`/`actorEmail`, or `null` for an unauthenticated actor such
as a public access request), what (`action`), against whom (`target`), from where (`ip`), and a
free-form `detail` object — see the full action list in
[docs/admin-guide.md](docs/admin-guide.md#audit-log-adminaudit). This includes every use of the
break-glass `ADMIN_TOKEN` against `/api/v1/admin/*` (`admin.token.used`, with the path called).

### Markdown sanitisation

Synced documentation is rendered by a hand-rolled, zero-dependency Markdown renderer
(`src/markdown.ts`) rather than an external library, specifically because this product renders
repo-sourced Markdown directly into pages served to signed-in users, and the renderer's
sanitisation behaviour is therefore a security property of the product. **Guarantee:** the
renderer never copies source bytes into the output HTML without passing them through `escapeHtml`
first — there is no code path that trusts raw inline HTML in the source (a literal `<div>`, a
`<script>` tag, an `onerror` attribute is rendered as visible escaped text, never as markup). The
only attribute values built from source data are `href`/`src` on links and images, and both are
passed through `sanitizeUrl`, which rejects `javascript:`, `data:`, `vbscript:` and other
script-executing schemes (case-insensitively, tolerant of whitespace/control-character and
percent-encoding obfuscation of the scheme delimiter) before being escaped and emitted. The inline
scanner is a single linear left-to-right pass with no backtracking regex over source text, so a
pathological input (long runs of `*`, deeply nested emphasis) cannot cause catastrophic
backtracking.

### Content-Security-Policy

Built on the platform's default CSP (`securityHeaders()`), which already allows
`https://cdn.jsdelivr.net` in `script-src` and `https://fonts.googleapis.com` /
`https://fonts.gstatic.com` for fonts. The showroom's own addition is Mermaid, loaded from
`https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js` to render the ```mermaid blocks in
synced architecture documentation client-side (D-S9 in [DECISIONS.md](DECISIONS.md)) — the same
CDN host the default policy already trusts, so no new host is added to the policy, only the
capability is used. `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'self'`.

### Asset exposure

Everything under `content/<slug>/` is classified into a surface
(`surfaceForContentPath()`) and gated accordingly, with one deliberate exception: files under
`showcase/out/` (screenshots and the recorded walkthrough) are served to anyone, without a session,
at `GET /api/v1/products/:slug/assets/:path` (D-S6). This is intentional — the public product
pages (`/products/:slug`) embed these images and video for visitors who have no account — and it
is the *only* unauthenticated content route. Every other path under a product's content directory
requires a session and the surface that governs it. All content paths are resolved through
`normaliseRelative()` and confined with a `resolve()` + prefix check in `Catalogue.resolveFile()`
before any filesystem read, rejecting `..`, NUL bytes, backslashes and absolute paths.

### The break-glass `ADMIN_TOKEN`

The showroom's own notion of "administrator" is a role on a user record, authenticated by the
session cookie above — **not** the platform's shared `ADMIN_TOKEN`. That platform token is
retained, deliberately narrowed, as a break-glass operator credential accepted only on
`/api/v1/admin/*` (health, config, usage, logs) — never on the HTML `/admin` pages, and never able
to create or modify a user or invitation. Every request authenticated this way is audited
(`admin.token.used`). See D-S1 in [DECISIONS.md](DECISIONS.md).

## Deliberately out of scope for this MVP

- **No email delivery.** Invitation links and temporary passwords are shown once in the response
  and must be relayed by the administrator through whatever channel they trust; the showroom
  never sends anything itself, so there is no email-spoofing or delivery-security surface to
  reason about here.
- **No per-request authorisation on the products' own live demos/admin panels.** The showroom
  decides who may *see* a demo URL or admin token; once someone has it, whatever authorisation
  that product's own deployment implements is the boundary, not this repo.
- **No server-side session revocation list beyond `sessionEpoch`.** Bumping the epoch invalidates
  *every* session for a user at once — there is no way to invalidate a single device's session
  without also signing the user out everywhere else.
- **No rate limiting keyed on anything other than IP + email for login**, and the in-memory login
  throttle does not survive a restart or scale across multiple machines (see
  [docs/deploy.md](docs/deploy.md#scaling)).
- **No CAPTCHA or bot defence** on `/request-access` beyond the standard per-IP rate limiter and a
  per-email dedupe.
