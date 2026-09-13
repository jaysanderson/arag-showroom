/**
 * Page templates. Each export is a pure function from a view-model to a complete HTML document;
 * the routes do the permission work and pass in only what the viewer is allowed to see, so a
 * template can never leak a surface by forgetting a check.
 */

import { ROLE_DESCRIPTIONS, ROLES, type Role, type Surface } from "../permissions.ts";
import type { AccessRequestDoc } from "../services/access-requests.ts";
import type { ContentSection } from "../services/catalogue.ts";
import type { AuditDoc, PublicInvite, PublicUser } from "../services/users.ts";
import {
  alert,
  alertHtml,
  type BrandChrome,
  card,
  chip,
  csrfInput,
  empty,
  esc,
  field,
  layout,
  type NavLink,
  pageHeader,
  select,
  table,
  type ViewerChrome,
} from "./layout.ts";

export interface ProductView {
  slug: string;
  title: string;
  workingTitle: string;
  recommendedName: string;
  oneLiner: string;
  summary: string;
  accent: string;
  surfaces: Surface[];
  accessLabel: string;
  hasContent: boolean;
  thumbnail: string | null;
  video: string | null;
  screenshots: string[];
  demoUrl: string | null;
  adminUrl: string | null;
  adminToken: string | null;
  adminTokenEnv: string;
  docsUrl: string | null;
  syncedAt: string | null;
  commit: string | null;
  repo: string;
}

export interface Chrome {
  viewer: ViewerChrome | null;
  nav: NavLink[];
  /** The deployment's white-label identity; applied to the document shell. */
  brand?: BrandChrome;
}

const has = (p: ProductView, s: Surface) => p.surfaces.includes(s);

function productNav(product: ProductView, current: string): string {
  const items: Array<[string, string, boolean]> = [
    [`/p/${product.slug}`, "Overview", true],
    [`/p/${product.slug}/docs`, "Docs", has(product, "docs")],
    [`/p/${product.slug}/enablement`, "Enablement", has(product, "enablement")],
    [`/p/${product.slug}/showcase`, "Showcase", has(product, "showcase")],
  ];
  return `<nav class="sr-subnav" aria-label="${esc(product.title)} sections">${items
    .filter(([, , allowed]) => allowed)
    .map(
      ([href, label]) =>
        `<a href="${esc(href)}"${href === current ? ' aria-current="page"' : ""}>${esc(label)}</a>`,
    )
    .join("")}</nav>`;
}

function externalButtons(product: ProductView): string {
  const out: string[] = [];
  if (has(product, "demo") && product.demoUrl)
    out.push(
      `<a class="arag-btn" href="${esc(product.demoUrl)}" target="_blank" rel="noopener noreferrer">Open demo ↗</a>`,
    );
  if (has(product, "admin") && product.adminUrl)
    out.push(
      `<a class="arag-btn secondary" href="${esc(product.adminUrl)}" target="_blank" rel="noopener noreferrer">Open admin ↗</a>`,
    );
  if (product.docsUrl && has(product, "docs"))
    out.push(
      `<a class="arag-btn ghost" href="${esc(product.docsUrl)}" target="_blank" rel="noopener noreferrer">Live API docs ↗</a>`,
    );
  return out.join(" ");
}

// ───────────────────────────── auth pages ─────────────────────────────

export function loginPage(opts: {
  brand?: BrandChrome;
  email?: string;
  error?: string;
  notice?: string;
  next?: string;
  csrf: string;
}): string {
  return layout({
    title: "Sign in",
    brand: opts.brand,
    body: `<div class="sr-container sr-narrow">
${card(`
  <h1>Sign in</h1>
  <p class="sr-sub">The showroom is invite only. If you were sent an invitation link, open that link instead.</p>
  ${opts.error ? alert("danger", opts.error, "Cannot sign in.") : ""}
  ${opts.notice ? alert("info", opts.notice) : ""}
  <form method="post" action="/login" class="arag-stack">
    ${csrfInput(opts.csrf)}
    <input type="hidden" name="next" value="${esc(opts.next ?? "")}">
    ${field({ name: "email", label: "Email", type: "email", value: opts.email, required: true, autocomplete: "username", autofocus: true })}
    ${field({ name: "password", label: "Password", type: "password", required: true, autocomplete: "current-password" })}
    <button class="arag-btn lg" type="submit">Sign in</button>
  </form>
`)}
</div>`,
  });
}

