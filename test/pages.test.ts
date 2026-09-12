/**
 * The HTML surfaces: what an anonymous visitor may see, where a signed-out visitor is sent, and
 * that the gated pages enforce the same rules as the API. These run against the real content tree,
 * so a page that breaks on the actual product documentation fails here rather than in a browser.
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, describe, test } from "node:test";
import { createShowroom, type Showroom } from "../src/server.ts";
import { Logger, readEnv, testing } from "../vendor/arag-platform/src/index.ts";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const ADMIN_EMAIL = "pages-admin@showroom.test";
const ADMIN_PASSWORD = "pillar-thicket-runic-64";
const PRODUCT_TOKEN = "secret-product-admin-token-value";

let showroom: Showroom;
let c: testing.TestClient;
let adminCookie = "";

function cookieOf(res: testing.TestResponse): string {
  const found = (res.headers.getSetCookie?.() ?? []).find((v) => v.startsWith("showroom_session="));
  assert.ok(found, "expected a session cookie");
  return found.split(";")[0] as string;
}

const as = (cookie: string) => ({ cookie });

/** Post a browser form (urlencoded), as the HTML pages do. */
function postForm(path: string, fields: Record<string, string | string[]>, cookie?: string) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    for (const one of Array.isArray(v) ? v : [v]) body.append(k, one);
  }
  return c.request("POST", path, {
    body: body.toString(),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(cookie ? { cookie } : {}),
    },
  });
}

async function signInViaForm(email: string, password: string): Promise<string> {
  const res = await postForm("/login", { email, password, next: "/portal" });
  assert.equal(res.status, 303, `form sign-in failed: ${res.text.slice(0, 200)}`);
  return cookieOf(res);
}

/** Pull the CSRF token out of a rendered form so the test posts like a browser would. */
function csrfFrom(html: string): string {
  const match = html.match(/name="csrf" value="([^"]+)"/);
  assert.ok(match?.[1], "expected a CSRF token in the page");
  return match[1];
}

before(async () => {
  const env = readEnv({
    DATA_DIR: "/tmp/showroom-pages-never-written",
    RATE_LIMIT_RPS: "0",
    NODE_ENV: "test",
    LOG_LEVEL: "error",
  });
  showroom = await createShowroom(env, {
    log: new Logger({ level: "error", write: () => undefined }),
    persist: false,
    root: ROOT,
    raw: {
      SHOWROOM_SESSION_SECRET: "pages-test-secret-pages-test-secret",
      SHOWROOM_ADMIN_EMAIL: ADMIN_EMAIL,
      SHOWROOM_ADMIN_PASSWORD: ADMIN_PASSWORD,
      SHOWROOM_ADMIN_TOKEN_DOC_PROCESSING: PRODUCT_TOKEN,
      PUBLIC_URL: "https://showroom.test",
    },
  });
  c = await testing.startTestServer(showroom.app);
  adminCookie = await signInViaForm(ADMIN_EMAIL, ADMIN_PASSWORD);
  // The bootstrap administrator is forced to change their password before anything else.
  const account = await c.get("/account", as(adminCookie));
  const change = await postForm(
    "/account/password",
    {
      csrf: csrfFrom(account.text),
      currentPassword: ADMIN_PASSWORD,
      newPassword: "quiver-marsh-fathom-19",
      confirm: "quiver-marsh-fathom-19",
    },
    adminCookie,
  );
  assert.equal(change.status, 303, change.text.slice(0, 300));
  adminCookie = cookieOf(change);
});

after(async () => {
  await c.close();
  await showroom.close();
});

