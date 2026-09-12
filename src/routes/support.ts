/**
 * Shared request plumbing: who is calling, what may they see, and how a content path becomes a URL.
 *
 * Authentication here is deliberately the showroom's own session, not the platform's `auth: "admin"`
 * mode: the portal's notion of "admin" is a role on a user record, and routing that through the
 * platform's shared ADMIN_TOKEN would mean one static secret could impersonate an administrator.
 * The platform token still works as a break-glass operator credential on `/api/v1/admin/*` only,
 * and every use of it is written to the audit log.
 */
import { extname } from "node:path";
import type { Branding, Ctx, Logger, PlatformEnv } from "../../vendor/arag-platform/src/index.ts";
import { forbidden, HttpError, unauthorized } from "../../vendor/arag-platform/src/index.ts";
import { renderMarkdown } from "../markdown.ts";
import { SESSION_COOKIE } from "../openapi.ts";
import { accessLabel, isSiteAdmin, type Principal, type Surface, surfacesFor } from "../permissions.ts";
import type { AccessRequestsService } from "../services/access-requests.ts";
import type { Catalogue, Product } from "../services/catalogue.ts";
import { principalOf, type UserDoc, type UsersService } from "../services/users.ts";
import type { BrandChrome, ViewerChrome } from "../ui/layout.ts";
import type { ProductView } from "../ui/pages.ts";

export interface Usage {
  startedAt: number;
  requests: number;
  pageViews: number;
  logins: number;
  failedLogins: number;
  deniedRequests: number;
}

export interface Deps {
  users: UsersService;
  requests: AccessRequestsService;
  catalogue: Catalogue;
  env: PlatformEnv;
  log: Logger;
  usage: Usage;
  version: string;
  /** Publish live demo URLs on the public pages (SHOWROOM_PUBLIC_DEMO_LINKS=1). */
  publicDemoLinks: boolean;
  /** Absolute base URL, used to build invitation links. */
  publicUrl: string;
  /** White-label branding for this deployment (BRAND_* env). */
  branding: Branding;
  /** Directory holding the flagship launch videos (`<slug>.mp4` + `<slug>.jpg` poster), served under /assets/launch. */
  launchDir: string;
}

// ───────────────────────────── session ─────────────────────────────

export function sessionToken(ctx: Ctx): string | undefined {
  return ctx.cookies()[SESSION_COOKIE];
}

export function viewer(ctx: Ctx, deps: Deps): UserDoc | null {
  const cached = ctx.state.showroomUser;
  if (cached !== undefined) return cached as UserDoc | null;
  const user = deps.users.verify(sessionToken(ctx));
  ctx.state.showroomUser = user;
  return user;
}

/**
 * Routes a user with a temporary password may still call: they have to be able to see who they are
 * and set a new password, and signing out must always work.
 */
const PASSWORD_CHANGE_EXEMPT = new Set([
  "/api/v1/auth/password",
  "/api/v1/auth/me",
  "/api/v1/auth/logout",
  "/api/v1/branding",
]);

export function requireViewer(ctx: Ctx, deps: Deps): UserDoc {
  const user = viewer(ctx, deps);
  if (!user) {
    deps.usage.deniedRequests++;
    throw unauthorized("Sign in to continue.");
  }
  // An admin-set or invited password is a credential the user has not chosen. The HTML pages send
  // such a user to /account; the API has to refuse too, or the redirect would be trivially skipped.
  if (user.mustChangePassword && ctx.path.startsWith("/api/v1/") && !PASSWORD_CHANGE_EXEMPT.has(ctx.path)) {
    deps.usage.deniedRequests++;
    throw new HttpError(
      403,
      "Password change required",
      "Set a password of your own before using the API: POST /api/v1/auth/password.",
      { type: "https://arag.dev/problems/password-change-required" },
    );
  }
  return user;
}

export function requireAdmin(ctx: Ctx, deps: Deps): UserDoc {
  const user = requireViewer(ctx, deps);
  if (!isSiteAdmin(principalOf(user))) {
    deps.usage.deniedRequests++;
    throw forbidden("Administrator access is required.");
  }
  return user;
}

