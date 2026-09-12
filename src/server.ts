/**
 * App wiring for the ARAG Showroom.
 *
 * Unlike the other products on this platform the showroom talks to no Knowledge Box: it serves a
 * committed snapshot of the three product repositories plus its own user directory. That is why
 * there is no ARAG client here and why `make dev` needs no credentials at all.
 *
 * Exported as a factory so the tests can boot the whole thing in-process against a temporary data
 * directory.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  App,
  type Branding,
  cors,
  log as defaultLog,
  healthRoutes,
  type Logger,
  type PlatformEnv,
  readBranding,
  Store,
  securityHeaders,
} from "../vendor/arag-platform/src/index.ts";
import { openapi, VERSION } from "./openapi.ts";
import { registerApiRoutes } from "./routes/api.ts";
import { registerPageRoutes } from "./routes/pages.ts";
import type { Deps, Usage } from "./routes/support.ts";
import { AccessRequestsService } from "./services/access-requests.ts";
import { Catalogue } from "./services/catalogue.ts";
import { UsersService } from "./services/users.ts";

export interface Showroom {
  name: string;
  version: string;
  app: App;
  store: Store;
  users: UsersService;
  requests: AccessRequestsService;
  catalogue: Catalogue;
  usage: Usage;
  branding: Branding;
  close(): Promise<void>;
}

const HERE = resolve(import.meta.dirname ?? ".", "..");

export interface CreateOptions {
  log?: Logger;
  persist?: boolean;
  /** Repo root, so tests can point the catalogue at a fixture tree. */
  root?: string;
  /** Raw environment, for the showroom-specific variables the platform env does not model. */
  raw?: Record<string, string | undefined>;
}

export async function createShowroom(env: PlatformEnv, opts: CreateOptions = {}): Promise<Showroom> {
  const log = opts.log ?? defaultLog;
  const raw = opts.raw ?? process.env;
  const root = opts.root ?? HERE;
  const usage: Usage = {
    startedAt: Date.now(),
    requests: 0,
    pageViews: 0,
    logins: 0,
    failedLogins: 0,
    deniedRequests: 0,
  };

  const store = new Store(env.dataDir, { persist: opts.persist ?? true });
  const sessionSecret = resolveSessionSecret(raw, env, log);
  const users = new UsersService({ store, sessionSecret });
  const requests = new AccessRequestsService(store);
  const catalogue = new Catalogue({ root, env: raw });

  const publicUrl = (raw.PUBLIC_URL || env.publicUrl || `http://localhost:${env.port}`).replace(/\/+$/, "");
  // White-label branding (BRAND_* env): the portal itself is rebrandable per deployment, exactly
  // like the accelerators it presents.
  const branding = readBranding(raw, {
    productName: "Progress Agentic RAG Partner Accelerators",
    tagline: "Open-source reference products for the Progress Agentic RAG partner network.",
    docsUrl: "/api/v1/docs",
  });
  const deps: Deps = {
    users,
    requests,
    catalogue,
    env,
    log,
    usage,
    version: VERSION,
    publicDemoLinks: isTruthy(raw.SHOWROOM_PUBLIC_DEMO_LINKS),
    publicUrl,
    branding,
    launchDir: raw.SHOWROOM_LAUNCH_DIR ? resolve(raw.SHOWROOM_LAUNCH_DIR) : resolve(root, "public/launch"),
  };

  // First administrator, created only when the user store is empty. A rejected email or password is
  // an operator mistake, not a crash: say exactly what is wrong and carry on without a user, so the
  // service still answers /healthz and the public site while it is corrected.
  let bootstrapped = null;
  try {
    bootstrapped = await users.bootstrap(raw.SHOWROOM_ADMIN_EMAIL ?? "", raw.SHOWROOM_ADMIN_PASSWORD ?? "");
  } catch (err) {
    log.error("showroom.bootstrap.rejected", {
      reason: err instanceof Error ? err.message : String(err),
      hint: "Fix SHOWROOM_ADMIN_EMAIL / SHOWROOM_ADMIN_PASSWORD and restart. No administrator was created.",
    });
  }
  if (bootstrapped) log.warn("showroom.bootstrap", { email: bootstrapped.email, mustChangePassword: true });
  else if (users.count === 0)
    log.warn("showroom.no-users", {
      hint: "Set SHOWROOM_ADMIN_EMAIL and SHOWROOM_ADMIN_PASSWORD to create the first administrator.",
    });

  const app = new App({ env, log, sessionSecret });
  // A complete policy rather than the platform's option bag: `securityHeaders()` always includes
  // 'unsafe-inline' in script-src, and the showroom has no inline script at all, so keeping it would
  // throw away CSP's value as a backstop behind the markdown sanitiser. Mermaid is the only external
  // script; Google Fonts is the only external stylesheet.
  app.use(
    securityHeaders({
      csp: [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "frame-ancestors 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; "),
    }),
    cors(),
  );
  app.use(async (_ctx, next) => {
    usage.requests++;
    await next();
  });

  healthRoutes(app, () => ({
    version: VERSION,
    products: catalogue.list().length,
    users: users.count,
  }));
  app.docs("/api/v1", openapi);
  app.get("/api/v1/branding", () => branding, { operationId: "getBranding", noRateLimit: true });
  // Optional partner logo dropped into the data volume, referenced by BRAND_LOGO_URL=/branding/logo.svg.
  app.static("/branding", resolve(env.dataDir, "branding"), { cache: "public, max-age=300" });

  registerApiRoutes(app, deps);
  registerPageRoutes(app, deps);

  // Static assets only: the pages themselves are rendered by the routes above.
  app.static("/ui", resolve(root, "vendor/arag-platform/ui"), { cache: "public, max-age=300" });
  app.static("/assets", resolve(root, "public"), { cache: "public, max-age=300" });

  return {
    name: "arag-showroom",
    version: VERSION,
    app,
    store,
    users,
    requests,
    catalogue,
    usage,
    branding,
    async close() {
      store.flushAll();
      await app.close();
    },
  };
}

