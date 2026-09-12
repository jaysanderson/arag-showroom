/**
 * Server-rendered HTML: the document shell and the small building blocks the pages share.
 *
 * There is no client framework. Every page is a pure function from data to a string, which keeps
 * the portal fast, keyboard-accessible and fully usable with JavaScript disabled — the only script
 * on the page is progressive enhancement (Mermaid rendering, the mobile nav toggle, copy buttons).
 * Nothing here interpolates a value without escaping it, and there are no inline event handlers, so
 * the Content-Security-Policy never needs to be widened for the portal's own markup.
 */
import { escapeHtml } from "../markdown.ts";
import type { Role } from "../permissions.ts";

export const esc = escapeHtml;

export interface NavLink {
  href: string;
  label: string;
  current?: boolean;
}

/** The deployment's white-label identity, applied to both shells. */
export interface BrandChrome {
  productName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  poweredBy: boolean;
  footerText: string;
}

export const DEFAULT_BRAND: BrandChrome = {
  productName: "Progress Agentic RAG Partner Accelerators",
  tagline: "",
  logoUrl: "",
  primaryColor: "",
  accentColor: "",
  poweredBy: true,
  footerText: "",
};

/** Wordmark: a partner logo when one is configured, otherwise the product name as text. */
export function brandMark(brand: BrandChrome): string {
  return brand.logoUrl
    ? `<img class="sr-brand-logo" src="${esc(brand.logoUrl)}" alt="${esc(brand.productName)}" height="24">`
    : `<span class="sr-brand-mark" aria-hidden="true"></span><span>${esc(brand.productName)}</span>`;
}

/** BRAND_* colours become CSS custom properties; empty values fall through to the UI kit. */
function brandStyle(brand: BrandChrome): string {
  const parts = [
    brand.primaryColor ? `--arag-brand-500:${brand.primaryColor};--sr-accent:${brand.primaryColor}` : "",
    brand.accentColor ? `--arag-accent-500:${brand.accentColor}` : "",
  ].filter(Boolean);
  return parts.length ? `<style>:root{${esc(parts.join(";"))}}</style>` : "";
}

/** Falls back to the default identity when a caller has no branding to pass. */
export function brandOr(brand: BrandChrome | undefined): BrandChrome {
  return brand ?? DEFAULT_BRAND;
}

export interface ViewerChrome {
  email: string;
  name: string;
  role: Role;
  siteAdmin: boolean;
}

export interface LayoutOptions {
  title: string;
  /** Page-level description used in the <meta> tag. */
  description?: string;
  brand?: BrandChrome;
  viewer?: ViewerChrome | null;
  /** Extra links in the header nav. */
  nav?: NavLink[];
  /** Rendered breadcrumb trail. */
  breadcrumb?: NavLink[];
  /** Adds the Mermaid bootstrap script to this page only. */
  mermaid?: boolean;
  /** Adds a wide layout (docs reader). */
  wide?: boolean;
  body: string;
}

const MERMAID_SRC = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js";

/** The shared <head>. Titles and descriptions are the only SEO the site carries by design. */
export function head(title: string, description: string): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/ui/arag-ui.css">
<link rel="stylesheet" href="/assets/showroom.css">
<link rel="icon" href="/ui/favicon.svg" type="image/svg+xml">`;
}

export function mermaidScripts(enabled: boolean): string {
  return enabled
    ? `<script src="${MERMAID_SRC}"></script>\n<script src="/assets/mermaid-init.js" type="module"></script>`
    : "";
}

export interface SiteLayoutOptions {
  title: string;
  description: string;
  brand?: BrandChrome;
  /** Signed-in chrome, when the visitor happens to have a session. */
  viewer?: ViewerChrome | null;
  nav?: NavLink[];
  mermaid?: boolean;
  body: string;
}

/**
 * The public marketing shell. Deliberately separate from the portal shell: it has its own header,
 * a full-width body with no container, and a footer built for an outside reader rather than an
 * operator.
 */
export function siteLayout(opts: SiteLayoutOptions): string {
  const nav = opts.nav ?? [
    { href: "/#products", label: "Products" },
    { href: "/#platform", label: "Platform" },
    { href: "/partners", label: "For partners" },
    { href: "/#roadmap", label: "Roadmap" },
  ];
  const brand = brandOr(opts.brand);
  return `<!doctype html>