export function invitePage(opts: {
  brand?: BrandChrome;
  token: string;
  offer: { email: string; name: string; role: Role; productRoles: Record<string, Role>; expiresAt: string };
  error?: string;
  csrf: string;
  products: Array<{ slug: string; title: string }>;
}): string {
  const perProduct = Object.entries(opts.offer.productRoles);
  return layout({
    title: "Accept your invitation",
    brand: opts.brand,
    body: `<div class="sr-container sr-narrow">
${card(`
  <h1>Welcome to the ARAG Showroom</h1>
  <p class="sr-sub">You have been invited as <strong>${esc(opts.offer.email)}</strong>. Choose a password to finish setting up your account.</p>
  <dl class="arag-kv">
    <dt>Role</dt><dd>${chip(opts.offer.role, "info")} ${esc(ROLE_DESCRIPTIONS[opts.offer.role])}</dd>
    ${
      perProduct.length
        ? `<dt>Per product</dt><dd>${perProduct
            .map(
              ([slug, role]) =>
                `${esc(opts.products.find((p) => p.slug === slug)?.title ?? slug)}: ${chip(role, "outline")}`,
            )
            .join(" · ")}</dd>`
        : ""
    }
    <dt>Link expires</dt><dd>${esc(opts.offer.expiresAt)}</dd>
  </dl>
  ${opts.error ? alert("danger", opts.error, "Try again.") : ""}
  <form method="post" action="/invite/${esc(opts.token)}" class="arag-stack">
    ${csrfInput(opts.csrf)}
    ${field({ name: "name", label: "Your name", value: opts.offer.name, autocomplete: "name", autofocus: true })}
    ${field({ name: "password", label: "Choose a password", type: "password", required: true, minLength: 12, autocomplete: "new-password", help: "At least 12 characters, and not something guessable." })}
    ${field({ name: "confirm", label: "Confirm password", type: "password", required: true, minLength: 12, autocomplete: "new-password" })}
    <button class="arag-btn lg" type="submit">Create my account</button>
  </form>
`)}
</div>`,
  });
}

export function accountPage(opts: {
  chrome: Chrome;
  user: PublicUser;
  products: Array<{ slug: string; title: string; accessLabel: string; surfaces: Surface[] }>;
  error?: string;
  notice?: string;
  forced?: boolean;
  csrf: string;
}): string {
  return layout({
    title: "Account",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container sr-narrow">
${pageHeader("Your account", opts.user.email)}
${opts.forced ? alert("warn", "Choose a new password before you continue.", "Password change required.") : ""}
${opts.notice ? alert("ok", opts.notice) : ""}
${opts.error ? alert("danger", opts.error) : ""}
${card(`
  <h2>Access</h2>
  <dl class="arag-kv">
    <dt>Name</dt><dd>${esc(opts.user.name)}</dd>
    <dt>Global role</dt><dd>${chip(opts.user.role, "info")} ${esc(ROLE_DESCRIPTIONS[opts.user.role])}</dd>
    <dt>Last sign-in</dt><dd>${esc(opts.user.lastLoginAt ?? "this is your first")}</dd>
  </dl>
  ${table(
    ["Product", "Your access", "Surfaces"],
    opts.products.map((p) => [
      esc(p.title),
      chip(p.accessLabel, "outline"),
      p.surfaces.map((s) => esc(s)).join(", "),
    ]),
    { raw: true },
  )}
`)}
${card(`
  <h2>Change password</h2>
  <form method="post" action="/account/password" class="arag-stack">
    ${csrfInput(opts.csrf)}
    ${field({ name: "currentPassword", label: "Current password", type: "password", required: true, autocomplete: "current-password" })}
    ${field({ name: "newPassword", label: "New password", type: "password", required: true, minLength: 12, autocomplete: "new-password", help: "At least 12 characters. Changing it signs out your other sessions." })}
    ${field({ name: "confirm", label: "Confirm new password", type: "password", required: true, minLength: 12, autocomplete: "new-password" })}
    <button class="arag-btn" type="submit">Change password</button>
  </form>
`)}
</div>`,
  });
}

// ───────────────────────────── home ─────────────────────────────

export function homePage(opts: { chrome: Chrome; products: ProductView[] }): string {
  return layout({
    title: "Products",
    description: "The three products built on Progress Agentic RAG.",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container">
${pageHeader(
  "Three accelerators on Progress Agentic RAG",
  "Pick one to read its positioning, browse the documentation, watch the showcase, or open the live demo.",
)}
<div class="sr-cards">
${opts.products.map(productCard).join("\n")}
</div>
</div>`,
  });
}