/**
 * The session secret signs every showroom cookie, so three things have to hold.
 *
 * It must survive a restart — a random per-boot secret would sign everyone out on each deploy — so
 * SHOWROOM_SESSION_SECRET is the supported setting and production refuses to start without it.
 *
 * It must never be the platform ADMIN_TOKEN. ADMIN_TOKEN is a break-glass operator credential that
 * only opens `/api/v1/admin/*`; if it also signed sessions, anyone holding it could mint a cookie
 * for any user id and become a site administrator, defeating the whole point of keeping the two
 * apart. So we do not fall back to it, and we refuse to start if the two are set to the same value.
 *
 * Outside production, when nothing is configured, we persist a random secret under DATA_DIR so a
 * developer's session survives `--watch` restarts without any setup.
 */
function resolveSessionSecret(
  raw: Record<string, string | undefined>,
  env: PlatformEnv,
  log: Logger,
): string {
  const configured = raw.SHOWROOM_SESSION_SECRET ?? "";
  if (configured) {
    if (configured.length < 16)
      throw new Error("SHOWROOM_SESSION_SECRET must be at least 16 characters (openssl rand -hex 32).");
    if (env.adminToken && configured === env.adminToken)
      throw new Error(
        "SHOWROOM_SESSION_SECRET must not equal ADMIN_TOKEN: the break-glass operator token would then be able to forge administrator sessions.",
      );
    return configured;
  }
  if (env.nodeEnv === "production")
    throw new Error(
      "SHOWROOM_SESSION_SECRET must be set in production (generate: openssl rand -hex 32). It is deliberately not derived from ADMIN_TOKEN.",
    );
  return developmentSecret(env, log);
}

/** A random secret cached in DATA_DIR, so local restarts do not sign the developer out. */
function developmentSecret(env: PlatformEnv, log: Logger): string {
  const file = join(env.dataDir, ".session-secret");
  try {
    if (existsSync(file)) {
      const existing = readFileSync(file, "utf8").trim();
      if (existing.length >= 16) return existing;
    }
    const generated = randomBytes(32).toString("hex");
    mkdirSync(env.dataDir, { recursive: true });
    writeFileSync(file, `${generated}\n`, { mode: 0o600 });
    log.warn("showroom.generated-session-secret", {
      file,
      hint: "Development only. Set SHOWROOM_SESSION_SECRET before deploying.",
    });
    return generated;
  } catch {
    log.warn("showroom.ephemeral-session-secret", {
      hint: "Could not persist a development secret; sessions will not survive a restart.",
    });
    return randomBytes(32).toString("hex");
  }
}

function isTruthy(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}