/**
 * Operator endpoints accept either an administrator session or the deployment's ADMIN_TOKEN.
 * Returns the user when there was one, or null for a token-only caller.
 */
export function requireOperator(ctx: Ctx, deps: Deps): UserDoc | null {
  const user = viewer(ctx, deps);
  if (user && isSiteAdmin(principalOf(user))) return user;
  if (ctx.auth.admin) {
    deps.users.record("admin.token.used", { target: ctx.path, ip: ctx.ip });
    return null;
  }
  deps.usage.deniedRequests++;
  if (!user) throw unauthorized("Sign in as an administrator to continue.");
  throw forbidden("Administrator access is required.");
}

export function setSessionCookie(ctx: Ctx, token: string, ttlSec: number): void {
  ctx.setCookie(SESSION_COOKIE, token, {
    maxAge: ttlSec,
    httpOnly: true,
    sameSite: "Lax",
    secure: ctx.env.nodeEnv === "production",
    path: "/",
  });
}

export function clearSessionCookie(ctx: Ctx): void {
  ctx.setCookie(SESSION_COOKIE, "", { maxAge: 0, httpOnly: true, sameSite: "Lax", path: "/" });
}

/** Reject a state-changing form post that did not carry the session's CSRF token. */
export function assertCsrf(ctx: Ctx, deps: Deps): void {
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  if (!deps.users.csrfValid(sessionToken(ctx), body.csrf)) {
    deps.usage.deniedRequests++;
    throw new HttpError(403, "Forbidden", "This form has expired. Reload the page and try again.");
  }
}

export function csrfFor(ctx: Ctx, deps: Deps): string {
  const token = sessionToken(ctx);
  return token ? deps.users.csrfToken(token) : "";
}

// ───────────────────────────── chrome ─────────────────────────────

export function chromeFor(
  user: UserDoc | null,
  current = "",
  brand?: BrandChrome,
): {
  viewer: ViewerChrome | null;
  nav: Array<{ href: string; label: string; current?: boolean }>;
  brand?: BrandChrome;
} {
  if (!user) return { viewer: null, nav: [], brand };
  const admin = isSiteAdmin(principalOf(user));
  const nav = [
    { href: "/portal", label: "Products", current: current === "portal" },
    { href: "/", label: "Public site", current: false },
    ...(admin ? [{ href: "/admin", label: "Administration", current: current === "admin" }] : []),
  ];
  return {
    viewer: { email: user.email, name: user.name, role: user.role, siteAdmin: admin },
    nav,
    brand,
  };
}

// ───────────────────────────── content URLs ─────────────────────────────

/** Content path → showroom URL. `docs/` and `enablement/` prefixes are dropped for readable links. */
export function contentUrl(slug: string, path: string): string {
  if (path.startsWith("enablement/")) return `/p/${slug}/enablement/${path.slice("enablement/".length)}`;
  if (path.startsWith("showcase/")) return `/p/${slug}/showcase`;
  if (path.startsWith("docs/")) return `/p/${slug}/docs/${path.slice("docs/".length)}`;
  return `/p/${slug}/docs/${path}`;
}

/** URL tail → content path, trying the area prefix first so `business/faq.md` finds `docs/business/faq.md`. */
export function contentPathFor(product: Product, area: "docs" | "enablement", rest: string): string {
  const candidates = area === "docs" ? [`docs/${rest}`, rest] : [`enablement/${rest}`, rest];
  for (const candidate of candidates) {
    if (product.pages.some((p) => p.path === candidate)) return candidate;
  }
  return candidates[0] as string;
}