function productCard(p: ProductView): string {
  const name = p.recommendedName || p.workingTitle;
  return `<article class="sr-card" style="--sr-accent:${esc(p.accent || "#4b4bf7")}">
  <a class="sr-card-shot" href="/p/${esc(p.slug)}" tabindex="-1" aria-hidden="true">
    ${
      p.thumbnail && has(p, "showcase")
        ? `<img src="/api/v1/products/${esc(p.slug)}/assets/${esc(p.thumbnail)}" alt="" loading="lazy" width="640" height="400">`
        : `<span class="sr-card-shot-empty"></span>`
    }
  </a>
  <div class="sr-card-body">
    <h2><a href="/p/${esc(p.slug)}">${esc(name)}</a></h2>
    <p class="sr-card-working">Working title: ${esc(p.workingTitle)} ${chip(p.accessLabel, "outline")}</p>
    <p class="sr-card-line">${esc(p.oneLiner || p.summary)}</p>
  </div>
  <div class="sr-card-actions">
    <a class="arag-btn sm" href="/p/${esc(p.slug)}">Overview</a>
    ${has(p, "docs") ? `<a class="arag-btn sm secondary" href="/p/${esc(p.slug)}/docs">Docs</a>` : ""}
    ${has(p, "enablement") ? `<a class="arag-btn sm secondary" href="/p/${esc(p.slug)}/enablement">Enablement</a>` : ""}
    ${has(p, "showcase") ? `<a class="arag-btn sm secondary" href="/p/${esc(p.slug)}/showcase">Showcase</a>` : ""}
    ${has(p, "demo") && p.demoUrl ? `<a class="arag-btn sm ghost" href="${esc(p.demoUrl)}" target="_blank" rel="noopener noreferrer">Open demo ↗</a>` : ""}
    ${has(p, "admin") && p.adminUrl ? `<a class="arag-btn sm ghost" href="${esc(p.adminUrl)}" target="_blank" rel="noopener noreferrer">Open admin ↗</a>` : ""}
  </div>
</article>`;
}

// ───────────────────────────── product pages ─────────────────────────────

