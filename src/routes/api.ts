/**
 * The `/api/v1` surface. Every route here is described in `src/openapi.ts` first; the schemas that
 * document it are the same ones that validate it (`operationSchemas`), and the contract tests fail
 * the build if the two drift apart.
 *
 * The HTML pages call the same service objects rather than looping back through HTTP, so the two
 * front doors can never disagree about what a role is allowed to do.
 */
import { createReadStream, statSync } from "node:fs";
import type { App } from "../../vendor/arag-platform/src/index.ts";
import {
  badRequest,
  contentTypeFor,
  describeEnv,
  forbidden,
  HttpError,
  notFound,
  operationSchemas,
  tooManyRequests,
} from "../../vendor/arag-platform/src/index.ts";
import { openapi } from "../openapi.ts";
import { isRole, isSiteAdmin, type Role, surfaceForContentPath } from "../permissions.ts";
import { normaliseRelative } from "../services/catalogue.ts";
import { generatePassword, principalOf, SESSION_TTL_SEC, type UserDoc } from "../services/users.ts";
import {
  clearSessionCookie,
  contentPathFor,
  type Deps,
  page,
  productSummary,
  productViewFor,
  renderContent,
  requireAdmin,
  requireOperator,
  requireSurface,
  requireViewer,
  setSessionCookie,
  surfacesOf,
  viewer,
} from "./support.ts";

const validate = (path: string, method: string) => operationSchemas(openapi, path, method);

function sessionBody(deps: Deps, user: UserDoc, expiresAt: string | null): Record<string, unknown> {
  return {
    user: deps.users.publicUser(user),
    siteAdmin: isSiteAdmin(principalOf(user)),
    expiresAt,
    products: deps.catalogue.list().map((p) => ({
      slug: p.config.slug,
      title: p.manifest?.recommendedName || p.config.workingTitle,
      surfaces: surfacesOf(user, p.config.slug),
    })),
  };
}

/** Turn `productRoles` from a request body into a validated map. */
function readProductRoles(value: unknown): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const [slug, role] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    if (isRole(role)) out[slug] = role;
  }
  return out;
}

