/**
 * Integration + contract tests for `/api/v1`: the whole showroom booted in-process against a
 * temporary, non-persisted store, driven over real HTTP. Every success response is validated
 * against the schema the OpenAPI document declares for it, so the spec cannot drift from the code.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { openapi } from "../src/openapi.ts";
import { createShowroom, type Showroom } from "../src/server.ts";
import { Logger, readEnv, testing } from "../vendor/arag-platform/src/index.ts";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const ADMIN_EMAIL = "root@showroom.test";
const ADMIN_PASSWORD = "quarry-lantern-tide-88";
const ADMIN_CHOSEN = "meridian-tussock-gable-52";
const NEW_PASSWORD = "bramble-cinder-vault-41";

let showroom: Showroom;
let c: testing.TestClient;

/** Extract the session cookie from a Set-Cookie header so tests can act as a given user. */
function cookieOf(res: testing.TestResponse): string {
  const raw = res.headers.getSetCookie?.() ?? [];
  const found = raw.find((c) => c.startsWith("showroom_session="));
  assert.ok(found, "expected a session cookie");
  return found.split(";")[0] as string;
}

async function signIn(email: string, password: string): Promise<string> {
  const res = await c.post("/api/v1/auth/login", { email, password });
  assert.equal(res.status, 200, `sign-in failed for ${email}: ${res.text}`);
  return cookieOf(res);
}

/**
 * The administrator's session, established once: sign in with the bootstrap password, then choose a
 * real one (the API refuses everything else until they do). Repeating the sign-in would legitimately
 * trip the per-(ip, email) login throttle part-way through the suite — behaviour covered in the unit
 * tests rather than fought with here.
 */
let cachedAdmin = "";
async function adminSession(): Promise<string> {
  if (cachedAdmin) return cachedAdmin;
  const first = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const changed = await c.post(
    "/api/v1/auth/password",
    { currentPassword: ADMIN_PASSWORD, newPassword: ADMIN_CHOSEN },
    { cookie: first },
  );
  assert.equal(changed.status, 200, changed.text);
  cachedAdmin = cookieOf(changed);
  return cachedAdmin;
}

const as = (cookie: string) => ({ cookie });

/** Sign in with an issued password and immediately replace it, as a real person would have to. */
async function chooseOwnPassword(email: string, temporary: string, chosen: string): Promise<string> {
  const first = await signIn(email, temporary);
  const changed = await c.post(
    "/api/v1/auth/password",
    { currentPassword: temporary, newPassword: chosen },
    { cookie: first },
  );
  assert.equal(changed.status, 200, changed.text);
  return cookieOf(changed);
}

function check(path: string, method: string, status: number, body: unknown): void {
  assert.deepEqual(testing.checkResponse(openapi, path, method, status, body), [], `${method} ${path}`);
}

before(async () => {
  const env = readEnv({
    DATA_DIR: "/tmp/showroom-tests-never-written",
    RATE_LIMIT_RPS: "0",
    NODE_ENV: "test",
    ADMIN_TOKEN: "break-glass-operator-token",
    LOG_LEVEL: "error",
  });
  showroom = await createShowroom(env, {
    log: new Logger({ level: "error", write: () => undefined }),
    persist: false,
    root: ROOT,
    raw: {
      SHOWROOM_SESSION_SECRET: "integration-test-secret-integration",
      SHOWROOM_ADMIN_EMAIL: ADMIN_EMAIL,
      SHOWROOM_ADMIN_PASSWORD: ADMIN_PASSWORD,
      SHOWROOM_ADMIN_TOKEN_DOC_PROCESSING: "dp-product-admin-token",
      ADMIN_TOKEN: "break-glass-operator-token",
      PUBLIC_URL: "https://showroom.test",
    },
  });
  c = await testing.startTestServer(showroom.app);
});

after(async () => {
  await c.close();
  await showroom.close();
});