<html lang="en">
<head>
${head(opts.title, opts.description)}
${brandStyle(brand)}
</head>
<body class="sr-body sr-site">
<a class="sr-skip" href="#main">Skip to content</a>
<header class="sr-site-header">
  <div class="sr-site-header-inner">
    <a class="sr-brand" href="/">${brandMark(brand)}</a>
    <nav class="sr-site-nav" aria-label="Primary">
      ${nav.map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join("\n      ")}
    </nav>
    <div class="sr-site-cta">
      ${
        opts.viewer
          ? `<a class="arag-btn sm secondary" href="/portal">Open the portal</a>`
          : `<a class="sr-textlink" href="/login">Sign in</a><a class="arag-btn sm" href="/request-access">Request access</a>`
      }
    </div>
  </div>
</header>
<main id="main" class="sr-site-main" tabindex="-1">
${opts.body}
</main>
<footer class="sr-site-footer">
  <div class="sr-shell">
    <div class="sr-site-footer-grid">
      <div>
        <p class="sr-brand sr-brand-footer">${brandMark(brand)}</p>
        <p class="sr-muted">${esc(brand.tagline || "Three open-source accelerators on Progress Agentic RAG, one shared platform.")}</p>
      </div>
      <div>
        <h2>Products</h2>
        <ul><li><a href="/products/doc-processing">Document Processing</a></li><li><a href="/products/call-analysis">Call Analysis</a></li><li><a href="/products/voicebridge">VoiceBridge</a></li></ul>
      </div>
      <div>
        <h2>Access</h2>
        <ul><li><a href="/partners">For partners</a></li><li><a href="/request-access">Request access</a></li><li><a href="/login">Sign in</a></li><li><a href="/api/v1/docs">Portal API</a></li></ul>
      </div>
      <div>
        <h2>Open source</h2>
        <ul><li>Apache-2.0 licensed</li><li>Zero runtime dependencies</li><li>Self-hostable</li></ul>
      </div>
    </div>
    <p class="sr-site-footer-legal">${esc(
      brand.footerText ||
        `Apache-2.0.${brand.poweredBy ? " Built on Progress Agentic RAG." : ""} No analytics, no trackers, no cookie banner: the only cookie is your sign-in session.`,
    )}</p>
  </div>
</footer>
<script src="/assets/showroom.js" type="module"></script>
${mermaidScripts(opts.mermaid ?? false)}
</body>
</html>`;
}

export function layout(opts: LayoutOptions): string {
  const nav = opts.nav ?? [];
  const viewer = opts.viewer ?? null;
  const brand = brandOr(opts.brand);
  return `<!doctype html>
<html lang="en">
<head>
${head(`${opts.title} · ${brand.productName}`, opts.description ?? "Invite-only partner portal for the Progress Agentic RAG accelerators.")}
<meta name="robots" content="noindex, nofollow">
${brandStyle(brand)}
</head>
<body class="sr-body${opts.wide ? " sr-wide" : ""}">
<a class="sr-skip" href="#main">Skip to content</a>
<header class="sr-header">
  <div class="sr-header-inner">
    <a class="sr-brand" href="/">${brandMark(brand)}</a>
    <nav class="sr-nav" aria-label="Primary">
      ${nav
        .map((l) => `<a href="${esc(l.href)}"${l.current ? ' aria-current="page"' : ""}>${esc(l.label)}</a>`)
        .join("\n      ")}
    </nav>
    ${
      viewer
        ? `<div class="sr-viewer">
      <a class="sr-viewer-id" href="/account" title="${esc(viewer.email)}"><span class="sr-viewer-name">${esc(viewer.name)}</span><span class="arag-chip outline">${esc(viewer.role)}</span></a>
      <form method="post" action="/logout" class="sr-inline-form"><button class="arag-btn ghost sm" type="submit">Sign out</button></form>
    </div>`
        : `<div class="sr-viewer"><a class="arag-btn sm" href="/login">Sign in</a></div>`
    }
  </div>