export function productOverviewPage(opts: {
  chrome: Chrome;
  product: ProductView;
  positioningHtml: string;
  positioningPath: string | null;
  hasMermaid: boolean;
  extras: Array<{ href: string; label: string; description: string }>;
}): string {
  const p = opts.product;
  const name = p.recommendedName || p.workingTitle;
  return layout({
    title: name,
    description: p.oneLiner,
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    breadcrumb: [
      { href: "/", label: "Products" },
      { href: `/p/${p.slug}`, label: name },
    ],
    mermaid: opts.hasMermaid,
    body: `<div class="sr-container">
<div class="sr-hero" style="--sr-accent:${esc(p.accent || "#4b4bf7")}">
  <div>
    <p class="sr-eyebrow">Working title: ${esc(p.workingTitle)} · your access: ${esc(p.accessLabel)}</p>
    <h1>${esc(name)}</h1>
    <p class="sr-lede">${esc(p.oneLiner || p.summary)}</p>
    <div class="sr-hero-actions">${externalButtons(p)}</div>
  </div>
  ${
    p.thumbnail && has(p, "showcase")
      ? `<a class="sr-hero-shot" href="/p/${esc(p.slug)}/showcase"><img src="/api/v1/products/${esc(p.slug)}/assets/${esc(p.thumbnail)}" alt="Screenshot from the ${esc(name)} showcase" loading="lazy" width="640" height="400"></a>`
      : ""
  }
</div>
${productNav(p, `/p/${p.slug}`)}
${
  has(p, "admin") && p.adminToken
    ? card(`
  <h2>Operator access</h2>
  <p class="sr-sub">This is the live admin token for ${esc(p.workingTitle)}. Treat it as a password.</p>
  <div class="sr-token">
    <code id="admin-token" class="sr-token-value" data-secret="${esc(p.adminToken)}">••••••••••••••••</code>
    <button class="arag-btn sm secondary" type="button" data-reveal="admin-token">Reveal</button>
    <button class="arag-btn sm ghost" type="button" data-copy="admin-token">Copy</button>
  </div>
  <p class="arag-help">Supplied by <code>${esc(p.adminTokenEnv)}</code> on this deployment.</p>
`)
    : has(p, "admin")
      ? alert(
          "info",
          `No admin token is configured for this product on this deployment. Set ${p.adminTokenEnv} to show it here.`,
        )
      : ""
}
<div class="sr-split">
  <div class="sr-reader md-body">
    ${opts.positioningHtml || empty("No positioning document has been synced for this product yet.")}
  </div>
  <aside class="sr-aside">
    ${card(`
      <h2>Go deeper</h2>
      <ul class="sr-linklist">
        ${opts.extras.map((e) => `<li><a href="${esc(e.href)}">${esc(e.label)}</a><span>${esc(e.description)}</span></li>`).join("")}
      </ul>
    `)}
    ${card(`
      <h2>Content snapshot</h2>
      <dl class="arag-kv">
        <dt>Repository</dt><dd><code>${esc(p.repo)}</code></dd>
        <dt>Commit</dt><dd><code>${esc(p.commit ?? "unknown")}</code></dd>
        <dt>Synced</dt><dd>${esc(p.syncedAt ?? "never")}</dd>
        ${opts.positioningPath ? `<dt>Source</dt><dd><code>${esc(opts.positioningPath)}</code></dd>` : ""}
      </dl>
    `)}
  </aside>
</div>
</div>`,
  });
}

export interface ReaderPage {
  path: string;
  title: string;
  html: string;
  hasMermaid: boolean;
  sourcePath: string;
  section: string;
}