export function registerApiRoutes(app: App, deps: Deps): void {
  // ── auth ──

  app.post(
    "/api/v1/auth/login",
    async (ctx) => {
      const body = ctx.body as { email: string; password: string };
      const retry = deps.users.throttleCheck(ctx.ip, body.email);
      if (retry !== null) {
        deps.usage.failedLogins++;
        throw tooManyRequests(retry);
      }
      let result: Awaited<ReturnType<typeof deps.users.login>>;
      try {
        result = await deps.users.login(body.email, body.password, ctx.ip);
      } catch (err) {
        deps.usage.failedLogins++;
        throw err;
      }
      deps.usage.logins++;
      setSessionCookie(ctx, result.token, SESSION_TTL_SEC);
      return sessionBody(deps, result.user, result.expiresAt);
    },
    { operationId: "login", validate: validate("/api/v1/auth/login", "post") },
  );

  app.post(
    "/api/v1/auth/logout",
    (ctx) => {
      const user = viewer(ctx, deps);
      if (user) deps.users.record("auth.logout", { actor: user, target: user.email, ip: ctx.ip });
      clearSessionCookie(ctx);
      ctx.noContent();
    },
    { operationId: "logout" },
  );

  app.get("/api/v1/auth/me", (ctx) => sessionBody(deps, requireViewer(ctx, deps), null), {
    operationId: "getSession",
  });

  app.post(
    "/api/v1/auth/password",
    async (ctx) => {
      const user = requireViewer(ctx, deps);
      const body = ctx.body as { currentPassword: string; newPassword: string };
      const updated = await deps.users.changeOwnPassword(user.id, body.currentPassword, body.newPassword);
      deps.users.record("auth.password.changed", { actor: updated, target: updated.email, ip: ctx.ip });
      const issued = deps.users.issue(updated);
      setSessionCookie(ctx, issued.token, SESSION_TTL_SEC);
      return sessionBody(deps, updated, issued.expiresAt);
    },
    { operationId: "changePassword", validate: validate("/api/v1/auth/password", "post") },
  );

  // ── invites ──

  app.get(
    "/api/v1/invites",
    (ctx) => {
      requireAdmin(ctx, deps);
      return page(deps.users.listInvites().map((i) => deps.users.publicInvite(i)));
    },
    { operationId: "listInvites" },
  );

  app.post(
    "/api/v1/invites",
    (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = ctx.body as {
        email: string;
        name?: string;
        role: Role;
        productRoles?: Record<string, Role>;
        expiresInDays?: number;
      };
      const { invite, token } = deps.users.createInvite({
        email: body.email,
        name: body.name,
        role: body.role,
        productRoles: readProductRoles(body.productRoles),
        expiresInDays: body.expiresInDays,
        createdBy: admin,
      });
      deps.requests.markInvited(invite.email, admin.email);
      deps.users.record("invite.created", {
        actor: admin,
        target: invite.email,
        ip: ctx.ip,
        detail: { role: invite.role, expiresAt: invite.expiresAt },
      });
      ctx.json(201, deps.users.publicInvite(invite, inviteUrl(deps, token)));
    },
    { operationId: "createInvite", validate: validate("/api/v1/invites", "post") },
  );

  app.get(
    "/api/v1/invites/:token",
    (ctx) => {
      const invite = deps.users.openInvite(ctx.params.token ?? "");
      return {
        email: invite.email,
        name: invite.name,
        role: invite.role,
        productRoles: invite.productRoles,
        expiresAt: invite.expiresAt,
      };
    },
    { operationId: "getInvite", validate: validate("/api/v1/invites/{token}", "get") },
  );

  app.post(
    "/api/v1/invites/:token/accept",
    async (ctx) => {
      const body = ctx.body as { password: string; name?: string };
      const result = await deps.users.acceptInvite(ctx.params.token ?? "", body.password, {
        name: body.name,
        ip: ctx.ip,
      });
      setSessionCookie(ctx, result.token, SESSION_TTL_SEC);
      ctx.json(201, sessionBody(deps, result.user, result.expiresAt));
    },
    { operationId: "acceptInvite", validate: validate("/api/v1/invites/{token}/accept", "post") },
  );

  app.post(
    "/api/v1/invites/:id/revoke",
    (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const invite = deps.users.revokeInvite(ctx.params.id ?? "");
      deps.users.record("invite.revoked", { actor: admin, target: invite.email, ip: ctx.ip });
      return deps.users.publicInvite(invite);
    },
    { operationId: "revokeInvite", validate: validate("/api/v1/invites/{id}/revoke", "post") },
  );

  // ── access requests ──

  app.post(
    "/api/v1/access-requests",
    (ctx) => {
      const body = ctx.body as {
        name: string;
        email: string;
        organisation?: string;
        message?: string;
        products?: string[];
      };
      const request = deps.requests.submit({
        ...body,
        ip: ctx.ip,
        knownSlugs: deps.catalogue.list().map((p) => p.config.slug),
      });
      deps.users.record("access.requested", {
        target: request.email,
        ip: ctx.ip,
        detail: { organisation: request.organisation, products: request.products },
      });
      ctx.json(201, { ok: true });
    },
    { operationId: "createAccessRequest", validate: validate("/api/v1/access-requests", "post") },
  );

  app.get(
    "/api/v1/access-requests",
    (ctx) => {
      requireAdmin(ctx, deps);
      const status = ctx.queryObj.status as "new" | "invited" | "dismissed" | undefined;
      return page(deps.requests.list(status));
    },
    { operationId: "listAccessRequests", validate: validate("/api/v1/access-requests", "get") },
  );

  app.post(
    "/api/v1/access-requests/:id/resolve",
    (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = ctx.body as { status: "invited" | "dismissed" };
      const request = deps.requests.resolve(ctx.params.id ?? "", body.status, admin.email);
      deps.users.record("access.resolved", {
        actor: admin,
        target: request.email,
        ip: ctx.ip,
        detail: { status: body.status },
      });
      return request;
    },
    {
      operationId: "resolveAccessRequest",
      validate: validate("/api/v1/access-requests/{id}/resolve", "post"),
    },
  );

  // ── users ──

  app.get(
    "/api/v1/users",
    (ctx) => {
      requireAdmin(ctx, deps);
      return page(deps.users.list().map((u) => deps.users.publicUser(u)));
    },
    { operationId: "listUsers" },
  );

  app.post(
    "/api/v1/users",
    async (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = ctx.body as {
        email: string;
        name?: string;
        role: Role;
        productRoles?: Record<string, Role>;
        password?: string;
      };
      const temporaryPassword = body.password ? null : generatePassword();
      const user = await deps.users.create({
        email: body.email,
        name: body.name,
        password: body.password ?? (temporaryPassword as string),
        role: body.role,
        productRoles: readProductRoles(body.productRoles),
        mustChangePassword: true,
        invitedBy: admin.email,
      });
      deps.users.record("user.created", {
        actor: admin,
        target: user.email,
        ip: ctx.ip,
        detail: { role: user.role },
      });
      ctx.json(201, {
        user: deps.users.publicUser(user),
        ...(temporaryPassword ? { temporaryPassword } : {}),
      });
    },
    { operationId: "createUser", validate: validate("/api/v1/users", "post") },
  );

  app.get(
    "/api/v1/users/:id",
    (ctx) => {
      requireAdmin(ctx, deps);
      const user = deps.users.byId(ctx.params.id ?? "");
      if (!user) throw notFound("User");
      return deps.users.publicUser(user);
    },
    { operationId: "getUser", validate: validate("/api/v1/users/{id}", "get") },
  );

  app.patch(
    "/api/v1/users/:id",
    (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = ctx.body as {
        name?: string;
        role?: Role;
        productRoles?: Record<string, Role>;
        disabled?: boolean;
      };
      const target = deps.users.byId(ctx.params.id ?? "");
      if (!target) throw notFound("User");
      guardAdminChange(deps, admin, target, body);
      const updated = deps.users.update(target.id, {
        name: body.name,
        role: body.role,
        productRoles: body.productRoles ? readProductRoles(body.productRoles) : undefined,
        disabled: body.disabled,
      });
      deps.users.record("user.updated", {
        actor: admin,
        target: updated.email,
        ip: ctx.ip,
        detail: { role: updated.role, disabled: updated.disabled, productRoles: updated.productRoles },
      });
      return deps.users.publicUser(updated);
    },
    { operationId: "updateUser", validate: validate("/api/v1/users/{id}", "patch") },
  );

  app.delete(
    "/api/v1/users/:id",
    (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const target = deps.users.byId(ctx.params.id ?? "");
      if (!target) throw notFound("User");
      if (target.id === admin.id) throw badRequest("You cannot delete your own account.");
      deps.users.remove(target.id);
      deps.users.record("user.deleted", { actor: admin, target: target.email, ip: ctx.ip });
      ctx.noContent();
    },
    { operationId: "deleteUser", validate: validate("/api/v1/users/{id}", "delete") },
  );

  app.post(
    "/api/v1/users/:id/password",
    async (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const target = deps.users.byId(ctx.params.id ?? "");
      if (!target) throw notFound("User");
      const temporaryPassword = generatePassword();
      const updated = await deps.users.setPassword(target.id, temporaryPassword, { mustChange: true });
      deps.users.record("user.password.reset", { actor: admin, target: updated.email, ip: ctx.ip });
      return { user: deps.users.publicUser(updated), temporaryPassword };
    },
    { operationId: "resetUserPassword", validate: validate("/api/v1/users/{id}/password", "post") },
  );

  // ── products and content ──

  app.get(
    "/api/v1/products",
    (ctx) => {
      const user = requireViewer(ctx, deps);
      return page(deps.catalogue.list().map((p) => productSummary(productViewFor(deps, user, p))));
    },
    { operationId: "listProducts" },
  );

  app.get(
    "/api/v1/products/:slug",
    (ctx) => {
      const user = requireViewer(ctx, deps);
      return productSummary(productViewFor(deps, user, deps.catalogue.get(ctx.params.slug ?? "")));
    },
    { operationId: "getProduct", validate: validate("/api/v1/products/{slug}", "get") },
  );

  app.get(
    "/api/v1/products/:slug/content",
    (ctx) => {
      const user = requireViewer(ctx, deps);
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      return {
        slug: product.config.slug,
        sections: deps.catalogue.sections(product, surfacesOf(user, product.config.slug)),
      };
    },
    { operationId: "getProductContent", validate: validate("/api/v1/products/{slug}/content", "get") },
  );

  app.get(
    "/api/v1/products/:slug/content/:path*",
    (ctx) => {
      const user = requireViewer(ctx, deps);
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      const node = deps.catalogue.page(product, ctx.params.path ?? "");
      requireSurface(ctx, deps, user, product.config.slug, node.surface);
      const { raw } = deps.catalogue.readPage(product, node.path);
      const rendered = renderContent(product.config.slug, node.path, raw);
      deps.usage.pageViews++;
      return {
        slug: product.config.slug,
        path: node.path,
        title: rendered.title || node.title,
        section: node.section,
        surface: node.surface,
        html: rendered.html,
        raw,
        hasMermaid: rendered.hasMermaid,
        sourcePath: `${product.manifest?.repo ?? product.config.slug}/${node.path}`,
        headings: rendered.headings,
      };
    },
    {
      operationId: "getProductPage",
      validate: validate("/api/v1/products/{slug}/content/{path}", "get"),
    },
  );

  /**
   * Assets. Showcase stills and recordings are the product's public marketing material and are
   * served to anyone — the public product pages embed them. Everything else needs the surface that
   * governs the directory it lives in.
   */
  app.get(
    "/api/v1/products/:slug/assets/:path*",
    (ctx) => {
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      const path = normaliseRelative(ctx.params.path ?? "");
      const isShowcaseAsset = path.startsWith("showcase/out/");
      if (!isShowcaseAsset) {
        const user = requireViewer(ctx, deps);
        requireSurface(ctx, deps, user, product.config.slug, surfaceForContentPath(path));
      }
      const file = deps.catalogue.resolveFile(product, path);
      const type = contentTypeFor(file);
      if (!type.startsWith("image/") && !type.startsWith("video/"))
        throw forbidden("Only images and recordings are served from the asset route.");
      const stat = statSync(file);
      ctx.res.writeHead(200, {
        "Content-Type": type,
        "Content-Length": stat.size,
        "Cache-Control": "public, max-age=3600",
      });
      if (ctx.method === "HEAD") {
        ctx.res.end();
        return;
      }
      return new Promise<void>((resolveP, reject) => {
        createReadStream(file)
          .on("error", reject)
          .on("end", () => resolveP())
          .pipe(ctx.res);
      });
    },
    {
      operationId: "getProductAsset",
      validate: validate("/api/v1/products/{slug}/assets/{path}", "get"),
    },
  );

  // ── audit and operator endpoints ──

  app.get(
    "/api/v1/audit",
    (ctx) => {
      requireAdmin(ctx, deps);
      return page(
        deps.users.listAudit({
          limit: ctx.queryObj.limit as number | undefined,
          action: ctx.queryObj.action as string | undefined,
          actor: ctx.queryObj.actor as string | undefined,
        }),
      );
    },
    { operationId: "listAudit", validate: validate("/api/v1/audit", "get") },
  );

  app.get(
    "/api/v1/admin/health",
    (ctx) => {
      requireOperator(ctx, deps);
      return adminHealth(deps);
    },
    { operationId: "adminHealth" },
  );

  app.get(
    "/api/v1/admin/config",
    (ctx) => {
      requireOperator(ctx, deps);
      return {
        ...describeEnv(deps.env),
        showroom: {
          version: deps.version,
          publicUrl: deps.publicUrl,
          publicDemoLinks: deps.publicDemoLinks,
          contentRoot: deps.catalogue.contentRoot,
          products: deps.catalogue.list().map((p) => ({
            slug: p.config.slug,
            demoUrl: deps.catalogue.demoUrl(p),
            adminUrl: deps.catalogue.adminUrl(p),
            adminTokenEnv: deps.catalogue.adminTokenEnvName(p),
            adminTokenConfigured: Boolean(deps.catalogue.adminToken(p)),
          })),
        },
      };
    },
    { operationId: "adminConfig" },
  );

  app.get(
    "/api/v1/admin/usage",
    (ctx) => {
      requireOperator(ctx, deps);
      return { ...deps.usage, uptimeSec: (Date.now() - deps.usage.startedAt) / 1000 };
    },
    { operationId: "adminUsage" },
  );

  app.get(
    "/api/v1/admin/logs",
    (ctx) => {
      requireOperator(ctx, deps);
      return page(
        deps.log.recent({
          level: ctx.queryObj.level as "debug" | "info" | "warn" | "error" | undefined,
          contains: ctx.queryObj.contains as string | undefined,
          limit: (ctx.queryObj.limit as number | undefined) ?? 100,
        }) as Array<Record<string, unknown>>,
      );
    },
    { operationId: "adminLogs", validate: validate("/api/v1/admin/logs", "get") },
  );
}