</header>
${
  opts.breadcrumb?.length
    ? `<nav class="sr-breadcrumb" aria-label="Breadcrumb"><div class="sr-container">${opts.breadcrumb
        .map((b, i) =>
          i === (opts.breadcrumb?.length ?? 0) - 1
            ? `<span aria-current="page">${esc(b.label)}</span>`
            : `<a href="${esc(b.href)}">${esc(b.label)}</a><span class="sr-sep" aria-hidden="true">/</span>`,
        )
        .join("")}</div></nav>`
    : ""
}
<main id="main" class="sr-main" tabindex="-1">
${opts.body}
</main>
<footer class="sr-footer">
  <div class="sr-container">
    <p>${esc(brand.productName)} — invite only. Content is a committed snapshot of each accelerator's repository.</p>
    <p><a href="/api/v1/docs">API reference</a> · <a href="/api/v1/swagger">Swagger</a> · <a href="/account">Account</a></p>
  </div>
</footer>
<script src="/assets/showroom.js" type="module"></script>
${mermaidScripts(opts.mermaid ?? false)}
</body>
</html>`;
}

// ───────────────────────────── building blocks ─────────────────────────────

export function alert(kind: "ok" | "warn" | "danger" | "info", message: string, title?: string): string {
  return `<div class="arag-alert ${kind}" role="${kind === "danger" ? "alert" : "status"}">${
    title ? `<strong>${esc(title)}</strong> ` : ""
  }${esc(message)}</div>`;
}

/** An alert whose body is already-sanitised HTML (used for the one-time invite link). */
export function alertHtml(kind: "ok" | "warn" | "danger" | "info", html: string): string {
  return `<div class="arag-alert ${kind}" role="status">${html}</div>`;
}

export function chip(label: string, kind = "neutral"): string {
  return `<span class="arag-chip ${esc(kind)}">${esc(label)}</span>`;
}

export function card(body: string, opts: { className?: string } = {}): string {
  return `<section class="arag-card${opts.className ? ` ${esc(opts.className)}` : ""}">${body}</section>`;
}

export function field(opts: {
  name: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  autocomplete?: string;
  help?: string;
  placeholder?: string;
  autofocus?: boolean;
  minLength?: number;
}): string {
  const id = `f-${opts.name}`;
  return `<div class="arag-field">
  <label class="arag-label" for="${esc(id)}">${esc(opts.label)}</label>
  <input class="arag-input" id="${esc(id)}" name="${esc(opts.name)}" type="${esc(opts.type ?? "text")}"
    value="${esc(opts.value ?? "")}"${opts.required ? " required" : ""}${opts.autofocus ? " autofocus" : ""}
    ${opts.minLength ? `minlength="${opts.minLength}"` : ""}
    ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ""}
    autocomplete="${esc(opts.autocomplete ?? "off")}">
  ${opts.help ? `<p class="arag-help">${esc(opts.help)}</p>` : ""}
</div>`;
}

export function select(opts: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string; selected?: boolean }>;
  help?: string;
}): string {
  const id = `f-${opts.name}`;
  return `<div class="arag-field">
  <label class="arag-label" for="${esc(id)}">${esc(opts.label)}</label>
  <select class="arag-select" id="${esc(id)}" name="${esc(opts.name)}">
    ${opts.options
      .map((o) => `<option value="${esc(o.value)}"${o.selected ? " selected" : ""}>${esc(o.label)}</option>`)
      .join("\n    ")}
  </select>
  ${opts.help ? `<p class="arag-help">${esc(opts.help)}</p>` : ""}
</div>`;
}

/** Pre-auth forms have no session to bind a token to; SameSite=Lax is their protection. */
export function csrfInput(token: string): string {
  return token ? `<input type="hidden" name="csrf" value="${esc(token)}">` : "";
}

export function empty(message: string): string {
  return `<div class="arag-empty">${esc(message)}</div>`;
}

export function pageHeader(title: string, subtitle?: string, actions = ""): string {
  return `<div class="sr-page-head">
  <div>
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="sr-sub">${esc(subtitle)}</p>` : ""}
  </div>
  ${actions ? `<div class="sr-page-actions">${actions}</div>` : ""}
</div>`;
}

export function table(headers: string[], rows: string[][], opts: { raw?: boolean } = {}): string {
  return `<div class="sr-table-wrap"><table class="arag-table">
<thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
<tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${opts.raw ? c : esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>
</table></div>`;
}