export function readerPage(opts: {
  chrome: Chrome;
  product: ProductView;
  sections: ContentSection[];
  page: ReaderPage | null;
  /** "docs" or "enablement" — controls the URL prefix and nav highlight. */
  area: "docs" | "enablement";
  intro?: string;
  notice?: string;
}): string {
  const p = opts.product;
  const name = p.recommendedName || p.workingTitle;
  const base = `/p/${p.slug}/${opts.area}`;
  const areaLabel = opts.area === "docs" ? "Docs" : "Enablement";
  // URLs drop the area prefix (`/p/x/docs/business/faq.md`, not `/p/x/docs/docs/business/faq.md`).
  const href = (path: string) =>
    `${base}/${path.startsWith(`${opts.area}/`) ? path.slice(opts.area.length + 1) : path}`;
  const nav = opts.sections.length
    ? `<nav class="sr-docnav" aria-label="${esc(areaLabel)} navigation">
${opts.sections
  .map(
    (s) => `  <h2>${esc(s.section)}</h2>
  <ul>${s.items
    .map(
      (i) =>
        `<li><a href="${esc(href(i.path))}"${opts.page?.path === i.path ? ' aria-current="page"' : ""}>${esc(i.title)}</a></li>`,
    )
    .join("")}</ul>`,
  )
  .join("\n")}
</nav>`
    : empty("Nothing has been synced for this area yet.");

  return layout({
    title: opts.page ? `${opts.page.title} · ${name}` : `${areaLabel} · ${name}`,
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    wide: true,
    mermaid: opts.page?.hasMermaid ?? false,
    breadcrumb: [
      { href: "/", label: "Products" },
      { href: `/p/${p.slug}`, label: name },
      { href: base, label: areaLabel },
      ...(opts.page ? [{ href: href(opts.page.path), label: opts.page.title }] : []),
    ],
    body: `<div class="sr-container sr-docs">
<details class="sr-docnav-toggle">
  <summary>${esc(areaLabel)} navigation</summary>
  ${nav}
</details>
<div class="sr-docnav-side">${nav}</div>
<article class="sr-reader md-body">
  ${opts.notice ? alert("warn", opts.notice) : ""}
  ${
    opts.page
      ? `${opts.page.html}
  <footer class="sr-source">Source: <code>${esc(opts.page.sourcePath)}</code></footer>`
      : `<h1>${esc(areaLabel)} — ${esc(name)}</h1>
  <p class="sr-lede">${esc(opts.intro ?? "")}</p>
  ${productNav(p, base)}
  ${
    opts.sections.length
      ? opts.sections
          .map(
            (s) =>
              `<section class="sr-index-block"><h2>${esc(s.section)}</h2><ul class="sr-linklist">${s.items
                .map(
                  (i) =>
                    `<li><a href="${esc(href(i.path))}">${esc(i.title)}</a><span>${esc(i.path)}</span></li>`,
                )
                .join("")}</ul></section>`,
          )
          .join("")
      : ""
  }`
  }
</article>
</div>`,
  });
}

export function showcasePage(opts: {
  chrome: Chrome;
  product: ProductView;
  scriptHtml: string;
  storyboardHtml: string;
}): string {
  const p = opts.product;
  const name = p.recommendedName || p.workingTitle;
  return layout({
    title: `Showcase · ${name}`,
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    breadcrumb: [
      { href: "/", label: "Products" },
      { href: `/p/${p.slug}`, label: name },
      { href: `/p/${p.slug}/showcase`, label: "Showcase" },
    ],
    body: `<div class="sr-container">
${pageHeader(`${name} showcase`, "A recorded two-to-three minute walkthrough, the shot list, and every screenshot.")}
${productNav(p, `/p/${p.slug}/showcase`)}
${
  p.video
    ? card(`<video class="sr-video" controls preload="metadata"${p.thumbnail ? ` poster="/api/v1/products/${esc(p.slug)}/assets/${esc(p.thumbnail)}"` : ""}>
  <source src="/api/v1/products/${esc(p.slug)}/assets/${esc(p.video)}" type="${p.video.endsWith(".mp4") ? "video/mp4" : "video/webm"}">
  Your browser cannot play this recording. <a href="/api/v1/products/${esc(p.slug)}/assets/${esc(p.video)}">Download it instead.</a>
</video>`)
    : alert("info", "No recording has been synced for this product yet.")
}
${
  p.screenshots.length
    ? `<section class="sr-gallery-block">
  <h2>Screenshots</h2>
  <div class="sr-gallery">${p.screenshots
    .map(
      (s, i) =>
        `<figure><a href="/api/v1/products/${esc(p.slug)}/assets/${esc(s)}" target="_blank" rel="noopener noreferrer"><img src="/api/v1/products/${esc(p.slug)}/assets/${esc(s)}" alt="Showcase screenshot ${i + 1}: ${esc(shotLabel(s))}" loading="lazy" width="480" height="300"></a><figcaption>${esc(shotLabel(s))}</figcaption></figure>`,
    )
    .join("")}</div>
</section>`
    : ""
}
<div class="sr-split">
  <div class="sr-reader md-body">${opts.scriptHtml || empty("No script has been synced.")}</div>
  <div class="sr-reader md-body">${opts.storyboardHtml || empty("No storyboard has been synced.")}</div>
</div>
</div>`,
  });
}