describe("contract", () => {
  test("the spec lints clean and documents every /api/v1 route", () => {
    assert.deepEqual(testing.lintSpec(openapi), []);
    assert.deepEqual(testing.missingFromSpec(showroom.app, openapi), []);
  });

  test("the spec is served with the showroom's cookie security scheme", async () => {
    const res = await c.get("/api/v1/openapi.json");
    assert.equal(res.status, 200);
    const doc = res.json as { components: { securitySchemes: Record<string, { in?: string }> } };
    assert.equal(doc.components.securitySchemes.SessionCookie?.in, "cookie");
  });

  test("Redoc and Swagger UI are served", async () => {
    assert.equal((await c.get("/api/v1/docs")).status, 200);
    assert.equal((await c.get("/api/v1/swagger")).status, 200);
  });

  test("health and branding need no session", async () => {
    assert.equal((await c.get("/healthz")).status, 200);
    const ready = await c.get("/readyz");
    assert.equal((ready.json as { products: number }).products >= 3, true);
    const branding = await c.get("/api/v1/branding");
    check("/api/v1/branding", "get", 200, branding.json);
    assert.equal((branding.json as { productName: string }).productName.length > 0, true);
  });
});

describe("authentication", () => {
  test("the bootstrap administrator exists and must change their password", async () => {
    const res = await c.post("/api/v1/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(res.status, 200);
    check("/api/v1/auth/login", "post", 200, res.json);
    const body = res.json as {
      user: { mustChangePassword: boolean };
      siteAdmin: boolean;
      products: unknown[];
    };
    assert.equal(body.user.mustChangePassword, true);
    assert.equal(body.siteAdmin, true);
    assert.equal(body.products.length >= 3, true);
    const cookie = res.headers.getSetCookie?.()[0] ?? "";
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });

  test("a wrong password is a 401 problem+json that does not reveal whether the account exists", async () => {
    const wrong = await c.post("/api/v1/auth/login", { email: ADMIN_EMAIL, password: "nope-nope-nope-1" });
    const unknown = await c.post("/api/v1/auth/login", {
      email: "ghost@showroom.test",
      password: "nope-nope-nope-1",
    });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal((wrong.json as { detail: string }).detail, (unknown.json as { detail: string }).detail);
    assert.match(wrong.headers.get("content-type") ?? "", /problem\+json/);
    check("/api/v1/auth/login", "post", 400, wrong.json);
  });

  test("the login body is validated against the spec", async () => {
    const res = await c.post("/api/v1/auth/login", { email: ADMIN_EMAIL });
    assert.equal(res.status, 400);
    assert.equal((res.json as { type: string }).type, "https://arag.dev/problems/validation");
    const extra = await c.post("/api/v1/auth/login", { email: "a@b.co", password: "x", role: "admin" });
    assert.equal(extra.status, 400, "additionalProperties must be rejected");
  });

  test("a temporary password may only be used to look at yourself and set a new one", async () => {
    const cookie = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    assert.equal((await c.get("/api/v1/auth/me", as(cookie))).status, 200);
    const blocked = await c.get("/api/v1/products", as(cookie));
    assert.equal(blocked.status, 403);
    assert.equal((blocked.json as { title: string }).title, "Password change required");
    assert.equal((await c.get("/api/v1/users", as(cookie))).status, 403);
    // Establish the real administrator session for the rest of the suite.
    await adminSession();
  });

  test("/auth/me requires a session and /auth/logout clears it", async () => {
    assert.equal((await c.get("/api/v1/auth/me")).status, 401);
    const cookie = await adminSession();
    const me = await c.get("/api/v1/auth/me", as(cookie));
    assert.equal(me.status, 200);
    check("/api/v1/auth/me", "get", 200, me.json);
    const out = await c.post("/api/v1/auth/logout", undefined, as(cookie));
    assert.equal(out.status, 204);
    assert.match(out.headers.getSetCookie?.()[0] ?? "", /Max-Age=0/);
    // Logging out does not invalidate the token itself, so the cached session stays usable.
  });

  test("a forged or foreign session cookie is ignored", async () => {
    for (const cookie of [
      "showroom_session=garbage",
      "showroom_session=eyJzdWIiOiJ4In0.deadbeef",
      "showroom_session=",
    ])
      assert.equal((await c.get("/api/v1/auth/me", as(cookie))).status, 401);
  });
});

describe("administration of users and invites", () => {
  let adminCookie = "";

  before(async () => {
    adminCookie = await adminSession();
  });

  test("only an administrator may list users, invites and the audit log", async () => {
    for (const path of ["/api/v1/users", "/api/v1/invites", "/api/v1/audit", "/api/v1/access-requests"]) {
      assert.equal((await c.get(path)).status, 401, `${path} leaked to an anonymous caller`);
    }
    const list = await c.get("/api/v1/users", as(adminCookie));
    assert.equal(list.status, 200);
    check("/api/v1/users", "get", 200, list.json);
  });

  test("creating a user returns a one-time temporary password and never a hash", async () => {
    const res = await c.post(
      "/api/v1/users",
      { email: "evaluator@showroom.test", name: "Eva", role: "evaluator" },
      as(adminCookie),
    );
    assert.equal(res.status, 201);
    check("/api/v1/users", "post", 201, res.json);
    const body = res.json as { user: { id: string }; temporaryPassword: string };
    assert.ok(body.temporaryPassword.length > 10);
    assert.equal(res.text.includes("passwordHash"), false);

    // The temporary password works once and then forces a change.
    const cookie = await signIn("evaluator@showroom.test", body.temporaryPassword);
    const me = await c.get("/api/v1/auth/me", as(cookie));
    assert.equal((me.json as { user: { mustChangePassword: boolean } }).user.mustChangePassword, true);
    assert.equal((await c.get("/api/v1/products", as(cookie))).status, 403);
  });

  test("a duplicate email is a 409", async () => {
    const res = await c.post(
      "/api/v1/users",
      { email: "evaluator@showroom.test", role: "viewer" },
      as(adminCookie),
    );
    assert.equal(res.status, 409);
  });

  test("an invitation is created once, looked up anonymously and accepted", async () => {
    const created = await c.post(
      "/api/v1/invites",
      {
        email: "partner@showroom.test",
        name: "Pat",
        role: "partner",
        productRoles: { "call-analysis": "operator" },
        expiresInDays: 3,
      },
      as(adminCookie),
    );
    assert.equal(created.status, 201);
    check("/api/v1/invites", "post", 201, created.json);
    const invite = created.json as { inviteUrl: string; status: string };
    assert.equal(invite.status, "pending");
    assert.match(invite.inviteUrl, /^https:\/\/showroom\.test\/invite\//);
    const token = invite.inviteUrl.split("/invite/")[1] as string;

    // Anyone holding the link can see who it is for — but not the token, and not other invites.
    const offer = await c.get(`/api/v1/invites/${token}`);
    assert.equal(offer.status, 200);
    check("/api/v1/invites/{token}", "get", 200, offer.json);
    assert.equal((offer.json as { email: string }).email, "partner@showroom.test");

    const accepted = await c.post(`/api/v1/invites/${token}/accept`, { password: NEW_PASSWORD }, {});
    assert.equal(accepted.status, 201);
    check("/api/v1/invites/{token}/accept", "post", 201, accepted.json);
    const session = accepted.json as { user: { role: string; productRoles: Record<string, string> } };
    assert.equal(session.user.role, "partner");
    assert.equal(session.user.productRoles["call-analysis"], "operator");

    // Single use.
    assert.equal((await c.post(`/api/v1/invites/${token}/accept`, { password: NEW_PASSWORD })).status, 409);
    assert.equal((await c.get(`/api/v1/invites/${token}`)).status, 409);
  });

  test("an unknown invite token is a 404 and a short one fails validation", async () => {
    assert.equal((await c.get("/api/v1/invites/aaaaaaaaaaaaaaaaaaaa")).status, 404);
    assert.equal((await c.get("/api/v1/invites/short")).status, 400);
  });

  test("an invitation can be revoked and then no longer opens", async () => {
    const created = await c.post(
      "/api/v1/invites",
      { email: "revoked@showroom.test", role: "viewer" },
      as(adminCookie),
    );
    const body = created.json as { id: string; inviteUrl: string };
    const token = body.inviteUrl.split("/invite/")[1] as string;
    const revoked = await c.post(`/api/v1/invites/${body.id}/revoke`, undefined, as(adminCookie));
    assert.equal(revoked.status, 200);
    check("/api/v1/invites/{id}/revoke", "post", 200, revoked.json);
    assert.equal((revoked.json as { status: string }).status, "revoked");
    assert.equal((await c.get(`/api/v1/invites/${token}`)).status, 409);
  });

  test("the last administrator cannot be demoted, disabled or deleted", async () => {
    const admin = showroom.users.byEmail(ADMIN_EMAIL);
    assert.ok(admin);
    const demote = await c.request("PATCH", `/api/v1/users/${admin.id}`, {
      json: { role: "viewer" },
      headers: as(adminCookie),
    });
    assert.equal(demote.status, 409);
    const disable = await c.request("PATCH", `/api/v1/users/${admin.id}`, {
      json: { disabled: true },
      headers: as(adminCookie),
    });
    assert.equal(disable.status, 400, "an administrator must not disable their own account");
    assert.equal(
      (await c.request("DELETE", `/api/v1/users/${admin.id}`, { headers: as(adminCookie) })).status,
      400,
    );
  });

  test("a role change invalidates the affected user's existing sessions", async () => {
    const created = await c.post(
      "/api/v1/users",
      { email: "churn@showroom.test", role: "viewer" },
      as(adminCookie),
    );
    const { user, temporaryPassword } = created.json as { user: { id: string }; temporaryPassword: string };
    const cookie = await chooseOwnPassword(
      "churn@showroom.test",
      temporaryPassword,
      "ridge-vellum-hollow-70",
    );
    assert.equal((await c.get("/api/v1/auth/me", as(cookie))).status, 200);
    const patched = await c.request("PATCH", `/api/v1/users/${user.id}`, {
      json: { role: "operator" },
      headers: as(adminCookie),
    });
    assert.equal(patched.status, 200);
    check("/api/v1/users/{id}", "patch", 200, patched.json);
    assert.equal((await c.get("/api/v1/auth/me", as(cookie))).status, 401);
  });

  test("the audit log records sign-ins and administrative actions", async () => {
    const res = await c.get("/api/v1/audit?limit=200", as(adminCookie));
    assert.equal(res.status, 200);
    check("/api/v1/audit", "get", 200, res.json);
    const actions = new Set((res.json as { items: Array<{ action: string }> }).items.map((i) => i.action));
    for (const expected of [
      "auth.login",
      "auth.login.failed",
      "user.created",
      "invite.created",
      "invite.accepted",
    ])
      assert.ok(actions.has(expected), `missing audit action ${expected}`);
    const filtered = await c.get("/api/v1/audit?action=auth.login", as(adminCookie));
    assert.ok(
      (filtered.json as { items: Array<{ action: string }> }).items.every((i) => i.action === "auth.login"),
    );
  });
});

describe("role-based access to products and content", () => {
  const cookies: Record<string, string> = {};

  before(async () => {
    const adminCookie = await adminSession();
    for (const [name, role] of [
      ["viewer", "viewer"],
      ["operator", "operator"],
    ] as const) {
      const created = await c.post(
        "/api/v1/users",
        { email: `${name}@showroom.test`, role },
        as(adminCookie),
      );
      const { temporaryPassword } = created.json as { temporaryPassword: string };
      cookies[name] = await chooseOwnPassword(
        `${name}@showroom.test`,
        temporaryPassword,
        `vellum-ridge-${name.length}-havoc-70`,
      );
    }
    cookies.admin = adminCookie;
    cookies.partner = await signIn("partner@showroom.test", NEW_PASSWORD);
    assert.ok(cookies.partner);
  });

  test("the catalogue is filtered per user and matches the spec", async () => {
    const res = await c.get("/api/v1/products", as(cookies.viewer as string));
    assert.equal(res.status, 200);
    check("/api/v1/products", "get", 200, res.json);
    const items = (res.json as { items: Array<Record<string, unknown>> }).items;
    assert.equal(items.length >= 3, true);
    for (const item of items) {
      assert.deepEqual(item.surfaces, ["marketing", "docs", "showcase"]);
      assert.equal(item.demoUrl, null, "a viewer must not be given the demo URL");
      assert.equal(item.adminUrl, null);
      assert.equal(item.adminToken, null);
    }
  });

  test("an operator sees the demo URL, the admin URL and the product admin token", async () => {
    const res = await c.get("/api/v1/products/doc-processing", as(cookies.operator as string));
    check("/api/v1/products/{slug}", "get", 200, res.json);
    const product = res.json as Record<string, unknown>;
    assert.equal(product.demoUrl, "https://arag-doc-processing.fly.dev");
    assert.match(String(product.adminUrl), /\/admin/);
    assert.equal(product.adminToken, "dp-product-admin-token");
  });

  test("the product admin token is never sent to anyone below operator", async () => {
    for (const who of ["viewer", "partner"] as const) {
      const res = await c.get("/api/v1/products/doc-processing", as(cookies[who] as string));
      assert.equal((res.json as { adminToken: unknown }).adminToken, null, `${who} received the admin token`);
      assert.equal(res.text.includes("dp-product-admin-token"), false);
    }
  });

  test("per-product roles grant access to that product only", async () => {
    // `partner@showroom.test` is a global partner with an operator role on call-analysis.
    const calls = await c.get("/api/v1/products/call-analysis", as(cookies.partner as string));
    const docs = await c.get("/api/v1/products/doc-processing", as(cookies.partner as string));
    assert.equal((calls.json as { adminToken: unknown; adminUrl: unknown }).adminUrl !== null, true);
    assert.equal((docs.json as { adminUrl: unknown }).adminUrl, null);
    assert.ok((calls.json as { surfaces: string[] }).surfaces.includes("admin"));
    assert.ok(!(docs.json as { surfaces: string[] }).surfaces.includes("admin"));
    // The partner role still carries the partner surfaces everywhere.
    assert.ok((docs.json as { surfaces: string[] }).surfaces.includes("partner-pitch"));
  });

  test("the content tree hides surfaces the caller does not hold", async () => {
    const res = await c.get("/api/v1/products/doc-processing/content", as(cookies.viewer as string));
    assert.equal(res.status, 200);
    check("/api/v1/products/{slug}/content", "get", 200, res.json);
    const paths = (res.json as { sections: Array<{ items: Array<{ path: string }> }> }).sections.flatMap(
      (s) => s.items.map((i) => i.path),
    );
    assert.ok(paths.some((p) => p.startsWith("docs/business/")));
    assert.equal(
      paths.some((p) => p.startsWith("enablement/")),
      false,
    );
    assert.equal(
      paths.some((p) => p.includes("partner-pitch")),
      false,
    );
  });

  test("a viewer is refused enablement, solutions and the partner pitch", async () => {
    for (const path of [
      "enablement/developer-track/LAB.md",
      "enablement/developer-track/solutions/01-drive-the-api.md",
      "docs/product-marketing/partner-pitch.md",
    ]) {
      const res = await c.get(
        `/api/v1/products/doc-processing/content/${path}`,
        as(cookies.viewer as string),
      );
      assert.equal(res.status, 403, `viewer reached ${path}`);
      assert.match((res.json as { detail: string }).detail, /role does not include/);
    }
  });

  test("an evaluator-level role reaches the labs but not the worked solutions", async () => {
    const operator = as(cookies.operator as string);
    assert.equal(
      (await c.get("/api/v1/products/doc-processing/content/enablement/developer-track/LAB.md", operator))
        .status,
      200,
    );
    assert.equal(
      (
        await c.get(
          "/api/v1/products/doc-processing/content/enablement/developer-track/solutions/01-drive-the-api.md",
          operator,
        )
      ).status,
      403,
    );
  });

  test("a partner reaches the worked solutions and the partner pitch", async () => {
    const partner = as(cookies.partner as string);
    assert.equal(
      (
        await c.get(
          "/api/v1/products/doc-processing/content/enablement/developer-track/solutions/01-drive-the-api.md",
          partner,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await c.get(
          "/api/v1/products/doc-processing/content/docs/product-marketing/partner-pitch.md",
          partner,
        )
      ).status,
      200,
    );
  });

  test("a rendered page is sanitised HTML with rewritten links and a source path", async () => {
    const res = await c.get(
      "/api/v1/products/doc-processing/content/docs/architecture/architecture.md",
      as(cookies.admin as string),
    );
    assert.equal(res.status, 200);
    check("/api/v1/products/{slug}/content/{path}", "get", 200, res.json);
    const page = res.json as { html: string; hasMermaid: boolean; sourcePath: string; headings: unknown[] };
    assert.equal(page.hasMermaid, true);
    assert.match(page.html, /<pre class="mermaid">/);
    assert.equal(page.sourcePath, "arag-doc-processing/docs/architecture/architecture.md");
    assert.ok(page.headings.length > 0);
    // Relative markdown links are rewritten into showroom routes.
    assert.match(page.html, /href="\/p\/doc-processing\/(docs|enablement)\//);
  });

  test("content paths cannot escape the product directory", async () => {
    const admin = as(cookies.admin as string);
    for (const path of [
      "../call-analysis/README.md",
      "..%2f..%2fpackage.json",
      "docs/../../../package.json",
      "%2e%2e/%2e%2e/package.json",
    ]) {
      const res = await c.get(`/api/v1/products/doc-processing/content/${path}`, admin);
      assert.ok(res.status === 400 || res.status === 404, `${path} returned ${res.status}`);
      assert.equal(res.text.includes("devDependencies"), false);
    }
  });

  test("an unknown product or page is a 404", async () => {
    const admin = as(cookies.admin as string);
    assert.equal((await c.get("/api/v1/products/nope", admin)).status, 404);
    assert.equal((await c.get("/api/v1/products/doc-processing/content/docs/nope.md", admin)).status, 404);
  });
});

describe("assets", () => {
  test("showcase stills and recordings are public, because the public product pages embed them", async () => {
    const png = await c.get("/api/v1/products/doc-processing/assets/showcase/out/01-home.png");
    assert.equal(png.status, 200);
    assert.equal(png.headers.get("content-type"), "image/png");
  });

  test("anything outside showcase/out needs a session and the right surface", async () => {
    const res = await c.get("/api/v1/products/doc-processing/assets/docs/architecture/architecture.md");
    assert.equal(res.status, 401);
  });

  test("asset paths cannot escape the content root", async () => {
    for (const path of ["../../package.json", "showcase/out/../../../package.json"]) {
      const res = await c.get(`/api/v1/products/doc-processing/assets/${path}`);
      assert.ok(res.status >= 400, `${path} returned ${res.status}`);
    }
  });
});

describe("access requests", () => {
  test("anyone may submit one, and it is validated", async () => {
    const res = await c.post("/api/v1/access-requests", {
      name: "Ada Partner",
      email: "ada@partner.example",
      organisation: "Partner Ltd",
      partnerType: "isv",
      aragAccount: "no",
      products: ["call-analysis", "not-a-product"],
      message: "We build claims software.",
    });
    assert.equal(res.status, 201);
    check("/api/v1/access-requests", "post", 201, res.json);
    assert.equal((await c.post("/api/v1/access-requests", { name: "", email: "x" })).status, 400);
    assert.equal((await c.post("/api/v1/access-requests", { name: "A", email: "not-an-email" })).status, 400);
  });

  test("only an administrator can read them, and unknown product slugs are dropped", async () => {
    assert.equal((await c.get("/api/v1/access-requests")).status, 401);
    const adminCookie = await adminSession();
    const res = await c.get("/api/v1/access-requests?status=new", as(adminCookie));
    assert.equal(res.status, 200);
    check("/api/v1/access-requests", "get", 200, res.json);
    const items = (res.json as { items: Array<Record<string, unknown>> }).items;
    const ada = items.find((i) => i.email === "ada@partner.example");
    assert.ok(ada);
    assert.deepEqual(ada.products, ["call-analysis"]);
    assert.equal(ada.partnerType, "isv");
    assert.equal(ada.aragAccount, "no");
  });

  test("an administrator resolves a request, and creating an invite marks it invited", async () => {
    const adminCookie = await adminSession();
    await c.post("/api/v1/access-requests", { name: "Bo", email: "bo@partner.example" });
    const before = await c.get("/api/v1/access-requests?status=new", as(adminCookie));
    const bo = (before.json as { items: Array<{ id: string; email: string }> }).items.find(
      (i) => i.email === "bo@partner.example",
    );
    assert.ok(bo);
    const resolved = await c.post(
      `/api/v1/access-requests/${bo.id}/resolve`,
      { status: "dismissed" },
      as(adminCookie),
    );
    assert.equal(resolved.status, 200);
    check("/api/v1/access-requests/{id}/resolve", "post", 200, resolved.json);
    assert.equal((resolved.json as { status: string }).status, "dismissed");

    await c.post("/api/v1/invites", { email: "ada@partner.example", role: "partner" }, as(adminCookie));
    const after = await c.get("/api/v1/access-requests", as(adminCookie));
    const ada = (after.json as { items: Array<{ email: string; status: string }> }).items.find(
      (i) => i.email === "ada@partner.example",
    );
    assert.equal(ada?.status, "invited");
  });
});

describe("operator endpoints", () => {
  test("health, config, usage and logs require an administrator", async () => {
    for (const path of ["health", "config", "usage", "logs"])
      assert.equal((await c.get(`/api/v1/admin/${path}`)).status, 401, path);
  });

  test("an administrator session reads them, and the config redacts secrets", async () => {
    const cookie = as(await adminSession());
    const health = await c.get("/api/v1/admin/health", cookie);
    check("/api/v1/admin/health", "get", 200, health.json);
    assert.equal((health.json as { ok: boolean }).ok, true);

    const config = await c.get("/api/v1/admin/config", cookie);
    check("/api/v1/admin/config", "get", 200, config.json);
    assert.equal(config.text.includes("break-glass-operator-token"), false, "ADMIN_TOKEN leaked");
    assert.equal(config.text.includes("dp-product-admin-token"), false, "a product token leaked");
    assert.match(config.text, /adminTokenConfigured/);

    const usage = await c.get("/api/v1/admin/usage", cookie);
    check("/api/v1/admin/usage", "get", 200, usage.json);
    assert.ok((usage.json as { requests: number }).requests > 0);

    const logs = await c.get("/api/v1/admin/logs?limit=10", cookie);
    check("/api/v1/admin/logs", "get", 200, logs.json);
  });

  test("the platform ADMIN_TOKEN is a break-glass operator credential, and its use is audited", async () => {
    const res = await c.get("/api/v1/admin/health", { authorization: "Bearer break-glass-operator-token" });
    assert.equal(res.status, 200);
    const cookie = as(await adminSession());
    const audit = await c.get("/api/v1/audit?action=admin.token.used", cookie);
    assert.ok((audit.json as { items: unknown[] }).items.length > 0);
  });

  test("the break-glass token does not unlock user administration", async () => {
    const headers = { authorization: "Bearer break-glass-operator-token" };
    assert.equal((await c.get("/api/v1/users", headers)).status, 401);
    assert.equal((await c.get("/api/v1/invites", headers)).status, 401);
    assert.equal((await c.get("/api/v1/audit", headers)).status, 401);
  });
});

describe("self-service password change", () => {
  test("a user changes their own password and their old session stops working", async () => {
    const adminCookie = await adminSession();
    const created = await c.post(
      "/api/v1/users",
      { email: "rotate@showroom.test", role: "viewer" },
      as(adminCookie),
    );
    const { temporaryPassword } = created.json as { temporaryPassword: string };
    const first = await signIn("rotate@showroom.test", temporaryPassword);
    const second = await signIn("rotate@showroom.test", temporaryPassword);

    const changed = await c.post(
      "/api/v1/auth/password",
      { currentPassword: temporaryPassword, newPassword: "harbour-ledger-quartz-27" },
      as(first),
    );
    assert.equal(changed.status, 200, changed.text);
    assert.equal(changed.status, 200);
    check("/api/v1/auth/password", "post", 200, changed.json);
    assert.equal((changed.json as { user: { mustChangePassword: boolean } }).user.mustChangePassword, false);
    // The other session is gone; the caller's own session was re-issued.
    assert.equal((await c.get("/api/v1/auth/me", as(second))).status, 401);
    assert.equal((await c.get("/api/v1/auth/me", as(cookieOf(changed)))).status, 200);
  });

  test("the wrong current password, a weak new one, or no session are all refused", async () => {
    const cookie = as(await adminSession());
    assert.equal(
      (
        await c.post(
          "/api/v1/auth/password",
          { currentPassword: "wrong-one-here", newPassword: "harbour-ledger-quartz-27" },
          cookie,
        )
      ).status,
      401,
    );
    assert.equal(
      (await c.post("/api/v1/auth/password", { currentPassword: ADMIN_CHOSEN, newPassword: "short" }, cookie))
        .status,
      400,
    );
    assert.equal(
      (
        await c.post("/api/v1/auth/password", {
          currentPassword: "x",
          newPassword: "harbour-ledger-quartz-27",
        })
      ).status,
      401,
    );
  });
});