export function adminHealth(deps: Deps): Record<string, unknown> {
  return {
    ok: true,
    version: deps.version,
    uptimeSec: (Date.now() - deps.usage.startedAt) / 1000,
    users: deps.users.users.size,
    invites: deps.users.invites.size,
    accessRequests: deps.requests.requests.size,
    products: deps.catalogue.list().map((p) => ({
      slug: p.config.slug,
      hasContent: p.hasContent,
      pages: p.pages.length,
      syncedAt: p.manifest?.syncedAt ?? null,
      commit: p.manifest?.commit ?? null,
    })),
    store: { dir: deps.catalogue.root },
  };
}

export function inviteUrl(deps: Deps, token: string): string {
  const base = deps.publicUrl.replace(/\/+$/, "");
  return `${base}/invite/${token}`;
}

/**
 * Refuse a change that would leave the deployment without a usable administrator, or that would
 * lock the person making it out of their own account. Shared by the API and the admin pages so the
 * two front doors cannot disagree.
 */
export function guardAdminChange(
  deps: Deps,
  admin: UserDoc,
  target: UserDoc,
  patch: { role?: Role; disabled?: boolean },
): void {
  if (target.id === admin.id && patch.disabled === true)
    throw badRequest("You cannot disable your own account.");
  const losingAdmin =
    target.role === "admin" && ((patch.role && patch.role !== "admin") || patch.disabled === true);
  if (losingAdmin && deps.users.adminCount() <= 1)
    throw new HttpError(409, "Conflict", "This is the last administrator; promote someone else first.");
}

/** Exposed for the HTML pages so they can reuse the API's content-path resolution. */
export { contentPathFor };