function shotLabel(path: string): string {
  return (path.split("/").pop() ?? path)
    .replace(/\.png$/i, "")
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ");
}

// ───────────────────────────── admin ─────────────────────────────

const adminTabs = (current: string): string =>
  `<nav class="sr-subnav" aria-label="Administration">${[
    ["/admin", "Users"],
    ["/admin/invites", "Invites"],
    ["/admin/audit", "Audit log"],
    ["/admin/system", "System"],
  ]
    .map(
      ([href, label]) =>
        `<a href="${esc(href ?? "")}"${href === current ? ' aria-current="page"' : ""}>${esc(label ?? "")}</a>`,
    )
    .join("")}</nav>`;

const roleOptions = (selected?: Role) =>
  ROLES.map((r) => ({ value: r, label: `${r} — ${ROLE_DESCRIPTIONS[r]}`, selected: r === selected }));

function productRoleFields(
  products: Array<{ slug: string; title: string }>,
  current: Record<string, Role> = {},
) {
  return `<fieldset class="sr-fieldset">
  <legend>Per-product role (optional — adds to the global role)</legend>
  <div class="sr-grid-3">
  ${products
    .map((p) =>
      select({
        name: `productRole:${p.slug}`,
        label: p.title,
        options: [
          { value: "", label: "— use the global role —", selected: !current[p.slug] },
          ...ROLES.map((r) => ({ value: r, label: r, selected: current[p.slug] === r })),
        ],
      }),
    )
    .join("")}
  </div>
</fieldset>`;
}