/** Resolve a relative href against a content path, collapsing `.` and `..`. */
export function resolveRelative(basePath: string, href: string): string {
  const baseParts = basePath.split("/").slice(0, -1);
  for (const part of href.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join("/");
}

export function assetUrl(slug: string, path: string): string {
  return `/api/v1/products/${slug}/assets/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * Render one content page. Relative `.md` links become showroom routes, relative images become
 * asset URLs, and external links open in a new tab — all handled inside the renderer, which never
 * emits raw HTML from the source.
 */
export function renderContent(slug: string, contentPath: string, raw: string) {
  return renderMarkdown(raw, {
    resolveLink: (href) => {
      const [target, hash = ""] = splitHash(href);
      if (!target) return href;
      const resolved = resolveRelative(contentPath, target);
      if (/\.md$/i.test(resolved)) return `${contentUrl(slug, resolved)}${hash}`;
      if (isAsset(resolved)) return assetUrl(slug, resolved);
      return `${contentUrl(slug, resolved)}${hash}`;
    },
    resolveImage: (src) => assetUrl(slug, resolveRelative(contentPath, splitHash(src)[0])),
  });
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf("#");
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i)];
}

function isAsset(path: string): boolean {
  return [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".webm", ".mp4"].includes(
    extname(path).toLowerCase(),
  );
}

// ───────────────────────────── product view models ─────────────────────────────

export function principal(user: UserDoc): Principal {
  return principalOf(user);
}

export function surfacesOf(user: UserDoc, slug: string): Surface[] {
  return surfacesFor(principalOf(user), slug);
}

export function requireSurface(ctx: Ctx, deps: Deps, user: UserDoc, slug: string, surface: Surface): void {
  if (surfacesOf(user, slug).includes(surface)) return;
  deps.usage.deniedRequests++;
  deps.log.warn("access.denied", { user: user.email, slug, surface, path: ctx.path });
  throw forbidden(
    `Your role does not include the ${surface} material for this product. Ask an administrator for access.`,
  );
}

/** The per-user product view used by every gated page and by `/api/v1/products`. */
export function productViewFor(deps: Deps, user: UserDoc, product: Product): ProductView {
  const slug = product.config.slug;
  const surfaces = surfacesOf(user, slug);
  const manifest = product.manifest;
  const canAdmin = surfaces.includes("admin");
  return {
    slug,
    title: manifest?.recommendedName || product.config.workingTitle,
    workingTitle: product.config.workingTitle,
    recommendedName: manifest?.recommendedName ?? "",
    oneLiner: manifest?.oneLiner ?? "",
    summary: product.config.summary ?? "",
    accent: product.config.accent ?? "#4b4bf7",
    surfaces,
    accessLabel: accessLabel(principalOf(user), slug),
    hasContent: product.hasContent,
    thumbnail: product.screenshots[0] ?? null,
    video: surfaces.includes("showcase") ? product.video : null,
    screenshots: surfaces.includes("showcase") ? product.screenshots : [],
    demoUrl: surfaces.includes("demo") ? deps.catalogue.demoUrl(product) : null,
    adminUrl: canAdmin ? deps.catalogue.adminUrl(product) : null,
    adminToken: canAdmin ? deps.catalogue.adminToken(product) || null : null,
    adminTokenEnv: deps.catalogue.adminTokenEnvName(product),
    docsUrl: product.config.docsUrl ?? null,
    syncedAt: manifest?.syncedAt ?? null,
    commit: manifest?.commit ?? null,
    repo: manifest?.repo ?? product.config.repo,
  };
}

/** The JSON shape for `/api/v1/products`: the view above minus the UI-only fields. */
export function productSummary(view: ProductView): Record<string, unknown> {
  return {
    slug: view.slug,
    title: view.title,
    workingTitle: view.workingTitle,
    recommendedName: view.recommendedName,
    oneLiner: view.oneLiner,
    summary: view.summary,
    accent: view.accent,
    surfaces: view.surfaces,
    accessLabel: view.accessLabel,
    hasContent: view.hasContent,
    syncedAt: view.syncedAt,
    commit: view.commit,
    thumbnail: view.thumbnail,
    video: view.video,
    demoUrl: view.demoUrl,
    adminUrl: view.adminUrl,
    adminToken: view.adminToken,
    adminTokenEnv: view.adminTokenEnv,
    docsUrl: view.docsUrl,
  };
}

/** Wrap a list in the platform's standard page envelope. */
export function page<T>(items: T[]): Record<string, unknown> {
  return { items, page: 1, page_size: items.length, total: items.length, next_page: false };
}

/** Does this request want JSON back (an API client) rather than a redirect (a browser form)? */
export function wantsJson(ctx: Ctx): boolean {
  const accept = ctx.header("accept") ?? "";
  return accept.includes("application/json") && !accept.includes("text/html");
}