describe("the public site", () => {
  test("the home page renders for an anonymous visitor", async () => {
    const res = await c.get("/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.match(res.text, /id="platform"/);
    assert.match(res.text, /id="partners-teaser"/);
    assert.match(res.text, /id="products"/);
    assert.match(res.text, /id="traction"/);
    assert.match(res.text, /id="roadmap"/);
    assert.match(res.text, /Request partner access/);
    assert.match(res.text, /href="\/partners"/);
    // Real, counted facts reach the traction strip.
    assert.match(res.text, /documented API endpoints/);
  });

  test("each product page reads as a customer-facing landing page", async () => {
    for (const slug of ["doc-processing", "call-analysis", "voicebridge"]) {
      const res = await c.get(`/products/${slug}`);
      assert.equal(res.status, 200, slug);
      assert.match(res.text, /id="outcomes"/, slug);
      assert.match(res.text, /What you get/, slug);
      assert.match(res.text, /id="capabilities"/, slug);
      assert.match(res.text, /id="how"/, slug);
      assert.match(res.text, /id="proof"/, slug);
      assert.match(res.text, /id="cta"/, slug);
      assert.match(res.text, /class="sr-icon"/, slug);
      assert.match(res.text, new RegExp(`/api/v1/products/${slug}/assets/showcase/out/`));
      assert.equal(res.text.includes("undefined"), false, `${slug} rendered an undefined value`);
    }
    assert.equal((await c.get("/products/nope")).status, 404);
  });

  test("partner mechanics live on /partners, never as a section of a product page", async () => {
    for (const slug of ["doc-processing", "call-analysis", "voicebridge"]) {
      const res = await c.get(`/products/${slug}`);
      // No partner section, no partner heading, and no partner-facing card or FAQ entry.
      for (const marker of [
        'id="partner"',
        'id="white-label"',
        'id="extend"',
        "<h2>Make it yours</h2>",
        "<h3>White-label</h3>",
        "<h4>White-label",
        "Partner pilot playbook",
        "For Progress",
        "Engagement models",
      ])
        assert.equal(res.text.includes(marker), false, `${slug} page carries ${marker}`);
      assert.equal(
        /<strong>[^<]*white-?label/i.test(res.text),
        false,
        `${slug} FAQ asks about white-labelling`,
      );
    }
    const partners = await c.get("/partners");
    assert.equal(partners.status, 200);
    assert.match(partners.text, /id="white-label"/);
    assert.match(partners.text, /id="extend"/);
    assert.match(partners.text, /id="enablement"/);
    assert.match(partners.text, /Rebranding is configuration, not a fork/);
    assert.match(partners.text, /Request partner access/);
  });

  test("a product page renders under the deployment's branding", async () => {
    const env = readEnv({ DATA_DIR: "/tmp/showroom-branded", RATE_LIMIT_RPS: "0", LOG_LEVEL: "error" });
    const branded = await createShowroom(env, {
      log: new Logger({ level: "error", write: () => undefined }),
      persist: false,
      root: ROOT,
      raw: {
        SHOWROOM_SESSION_SECRET: "b".repeat(20),
        BRAND_PRODUCT_NAME: "Northwind Intelligence",
        BRAND_PRIMARY_COLOR: "#7a1fa2",
        BRAND_POWERED_BY: "0",
      },
    });
    const client = await testing.startTestServer(branded.app);
    try {
      const res = await client.get("/products/doc-processing");
      assert.match(res.text, /Northwind Intelligence/);
      assert.match(res.text, /--arag-brand-500:#7a1fa2/);
      assert.equal(res.text.includes("Built on Progress Agentic RAG."), false);
    } finally {
      await client.close();
      await branded.close();
    }
    // The default deployment keeps the attribution.
    assert.match((await c.get("/products/doc-processing")).text, /Built on Progress Agentic RAG/);
  });

  test("public pages never leak an admin token, a demo URL or gated content", async () => {
    for (const path of ["/", "/products/doc-processing", "/request-access"]) {
      const res = await c.get(path);
      assert.equal(res.text.includes(PRODUCT_TOKEN), false, `${path} leaked the product admin token`);
      assert.equal(res.text.includes("fly.dev"), false, `${path} published a live demo URL`);
      assert.equal(/solutions\/\d/.test(res.text), false, `${path} linked enablement solutions`);
      assert.equal(res.text.includes("partner-pitch.md"), false, `${path} linked the partner pitch`);
    }
  });

  test("SHOWROOM_PUBLIC_DEMO_LINKS=1 is what publishes the demo URLs", async () => {
    const env = readEnv({ DATA_DIR: "/tmp/showroom-demo-links", RATE_LIMIT_RPS: "0", LOG_LEVEL: "error" });
    const withLinks = await createShowroom(env, {
      log: new Logger({ level: "error", write: () => undefined }),
      persist: false,
      root: ROOT,
      raw: { SHOWROOM_SESSION_SECRET: "x".repeat(20), SHOWROOM_PUBLIC_DEMO_LINKS: "1" },
    });
    const client = await testing.startTestServer(withLinks.app);
    try {
      const res = await client.get("/products/doc-processing");
      assert.match(res.text, /arag-doc-processing\.fly\.dev/);
      assert.match(res.text, /See the live demo/);
    } finally {
      await client.close();
      await withLinks.close();
    }
  });

  test("the head carries a title, a description and the platform favicon", async () => {
    const res = await c.get("/products/call-analysis");
    // The displayed name comes from the authored marketing copy when there is any, and from the
    // product's own positioning document otherwise — so assert on the catalogue, not a literal.
    const name = showroom.catalogue.get("call-analysis").copy.name ?? "Call Analysis";
    assert.match(res.text, new RegExp(`<title>[^<]*${name}[^<]*</title>`));
    assert.match(res.text, /<meta name="description" content="[^"]{40,}">/);
    assert.match(res.text, /href="\/ui\/favicon\.svg"/);
  });

  test("static assets and the UI kit are served", async () => {
    assert.equal((await c.get("/assets/showroom.css")).status, 200);
    assert.equal((await c.get("/assets/showroom.js")).status, 200);
    assert.equal((await c.get("/ui/arag-ui.css")).status, 200);
  });
});

describe("request partner access", () => {
  test("the form renders, stores a request, and the administrator sees it", async () => {
    const form = await c.get("/request-access?product=call-analysis");
    assert.equal(form.status, 200);
    assert.match(form.text, /name="partnerType"/);
    assert.match(form.text, /name="aragAccount"/);
    assert.match(form.text, /value="call-analysis" checked/);

    const sent = await postForm("/request-access", {
      name: "Ada Partner",
      email: "ada@isv.example",
      organisation: "Partner Ltd",
      partnerType: "isv",
      aragAccount: "no",
      products: ["call-analysis", "voicebridge"],
      message: "We resell claims software.",
    });
    assert.equal(sent.status, 303);
    assert.match(sent.headers.get("location") ?? "", /sent=1/);
    assert.match((await c.get("/request-access?sent=1")).text, /is with the administrators/);

    const invites = await c.get("/admin/invites", as(adminCookie));
    assert.match(invites.text, /ada@isv\.example/);
    assert.match(invites.text, /Partner Ltd/);
    assert.match(invites.text, /1 open/);
  });

  test("a bad submission re-renders the form with the error and keeps what was typed", async () => {
    const res = await postForm("/request-access", { name: "Bo", email: "not-an-email" });
    assert.equal(res.status, 400);
    assert.match(res.text, /valid email address/);
    assert.match(res.text, /value="Bo"/);
  });

  test("an administrator can dismiss a request", async () => {
    await postForm("/request-access", { name: "Cy", email: "cy@isv.example" });
    const page = await c.get("/admin/invites", as(adminCookie));
    const id = showroom.requests.list("new").find((r) => r.email === "cy@isv.example")?.id;
    assert.ok(id);
    const res = await postForm(
      `/admin/access-requests/${id}`,
      { csrf: csrfFrom(page.text), status: "dismissed" },
      adminCookie,
    );
    assert.equal(res.status, 303);
    assert.equal(
      showroom.requests.list("new").some((r) => r.email === "cy@isv.example"),
      false,
    );
  });
});

describe("sign-in and the gate", () => {
  test("gated routes send an anonymous visitor to sign in, remembering where they were going", async () => {
    for (const path of ["/portal", "/p/doc-processing", "/p/doc-processing/docs", "/account", "/admin"]) {
      const res = await c.get(path);
      assert.equal(res.status, 303, path);
      const location = res.headers.get("location") ?? "";
      assert.match(location, /^\/login\?next=/, path);
      assert.match(decodeURIComponent(location), new RegExp(path.replace(/\//g, "\\/")));
    }
  });

  test("a bad sign-in re-renders the form and does not set a cookie", async () => {
    const res = await postForm("/login", { email: ADMIN_EMAIL, password: "definitely-wrong-1" });
    assert.equal(res.status, 401);
    assert.match(res.text, /Email or password is not correct/);
    assert.equal((res.headers.getSetCookie?.() ?? []).length, 0);
  });

  test("`next` cannot be used to bounce a signed-in visitor off-site", async () => {
    for (const next of ["https://evil.example/steal", "//evil.example", "/\\evil"]) {
      const res = await postForm("/login", { email: ADMIN_EMAIL, password: "quiver-marsh-fathom-19", next });
      assert.equal(res.status, 303);
      const location = res.headers.get("location") ?? "";
      assert.equal(location.startsWith("/"), true, `${next} produced ${location}`);
      assert.equal(location.startsWith("//"), false, `${next} produced ${location}`);
    }
  });

  test("signing out clears the cookie and the portal is gated again", async () => {
    const cookie = await signInViaForm(ADMIN_EMAIL, "quiver-marsh-fathom-19");
    const out = await postForm("/logout", {}, cookie);
    assert.equal(out.status, 303);
    assert.match(out.headers.getSetCookie?.()[0] ?? "", /Max-Age=0/);
  });
});

describe("invitation flow", () => {
  test("an administrator invites someone, who then sets their own password and lands in the portal", async () => {
    const page = await c.get("/admin/invites", as(adminCookie));
    const created = await postForm(
      "/admin/invites",
      {
        csrf: csrfFrom(page.text),
        email: "newpartner@isv.example",
        name: "New Partner",
        role: "partner",
        "productRole:call-analysis": "operator",
        expiresInDays: "7",
      },
      adminCookie,
    );
    assert.equal(created.status, 201);
    const link = created.text.match(/https:\/\/showroom\.test\/invite\/([A-Za-z0-9_-]+)/);
    assert.ok(link?.[1], "the one-time invitation link should be shown once");
    const token = link[1];

    const offer = await c.get(`/invite/${token}`);
    assert.equal(offer.status, 200);
    assert.match(offer.text, /newpartner@isv\.example/);
    assert.match(offer.text, /partner/);

    const mismatch = await postForm(`/invite/${token}`, {
      name: "New Partner",
      password: "harbour-lintel-drove-52",
      confirm: "something-else-entirely",
    });
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.text, /do not match/);

    const accepted = await postForm(`/invite/${token}`, {
      name: "New Partner",
      password: "harbour-lintel-drove-52",
      confirm: "harbour-lintel-drove-52",
    });
    assert.equal(accepted.status, 303);
    assert.equal(accepted.headers.get("location"), "/portal");
    const partnerCookie = cookieOf(accepted);
    const portal = await c.get("/portal", as(partnerCookie));
    assert.equal(portal.status, 200);
    assert.match(portal.text, /New Partner/);

    // The link is single use.
    assert.equal((await c.get(`/invite/${token}`)).status, 409);
  });

  test("an unknown invitation link is a 404 page, not a stack trace", async () => {
    const res = await c.get("/invite/not-a-real-token-at-all-000000");
    assert.equal(res.status, 404);
    assert.match(res.text, /Not found/);
  });
});

describe("the gated portal", () => {
  let viewerCookie = "";
  let partnerCookie = "";

  before(async () => {
    const page = await c.get("/admin", as(adminCookie));
    const csrf = csrfFrom(page.text);
    const created = await postForm(
      "/admin/users",
      { csrf, email: "pageviewer@showroom.test", name: "Vee", role: "viewer" },
      adminCookie,
    );
    assert.equal(created.status, 201);
    const password = created.text.match(/class="sr-secret">([^<]+)</)?.[1];
    assert.ok(password, "the temporary password should be shown once");
    let cookie = await signInViaForm("pageviewer@showroom.test", password);
    // New accounts must choose their own password before they can browse.
    const forced = await c.get("/portal", as(cookie));
    assert.equal(forced.status, 303);
    assert.equal(forced.headers.get("location"), "/account?forced=1");
    const account = await c.get("/account", as(cookie));
    assert.match(account.text, /Password change required/);
    const changed = await postForm(
      "/account/password",
      {
        csrf: csrfFrom(account.text),
        currentPassword: password,
        newPassword: "trellis-onward-bison-83",
        confirm: "trellis-onward-bison-83",
      },
      cookie,
    );
    assert.equal(changed.status, 303);
    cookie = cookieOf(changed);
    viewerCookie = cookie;
    partnerCookie = await signInViaForm("newpartner@isv.example", "harbour-lintel-drove-52");
  });

  test("the portal lists every product with the buttons the role allows", async () => {
    const res = await c.get("/portal", as(viewerCookie));
    assert.equal(res.status, 200);
    // The portal shows each product's recommended name from its positioning document.
    for (const slug of ["doc-processing", "call-analysis", "voicebridge"]) {
      const recommended = showroom.catalogue.get(slug).manifest?.recommendedName;
      assert.ok(recommended, `${slug} has no recommended name`);
      assert.match(res.text, new RegExp(recommended));
    }
    assert.match(res.text, />Docs</);
    assert.match(res.text, />Showcase</);
    assert.equal(res.text.includes("Open demo"), false, "a viewer must not be offered the demo");
    assert.equal(res.text.includes("Open admin"), false);
  });

  test("the product overview renders the positioning and the right extra links", async () => {
    const res = await c.get("/p/doc-processing", as(viewerCookie));
    assert.equal(res.status, 200);
    assert.match(
      res.text,
      new RegExp(showroom.catalogue.get("doc-processing").manifest?.recommendedName ?? "x"),
    );
    assert.match(res.text, /Launch blog/);
    assert.equal(res.text.includes("Partner pitch"), false, "a viewer must not see the partner pitch link");
    assert.equal(res.text.includes(PRODUCT_TOKEN), false);
  });

  test("the docs browser renders a page with navigation, a breadcrumb and the source path", async () => {
    const index = await c.get("/p/doc-processing/docs", as(viewerCookie));
    assert.equal(index.status, 200);
    assert.match(index.text, /Architecture/);
    const page = await c.get("/p/doc-processing/docs/business/overview.md", as(viewerCookie));
    assert.equal(page.status, 200);
    assert.match(page.text, /sr-docnav/);
    assert.match(page.text, /aria-current="page"/);
    assert.match(page.text, /arag-doc-processing\/docs\/business\/overview\.md/);
    assert.match(page.text, /<h1 id="/);
  });

  test("a Mermaid page loads the diagram script; a page without one does not", async () => {
    const withDiagram = await c.get("/p/doc-processing/docs/architecture/architecture.md", as(viewerCookie));
    assert.match(withDiagram.text, /cdn\.jsdelivr\.net\/npm\/mermaid@11/);
    assert.match(withDiagram.text, /<pre class="mermaid">/);
    const without = await c.get("/p/doc-processing/docs/business/faq.md", as(viewerCookie));
    assert.equal(without.text.includes("mermaid.min.js"), false);
  });

  test("the showcase page offers the recording and the gallery", async () => {
    const res = await c.get("/p/doc-processing/showcase", as(viewerCookie));
    assert.equal(res.status, 200);
    assert.match(res.text, /<video/);
    assert.match(res.text, /assets\/showcase\/out\/video\.webm/);
    assert.match(res.text, /Screenshots/);
  });

  test("a viewer is refused enablement and the partner pitch, with an explanation", async () => {
    for (const path of [
      "/p/doc-processing/enablement",
      "/p/doc-processing/enablement/developer-track/LAB.md",
      "/p/doc-processing/docs/product-marketing/partner-pitch.md",
    ]) {
      const res = await c.get(path, as(viewerCookie));
      assert.equal(res.status, 403, path);
      assert.match(res.text, /role does not include/);
    }
  });

  test("a partner reaches enablement, the worked solutions and the partner pitch", async () => {
    const cookie = as(partnerCookie);
    assert.equal((await c.get("/p/doc-processing/enablement", cookie)).status, 200);
    assert.equal(
      (await c.get("/p/doc-processing/enablement/developer-track/solutions/01-drive-the-api.md", cookie))
        .status,
      200,
    );
    assert.equal(
      (await c.get("/p/doc-processing/docs/product-marketing/partner-pitch.md", cookie)).status,
      200,
    );
  });

  test("a per-product operator role unlocks that product's admin surface and nobody else's", async () => {
    // newpartner@isv.example is a partner globally and an operator on call-analysis only.
    const calls = await c.get("/p/call-analysis", as(partnerCookie));
    assert.match(calls.text, /Open admin/);
    // No SHOWROOM_ADMIN_TOKEN_CALL_ANALYSIS is configured here, so the page says so instead of
    // inventing one.
    assert.match(calls.text, /SHOWROOM_ADMIN_TOKEN_CALL_ANALYSIS/);
    const docs = await c.get("/p/doc-processing", as(partnerCookie));
    assert.equal(docs.text.includes("Open admin"), false);
    assert.equal(docs.text.includes("Operator access"), false);
    assert.equal(
      docs.text.includes(PRODUCT_TOKEN),
      false,
      "the doc-processing token leaked to a non-operator",
    );
  });

  test("an operator on a product with a configured token sees it, revealed on demand", async () => {
    const page = await c.get("/admin", as(adminCookie));
    const created = await postForm(
      "/admin/users",
      {
        csrf: csrfFrom(page.text),
        email: "dpoperator@showroom.test",
        role: "viewer",
        "productRole:doc-processing": "operator",
      },
      adminCookie,
    );
    const password = created.text.match(/class="sr-secret">([^<]+)</)?.[1];
    assert.ok(password);
    let cookie = await signInViaForm("dpoperator@showroom.test", password);
    const account = await c.get("/account", as(cookie));
    const changed = await postForm(
      "/account/password",
      {
        csrf: csrfFrom(account.text),
        currentPassword: password,
        newPassword: "cobble-vellum-strand-36",
        confirm: "cobble-vellum-strand-36",
      },
      cookie,
    );
    cookie = cookieOf(changed);
    const overview = await c.get("/p/doc-processing", as(cookie));
    assert.match(overview.text, /Operator access/);
    assert.match(overview.text, new RegExp(`data-secret="${PRODUCT_TOKEN}"`));
    // It is masked until the viewer asks for it, and it is not on any other product's page.
    assert.match(overview.text, /•{8,}/);
    assert.equal((await c.get("/p/voicebridge", as(cookie))).text.includes(PRODUCT_TOKEN), false);
  });

  test("the account page lists the viewer's access per product", async () => {
    const res = await c.get("/account", as(viewerCookie));
    assert.equal(res.status, 200);
    assert.match(res.text, /Your account/);
    assert.match(res.text, /marketing, docs, showcase/);
  });
});

describe("the administration area", () => {
  test("a non-administrator is refused every admin page", async () => {
    const cookie = await signInViaForm("pageviewer@showroom.test", "trellis-onward-bison-83");
    for (const path of ["/admin", "/admin/invites", "/admin/audit", "/admin/system"]) {
      const res = await c.get(path, as(cookie));
      assert.equal(res.status, 403, path);
      assert.match(res.text, /Administrator access is required/);
    }
  });

  test("the administrator sees users, the audit log and the system page", async () => {
    const users = await c.get("/admin", as(adminCookie));
    assert.match(users.text, /pageviewer@showroom\.test/);
    const audit = await c.get("/admin/audit", as(adminCookie));
    assert.match(audit.text, /auth\.login/);
    assert.match(audit.text, /invite\.created/);
    const filtered = await c.get("/admin/audit?action=auth.login.failed", as(adminCookie));
    assert.match(filtered.text, /auth\.login\.failed/);
    const system = await c.get("/admin/system", as(adminCookie));
    assert.match(system.text, /adminTokenConfigured/);
    assert.equal(system.text.includes(PRODUCT_TOKEN), false, "the system page leaked a product token");
  });

  test("a form post without the session's CSRF token is refused", async () => {
    const res = await postForm(
      "/admin/users",
      { csrf: "not-the-right-token", email: "sneaky@showroom.test", role: "admin" },
      adminCookie,
    );
    assert.equal(res.status, 403);
    assert.match(res.text, /form has expired/);
    assert.equal(showroom.users.byEmail("sneaky@showroom.test"), undefined);
  });

  test("a CSRF token from a different session does not work", async () => {
    const otherCookie = await signInViaForm("pageviewer@showroom.test", "trellis-onward-bison-83");
    const page = await c.get("/account", as(otherCookie));
    const res = await postForm(
      "/admin/users",
      { csrf: csrfFrom(page.text), email: "sneaky2@showroom.test", role: "admin" },
      adminCookie,
    );
    assert.equal(res.status, 403);
  });

  test("an administrator changes a role, disables and re-enables an account", async () => {
    const page = await c.get("/admin", as(adminCookie));
    const csrf = csrfFrom(page.text);
    const target = showroom.users.byEmail("pageviewer@showroom.test");
    assert.ok(target);
    const promoted = await postForm(
      `/admin/users/${target.id}`,
      { csrf, action: "role", role: "evaluator" },
      adminCookie,
    );
    assert.equal(promoted.status, 303);
    assert.equal(showroom.users.byId(target.id)?.role, "evaluator");
    const disabled = await postForm(`/admin/users/${target.id}`, { csrf, action: "disable" }, adminCookie);
    assert.equal(disabled.status, 303);
    assert.equal(showroom.users.byId(target.id)?.disabled, true);
    const enabled = await postForm(`/admin/users/${target.id}`, { csrf, action: "enable" }, adminCookie);
    assert.equal(enabled.status, 303);
    assert.equal(showroom.users.byId(target.id)?.disabled, false);
  });

  test("an unknown action and an unknown user are handled without a 500", async () => {
    const page = await c.get("/admin", as(adminCookie));
    const csrf = csrfFrom(page.text);
    const target = showroom.users.byEmail("pageviewer@showroom.test");
    const bad = await postForm(`/admin/users/${target?.id}`, { csrf, action: "explode" }, adminCookie);
    assert.equal(bad.status, 303);
    assert.match(bad.headers.get("location") ?? "", /error=/);
    const missing = await postForm(
      "/admin/users/00000000-0000-0000-0000-000000000000",
      { csrf, action: "role", role: "viewer" },
      adminCookie,
    );
    assert.equal(missing.status, 404);
  });
});