export function adminUsersPage(opts: {
  chrome: Chrome;
  users: PublicUser[];
  products: Array<{ slug: string; title: string }>;
  notice?: string;
  error?: string;
  temporaryPassword?: { email: string; password: string };
  csrf: string;
}): string {
  return layout({
    title: "Users",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container">
${pageHeader("Users", `${opts.users.length} account${opts.users.length === 1 ? "" : "s"}`)}
${adminTabs("/admin")}
${opts.notice ? alert("ok", opts.notice) : ""}
${opts.error ? alert("danger", opts.error) : ""}
${
  opts.temporaryPassword
    ? alertHtml(
        "warn",
        `<strong>Temporary password for ${esc(opts.temporaryPassword.email)}</strong> — shown once, copy it now: <code class="sr-secret">${esc(opts.temporaryPassword.password)}</code>`,
      )
    : ""
}
${card(`
${table(
  ["Email", "Name", "Global role", "Per product", "State", "Last sign-in", ""],
  opts.users.map((u) => [
    esc(u.email),
    esc(u.name),
    chip(u.role, "info"),
    Object.entries(u.productRoles)
      .map(
        ([slug, role]) => `${esc(opts.products.find((p) => p.slug === slug)?.title ?? slug)}: ${esc(role)}`,
      )
      .join("<br>") || "—",
    [
      u.disabled ? chip("disabled", "danger") : chip("active", "ok"),
      u.locked ? chip("locked", "warn") : "",
      u.mustChangePassword ? chip("must change password", "warn") : "",
    ].join(" "),
    esc(u.lastLoginAt ?? "never"),
    `<form method="post" action="/admin/users/${esc(u.id)}" class="sr-rowform">
       ${csrfInput(opts.csrf)}
       <select class="arag-select sm" name="role" aria-label="Role for ${esc(u.email)}">${ROLES.map((r) => `<option value="${r}"${r === u.role ? " selected" : ""}>${r}</option>`).join("")}</select>
       <button class="arag-btn sm secondary" name="action" value="role" type="submit">Set role</button>
       <button class="arag-btn sm ghost" name="action" value="${u.disabled ? "enable" : "disable"}" type="submit">${u.disabled ? "Enable" : "Disable"}</button>
       <button class="arag-btn sm ghost" name="action" value="reset" type="submit">Reset password</button>
       <button class="arag-btn sm danger" name="action" value="delete" type="submit">Delete</button>
     </form>`,
  ]),
  { raw: true },
)}
`)}
${card(`
  <h2>Add a user directly</h2>
  <p class="sr-sub">Most people should be invited instead — this creates an account with a temporary password you then have to hand over.</p>
  <form method="post" action="/admin/users" class="arag-stack">
    ${csrfInput(opts.csrf)}
    ${field({ name: "email", label: "Email", type: "email", required: true, autocomplete: "off" })}
    ${field({ name: "name", label: "Name" })}
    ${select({ name: "role", label: "Global role", options: roleOptions("viewer") })}
    ${productRoleFields(opts.products)}
    <button class="arag-btn" type="submit">Create user</button>
  </form>
`)}
</div>`,
  });
}

export function adminInvitesPage(opts: {
  chrome: Chrome;
  invites: PublicInvite[];
  requests: AccessRequestDoc[];
  products: Array<{ slug: string; title: string }>;
  notice?: string;
  error?: string;
  created?: PublicInvite;
  csrf: string;
}): string {
  const open = opts.requests.filter((r) => r.status === "new");
  return layout({
    title: "Invites",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container">
${pageHeader("Invitations", "Create a one-time link, send it to the person, and they set their own password.")}
${adminTabs("/admin/invites")}
${opts.notice ? alert("ok", opts.notice) : ""}
${opts.error ? alert("danger", opts.error) : ""}
${
  opts.created?.inviteUrl
    ? alertHtml(
        "ok",
        `<strong>Invitation created for ${esc(opts.created.email)}.</strong> This link is shown once — send it now:
     <div class="sr-token"><code id="invite-url" class="sr-token-value" data-secret="${esc(opts.created.inviteUrl)}">${esc(opts.created.inviteUrl)}</code>
     <button class="arag-btn sm ghost" type="button" data-copy="invite-url">Copy</button></div>`,
      )
    : ""
}
${card(`
  <h2>Access requests <span class="arag-chip ${open.length ? "warn" : "neutral"}">${open.length} open</span></h2>
  <p class="sr-sub">Submitted from the public site. Nothing was emailed — invite or dismiss them here.</p>
  ${
    opts.requests.length
      ? table(
          ["When", "Name", "Email", "Organisation", "Products", "Message", "Status", ""],
          opts.requests.map((r) => [
            esc(r.createdAt),
            esc(r.name),
            esc(r.email),
            esc(r.organisation || "—"),
            r.products.map((s) => esc(opts.products.find((p) => p.slug === s)?.title ?? s)).join(", ") || "—",
            `<span class="sr-clamp">${esc(r.message || "—")}</span>`,
            chip(r.status, r.status === "new" ? "warn" : r.status === "invited" ? "ok" : "neutral"),
            r.status === "new"
              ? `<form method="post" action="/admin/access-requests/${esc(r.id)}" class="sr-rowform">${csrfInput(opts.csrf)}
                   <button class="arag-btn sm secondary" name="status" value="invited" type="submit">Mark invited</button>
                   <button class="arag-btn sm ghost" name="status" value="dismissed" type="submit">Dismiss</button>
                 </form>`
              : `${esc(r.handledBy ?? "")}`,
          ]),
          { raw: true },
        )
      : empty("No access requests yet.")
  }
`)}
${card(`
  <h2>Invite someone</h2>
  <form method="post" action="/admin/invites" class="arag-stack">
    ${csrfInput(opts.csrf)}
    ${field({ name: "email", label: "Email", type: "email", required: true, autocomplete: "off" })}
    ${field({ name: "name", label: "Name (optional)" })}
    ${select({ name: "role", label: "Global role", options: roleOptions("viewer") })}
    ${productRoleFields(opts.products)}
    ${field({ name: "expiresInDays", label: "Expires in (days)", type: "number", value: "7" })}
    <button class="arag-btn" type="submit">Create invitation</button>
  </form>
`)}
${card(`
  <h2>Existing invitations</h2>
  ${
    opts.invites.length
      ? table(
          ["Email", "Role", "Status", "Expires", "Created by", ""],
          opts.invites.map((i) => [
            esc(i.email),
            chip(i.role, "info"),
            chip(i.status, i.status === "pending" ? "ok" : i.status === "accepted" ? "neutral" : "warn"),
            esc(i.expiresAt),
            esc(i.createdBy),
            i.status === "pending"
              ? `<form method="post" action="/admin/invites/${esc(i.id)}/revoke" class="sr-inline-form">${csrfInput(opts.csrf)}<button class="arag-btn sm danger" type="submit">Revoke</button></form>`
              : "",
          ]),
          { raw: true },
        )
      : empty("No invitations yet.")
  }
`)}
</div>`,
  });
}

export function adminAuditPage(opts: { chrome: Chrome; entries: AuditDoc[]; action?: string }): string {
  return layout({
    title: "Audit log",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container">
${pageHeader("Audit log", "Every sign-in, sign-in failure and administrative action.")}
${adminTabs("/admin/audit")}
${card(`
<form method="get" action="/admin/audit" class="sr-filter">
  ${field({ name: "action", label: "Filter by action", value: opts.action ?? "", placeholder: "auth.login" })}
  <button class="arag-btn secondary" type="submit">Filter</button>
</form>
${
  opts.entries.length
    ? table(
        ["When", "Action", "Actor", "Target", "IP", "Detail"],
        opts.entries.map((e) => [
          e.ts,
          e.action,
          e.actorEmail ?? "—",
          e.target ?? "—",
          e.ip ?? "—",
          JSON.stringify(e.detail),
        ]),
      )
    : empty("Nothing recorded yet.")
}
`)}
</div>`,
  });
}

export function adminSystemPage(opts: {
  chrome: Chrome;
  health: Record<string, unknown>;
  config: Record<string, unknown>;
  usage: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
}): string {
  const json = (value: unknown) => `<pre class="arag-json">${esc(JSON.stringify(value, null, 2))}</pre>`;
  return layout({
    title: "System",
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container">
${pageHeader("System", "Health, configuration, usage and recent logs.")}
${adminTabs("/admin/system")}
<div class="sr-grid-2">
${card(`<h2>Health</h2>${json(opts.health)}`)}
${card(`<h2>Usage</h2>${json(opts.usage)}`)}
</div>
${card(`<h2>Configuration</h2><p class="sr-sub">Secrets are redacted.</p>${json(opts.config)}`)}
${card(
  `<h2>Recent logs</h2><div class="arag-log">${opts.logs
    .map(
      (l) =>
        `<div class="line"><span class="lvl ${esc(String(l.level))}">${esc(String(l.level))}</span> <span class="ts">${esc(String(l.ts))}</span> ${esc(String(l.msg))} ${esc(
          JSON.stringify(
            Object.fromEntries(Object.entries(l).filter(([k]) => !["ts", "level", "msg"].includes(k))),
          ),
        )}</div>`,
    )
    .join("")}</div>`,
)}
</div>`,
  });
}

// ───────────────────────────── errors ─────────────────────────────

export function messagePage(opts: {
  brand?: BrandChrome;
  chrome: Chrome;
  status: number;
  title: string;
  message: string;
  links?: NavLink[];
}): string {
  return layout({
    title: opts.title,
    viewer: opts.chrome.viewer,
    nav: opts.chrome.nav,
    brand: opts.chrome.brand,
    body: `<div class="sr-container sr-narrow">
${card(`
  <p class="sr-eyebrow">${opts.status}</p>
  <h1>${esc(opts.title)}</h1>
  <p class="sr-lede">${esc(opts.message)}</p>
  <p>${(opts.links ?? [{ href: "/", label: "Back to the products" }])
    .map((l) => `<a class="arag-btn secondary" href="${esc(l.href)}">${esc(l.label)}</a>`)
    .join(" ")}</p>
`)}
</div>`,
  });
}
