/**
 * Every HTML surface: the public marketing site, the sign-in and invitation flows, the gated portal
 * and the administration area.
 *
 * Pages are plain server-rendered documents and forms POST back to these same routes rather than to
 * `/api/v1`, so the portal works with JavaScript disabled and a half-finished fetch can never leave
 * an administrator unsure whether a change landed. The handlers call the same services the API
 * calls — never the API over HTTP — so the two front doors share one implementation of the rules.
 * Every POST carries a CSRF token bound to the session, on top of the SameSite=Lax cookie.
 */
import { readFileSync } from "node:fs";
import type { App, Ctx } from "../../vendor/arag-platform/src/index.ts";
import { HttpError } from "../../vendor/arag-platform/src/index.ts";
import {
  bulletLeads,
  extractMermaid,
  extractSection,
  firstParagraph,
  plainText,
} from "../content-extract.ts";
import { renderMarkdown } from "../markdown.ts";
import { isRole, isSiteAdmin, type Role } from "../permissions.ts";
import type { Product } from "../services/catalogue.ts";
import {
  enablementToMarkdown,
  proofToMarkdown,
  qandaToMarkdown,
  stepsToMarkdown,
  titledToMarkdown,
  toCapabilities,
  toLines,
  toPhases,
} from "../services/site-copy.ts";
import { generatePassword, principalOf, SESSION_TTL_SEC, type UserDoc } from "../services/users.ts";
import {
  accountPage,
  adminAuditPage,
  adminInvitesPage,
  adminSystemPage,
  adminUsersPage,
  homePage,
  invitePage,
  loginPage,
  messagePage,
  type ProductView,
  productOverviewPage,
  readerPage,
  showcasePage,
} from "../ui/pages.ts";
import {
  type PublicProduct,
  partnersPage,
  programmePage,
  publicHomePage,
  publicProductPage,
  requestAccessPage,
} from "../ui/public.ts";
import { adminHealth, guardAdminChange, inviteUrl } from "./api.ts";
import {
  assertCsrf,
  chromeFor,
  clearSessionCookie,
  contentPathFor,
  contentUrl,
  csrfFor,
  type Deps,
  productViewFor,
  renderContent,
  requireAdmin,
  requireSurface,
  requireViewer,
  setSessionCookie,
  surfacesOf,
  viewer,
} from "./support.ts";

/** Form bodies: `URLSearchParams` keeps repeated fields (checkbox groups) that an object would lose. */
function form(ctx: Ctx): URLSearchParams {
  const raw = ctx.rawBody?.toString("utf8") ?? "";
  return new URLSearchParams(raw);
}

function redirectBack(ctx: Ctx, to: string, flash?: string): void {
  ctx.redirect(flash ? `${to}${to.includes("?") ? "&" : "?"}${flash}` : to, 303);
}

/**
 * A safe redirect target. Browsers treat a backslash as a path separator for special schemes, so
 * `/\evil.example` is not the same-origin path it looks like — resolving the candidate against a
 * dummy origin and insisting the origin survives is the only check that catches every variant.
 */
export function safeNext(value: string | null | undefined, fallback = "/portal"): string {
  if (!value) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith("/")) return fallback;
  // A backslash or a control character can change how a browser parses the target; neither belongs
  // in a path we generated. Checked by code point rather than a regex class, which Biome disallows.
  for (const ch of decoded) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\\" || code < 0x20 || code === 0x7f) return fallback;
  }
  try {
    const base = "https://showroom.invalid";
    const resolved = new URL(decoded, base);
    if (resolved.origin !== base) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Wrap a page handler so thrown problems become HTML rather than JSON: unauthenticated visitors
 * are sent to sign in with a `next` that brings them back, everything else renders a message page.
 */
function html(deps: Deps, handler: (ctx: Ctx) => unknown | Promise<unknown>) {
  return async (ctx: Ctx) => {
    try {
      return await handler(ctx);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      const user = viewer(ctx, deps);
      if (err.status === 401 && !user) {
        ctx.redirect(`/login?next=${encodeURIComponent(ctx.url.pathname + ctx.url.search)}`, 303);
        return;
      }
      ctx.html(
        messagePage({
          brand: deps.branding,
          chrome: chromeFor(user, "", deps.branding),
          status: err.status,
          title: err.title,
          message: err.message,
          links: [
            { href: "/portal", label: "Back to the products" },
            ...(user ? [] : [{ href: "/login", label: "Sign in" }]),
          ],
        }),
        err.status,
      );
      return;
    }
  };
}

/** Gated pages force a password change before anything else. */
function gate(ctx: Ctx, deps: Deps): UserDoc | null {
  const user = requireViewer(ctx, deps);
  if (user.mustChangePassword && !ctx.path.startsWith("/account")) {
    ctx.redirect("/account?forced=1", 303);
    return null;
  }
  return user;
}

// ───────────────────────────── public view models ─────────────────────────────

function readIfPresent(deps: Deps, product: Product, path: string): string {
  try {
    return deps.catalogue.readPage(product, path).raw;
  } catch {
    return "";
  }
}

function renderFragment(slug: string, basePath: string, markdown: string): string {
  return markdown ? renderContent(slug, basePath, markdown).html : "";
}

export function publicProductView(deps: Deps, product: Product): PublicProduct {
  const slug = product.config.slug;
  const positioning = readIfPresent(deps, product, "docs/product-marketing/positioning.md");
  const overview = readIfPresent(deps, product, "docs/business/overview.md");
  const architecture = readIfPresent(deps, product, "docs/architecture/architecture.md");
  const dataFlow = readIfPresent(deps, product, "docs/architecture/data-flow.md");
  const faq = readIfPresent(deps, product, "docs/business/faq.md");
  const whiteLabel = readIfPresent(deps, product, "docs/developer/white-label.md");
  const extensionPoints = readIfPresent(deps, product, "docs/developer/extension-points.md");
  const copy = product.copy;

  const elevator =
    extractSection(positioning, ["Elevator paragraph", "What it is", "What it does"]) ||
    extractSection(overview, ["What it is", "What it does"]) ||
    firstParagraph(positioning);
  const proofPoints =
    extractSection(positioning, ["Proof points", "Proof points (true today)"]) ||
    extractSection(positioning, ["Competitive framing"]);
  const mermaid = extractMermaid(architecture);
  const flowSummary = firstParagraph(dataFlow) || firstParagraph(architecture);

  const phases = toPhases(copy.roadmap);
  const authoredRoadmap = phases.flatMap((phase) => phase.items.map((item) => `${phase.phase}: ${item}`));

  const customer = copy.customer ?? {};
  const trust = toLines(customer.trust);

  return {
    slug,
    name: copy.name || product.manifest?.recommendedName || product.config.workingTitle,
    // Customer-facing hero copy, with the partner-facing copy as an honest fallback. The short
    // config summary makes a better headline than a 150-character one-liner, which becomes the
    // sub-head instead; the hero moment has its own band and is not repeated here.
    customerHeadline: customer.headline || product.config.summary || copy.oneLiner || "",
    customerSubhead:
      customer.subhead || copy.oneLiner || product.manifest?.oneLiner || product.config.summary || "",
    outcomes: toCapabilities(customer.outcomes).length
      ? toCapabilities(customer.outcomes)
      : (product.config.outcomes ?? []),
    heroMoment: customer.heroMoment || copy.heroMoment || "",
    trust: trust.length
      ? trust
      : [
          "Every answer cites the source it came from, so a reviewer can check it rather than trust it.",
          "Nothing is answered from the model's general knowledge — only from the content you supplied.",
          "Runs entirely on your own infrastructure, against your own Knowledge Box, under Apache-2.0.",
        ],
    ctaHeadline: customer.cta?.label ?? "",
    ctaBody: customer.cta?.body ?? "",
    workingTitle: product.config.workingTitle,
    oneLiner: copy.oneLiner || product.manifest?.oneLiner || "",
    summary: copy.heroMoment || product.config.summary || "",
    accent: product.config.accent ?? "#4b4bf7",
    repoUrl: product.config.repoUrl ?? null,
    heroShot: product.screenshots[0] ?? null,
    screenshots: product.screenshots,
    video: product.video,
    // The product page is a white-label asset shown to a partner's own customers, so a capability
    // about white-labelling or partner branding belongs on /partners, not here.
    capabilities: customerFacing(
      toCapabilities(copy.capabilities).length
        ? toCapabilities(copy.capabilities)
        : (product.config.capabilities ?? []),
    ),
    availableNow: product.config.availableNow ?? [],
    roadmap: authoredRoadmap.length ? authoredRoadmap : (product.config.roadmap ?? []),
    roadmapPhases: phases,
    facts: product.facts,
    whyItWins: toLines(copy.whyItWins).length
      ? toLines(copy.whyItWins)
          .slice(0, 6)
          .map((w) => clampPhrase(w))
      : bulletLeads(proofPoints, 4),
    elevatorHtml: copy.elevator
      ? renderMarkdown(copy.elevator).html
      : renderFragment(slug, "docs/product-marketing/positioning.md", elevator),
    // The home page shows a teaser; the product page carries the full text.
    elevatorTeaserHtml: `<p>${plainTextParagraph(copy.elevator || elevator, 420)}</p>`,
    howItWorksHtml: renderFragment(slug, "docs/architecture/architecture.md", mermaid),
    howItWorksStepsHtml: renderMarkdown(stepsToMarkdown(copy.howItWorks)).html,
    dataFlowHtml: flowSummary ? `<p>${plainTextParagraph(flowSummary)}</p>` : "",
    personasHtml: copy.personas?.length
      ? renderMarkdown(titledToMarkdown(copy.personas)).html
      : renderFragment(
          slug,
          "docs/product-marketing/positioning.md",
          extractSection(positioning, ["Personas", "Who it's for", "Who it is for"]),
        ),
    useCasesHtml: copy.useCases?.length
      ? renderMarkdown(titledToMarkdown(copy.useCases)).html
      : renderFragment(
          slug,
          "docs/product-marketing/positioning.md",
          extractSection(positioning, ["Use cases"]),
        ),
    faqHtml: customerFacingQandA(customer.faq ?? copy.faq).length
      ? renderMarkdown(qandaToMarkdown(customerFacingQandA(customer.faq ?? copy.faq))).html
      : // The section already has its own <h2>; the document's own title would be a second <h1>.
        renderFragment(slug, "docs/business/faq.md", stripTitle(faq)),
    proofHtml: renderMarkdown(proofToMarkdown(customer.proof ?? copy.proof)).html,
    partnerModels: copy.partnerModels ?? [],
    enablementHtml: copy.enablement
      ? renderMarkdown(firstSections(enablementToMarkdown(copy.enablement), 700)).html
      : "",
    demoUrl: deps.publicDemoLinks ? deps.catalogue.demoUrl(product) : null,
    hasMermaid: Boolean(mermaid),
    whiteLabelHtml: renderFragment(slug, "docs/developer/white-label.md", firstSections(whiteLabel)),
    extensionPointsHtml: renderFragment(
      slug,
      "docs/developer/extension-points.md",
      firstSections(extensionPoints),
    ),
    whiteLabelDocUrl: whiteLabel ? contentUrl(slug, "docs/developer/white-label.md") : null,
    extensionPointsDocUrl: extensionPoints ? contentUrl(slug, "docs/developer/extension-points.md") : null,
  };
}

/** Drop a document's own level-1 title so an embedded fragment does not introduce a second <h1>. */
function stripTitle(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, "");
}

/**
 * The opening of a long developer document — a teaser on a card, never the whole guide. These
 * excerpts sit in a grid beside each other on /partners, so they have to be short enough that the
 * cards stay comparable; the full text is one link away inside the portal.
 */
function firstSections(markdown: string, maxChars = 620): string {
  if (!markdown) return "";
  const body = stripTitle(markdown);
  if (body.length <= maxChars) return body;
  const cut = body.slice(0, maxChars);
  const lastBreak = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf("\n- "));
  return cut.slice(0, lastBreak > maxChars * 0.4 ? lastBreak : maxChars);
}

/** Drop cards that talk to a partner about reselling rather than to a customer about the product. */
const PARTNER_FACING = /white[-\s]?label|rebrand|partner|reseller|oem/i;

function customerFacing(cards: Array<{ title: string; body: string }>) {
  return cards.filter((c) => !PARTNER_FACING.test(c.title));
}

/** The same rule for the FAQ: a customer does not ask how to resell the product. */
function customerFacingQandA(items: Array<{ q: string; a: string }> | undefined) {
  return (items ?? []).filter((i) => typeof i?.q === "string" && !PARTNER_FACING.test(i.q));
}

/** Authored "why it wins" lines can be a full paragraph; the list wants one readable sentence. */
function clampPhrase(text: string, maxLength = 200): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  if (stop > maxLength * 0.5) return cut.slice(0, stop).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : maxLength).trim()}…`;
}

function plainTextParagraph(markdown: string, maxLength = 600): string {
  return renderMarkdown(plainText(markdown, maxLength)).html.replace(/^<p>|<\/p>\s*$/g, "");
}

// ───────────────────────────── routes ─────────────────────────────

export function registerPageRoutes(app: App, deps: Deps): void {
  const count = () => {
    deps.usage.pageViews++;
  };

  // ── public site ──

  app.get(
    "/",
    html(deps, (ctx) => {
      count();
      const user = viewer(ctx, deps);
      ctx.html(
        publicHomePage({
          viewer: chromeFor(user, "", deps.branding).viewer,
          products: deps.catalogue.list().map((p) => publicProductView(deps, p)),
          totals: deps.catalogue.totals(),
          market: deps.catalogue.market(),
          home: deps.catalogue.home(),
          playbook: playbook(deps),
        }),
      );
    }),
    { noRateLimit: true },
  );

  app.get(
    "/products/:slug",
    html(deps, (ctx) => {
      count();
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      ctx.html(
        publicProductPage({
          viewer: chromeFor(viewer(ctx, deps), "", deps.branding).viewer,
          brand: deps.branding,
          product: publicProductView(deps, product),
        }),
      );
    }),
    { noRateLimit: true },
  );

  app.get(
    "/partners",
    html(deps, (ctx) => {
      count();
      ctx.html(
        partnersPage({
          viewer: chromeFor(viewer(ctx, deps), "", deps.branding).viewer,
          brand: deps.branding,
          home: deps.catalogue.home(),
          products: deps.catalogue.list().map((p) => publicProductView(deps, p)),
          playbook: playbook(deps),
        }),
      );
    }),
    { noRateLimit: true },
  );

  app.get(
    "/programme/:doc",
    html(deps, (ctx) => {
      count();
      const doc = deps.catalogue.programmeDoc(ctx.params.doc ?? "");
      const raw = readFileSync(doc.file, "utf8");
      const rendered = renderMarkdown(raw, {
        resolveLink: (href) => (href.startsWith("#") ? href : href),
      });
      ctx.html(
        programmePage({
          viewer: chromeFor(viewer(ctx, deps), "", deps.branding).viewer,
          brand: deps.branding,
          title: rendered.title || doc.title,
          html: rendered.html,
          hasMermaid: rendered.hasMermaid,
        }),
      );
    }),
    { noRateLimit: true },
  );

  app.get(
    "/request-access",
    html(deps, (ctx) => {
      count();
      ctx.html(
        requestAccessPage({
          viewer: chromeFor(viewer(ctx, deps), "", deps.branding).viewer,
          brand: deps.branding,
          products: deps.catalogue.list().map((p) => ({
            slug: p.config.slug,
            name: p.manifest?.recommendedName || p.config.workingTitle,
          })),
          values: { product: ctx.query.get("product") ?? "" },
          submitted: ctx.query.get("sent") === "1",
          csrf: "",
        }),
      );
    }),
  );

  app.post(
    "/request-access",
    html(deps, (ctx) => {
      const body = form(ctx);
      const products = deps.catalogue.list().map((p) => ({
        slug: p.config.slug,
        name: p.manifest?.recommendedName || p.config.workingTitle,
      }));
      const values = {
        name: body.get("name") ?? "",
        email: body.get("email") ?? "",
        organisation: body.get("organisation") ?? "",
        message: body.get("message") ?? "",
        partnerType: body.get("partnerType") ?? "",
        aragAccount: body.get("aragAccount") ?? "",
      };
      try {
        const request = deps.requests.submit({
          ...values,
          products: body.getAll("products"),
          ip: ctx.ip,
          knownSlugs: products.map((p) => p.slug),
        });
        deps.users.record("access.requested", {
          target: request.email,
          ip: ctx.ip,
          detail: { organisation: request.organisation, products: request.products },
        });
        redirectBack(ctx, "/request-access?sent=1");
      } catch (err) {
        ctx.html(
          requestAccessPage({
            viewer: chromeFor(viewer(ctx, deps), "", deps.branding).viewer,
            brand: deps.branding,
            products,
            values,
            error: err instanceof HttpError ? err.message : "That request could not be recorded.",
            csrf: "",
          }),
          400,
        );
      }
    }),
    { body: "raw" },
  );

  // ── sign in ──

  app.get(
    "/login",
    html(deps, (ctx) => {
      if (viewer(ctx, deps)) {
        ctx.redirect(safeNext(ctx.query.get("next")), 303);
        return;
      }
      ctx.html(
        loginPage({
          brand: deps.branding,
          next: ctx.query.get("next") ?? "",
          error: ctx.query.get("error") ? "Email or password is not correct." : undefined,
          notice: ctx.query.get("signedout") ? "You have been signed out." : undefined,
          csrf: "",
        }),
      );
    }),
  );

  app.post(
    "/login",
    html(deps, async (ctx) => {
      const body = form(ctx);
      const email = body.get("email") ?? "";
      const next = safeNext(body.get("next"));
      const retry = deps.users.throttleCheck(ctx.ip, email);
      const fail = (message: string, status = 401) => {
        deps.usage.failedLogins++;
        ctx.html(
          loginPage({ brand: deps.branding, email, next: body.get("next") ?? "", error: message, csrf: "" }),
          status,
        );
      };
      if (retry !== null) {
        fail(`Too many attempts. Try again in ${Math.ceil(retry / 60)} minute(s).`, 429);
        return;
      }
      try {
        const result = await deps.users.login(email, body.get("password") ?? "", ctx.ip);
        deps.usage.logins++;
        setSessionCookie(ctx, result.token, SESSION_TTL_SEC);
        ctx.redirect(result.user.mustChangePassword ? "/account?forced=1" : next, 303);
      } catch (err) {
        fail(
          err instanceof HttpError && err.status !== 401 ? err.message : "Email or password is not correct.",
          err instanceof HttpError ? err.status : 401,
        );
      }
    }),
    { body: "raw" },
  );

  app.post(
    "/logout",
    html(deps, (ctx) => {
      const user = viewer(ctx, deps);
      if (user) deps.users.record("auth.logout", { actor: user, target: user.email, ip: ctx.ip });
      clearSessionCookie(ctx);
      ctx.redirect("/login?signedout=1", 303);
    }),
    { body: "none" },
  );

  // ── invitation ──

  app.get(
    "/invite/:token",
    html(deps, (ctx) => {
      const token = ctx.params.token ?? "";
      const offer = deps.users.openInvite(token);
      ctx.html(
        invitePage({
          brand: deps.branding,
          token,
          offer,
          csrf: "",
          products: deps.catalogue.list().map((p) => ({
            slug: p.config.slug,
            title: p.manifest?.recommendedName || p.config.workingTitle,
          })),
        }),
      );
    }),
  );

  app.post(
    "/invite/:token",
    html(deps, async (ctx) => {
      const token = ctx.params.token ?? "";
      const body = form(ctx);
      const offer = deps.users.openInvite(token);
      const products = deps.catalogue.list().map((p) => ({
        slug: p.config.slug,
        title: p.manifest?.recommendedName || p.config.workingTitle,
      }));
      const password = body.get("password") ?? "";
      if (password !== (body.get("confirm") ?? "")) {
        ctx.html(
          invitePage({
            brand: deps.branding,
            token,
            offer,
            products,
            error: "The passwords do not match.",
            csrf: "",
          }),
          400,
        );
        return;
      }
      try {
        const result = await deps.users.acceptInvite(token, password, {
          name: body.get("name") ?? offer.name,
          ip: ctx.ip,
        });
        setSessionCookie(ctx, result.token, SESSION_TTL_SEC);
        ctx.redirect("/portal", 303);
      } catch (err) {
        ctx.html(
          invitePage({
            brand: deps.branding,
            token,
            offer,
            products,
            error: err instanceof HttpError ? err.message : "That did not work.",
            csrf: "",
          }),
          400,
        );
      }
    }),
    { body: "raw" },
  );

  // ── portal ──

  app.get(
    "/portal",
    html(deps, (ctx) => {
      const user = gate(ctx, deps);
      if (!user) return;
      count();
      ctx.html(
        homePage({
          chrome: chromeFor(user, "portal", deps.branding),
          products: deps.catalogue.list().map((p) => productViewFor(deps, user, p)),
        }),
      );
    }),
  );

  app.get(
    "/account",
    html(deps, (ctx) => {
      const user = requireViewer(ctx, deps);
      count();
      ctx.html(
        accountPage({
          chrome: chromeFor(user, "", deps.branding),
          user: deps.users.publicUser(user),
          products: deps.catalogue.list().map((p) => {
            const view = productViewFor(deps, user, p);
            return {
              slug: view.slug,
              title: view.title,
              accessLabel: view.accessLabel,
              surfaces: view.surfaces,
            };
          }),
          forced: user.mustChangePassword || ctx.query.get("forced") === "1",
          notice: ctx.query.get("changed") === "1" ? "Your password has been changed." : undefined,
          csrf: csrfFor(ctx, deps),
        }),
      );
    }),
  );

  app.post(
    "/account/password",
    html(deps, async (ctx) => {
      const user = requireViewer(ctx, deps);
      const body = form(ctx);
      assertCsrfForm(ctx, deps, body);
      const render = (error: string, status = 400) =>
        ctx.html(
          accountPage({
            chrome: chromeFor(user, "", deps.branding),
            user: deps.users.publicUser(user),
            products: deps.catalogue.list().map((p) => {
              const view = productViewFor(deps, user, p);
              return {
                slug: view.slug,
                title: view.title,
                accessLabel: view.accessLabel,
                surfaces: view.surfaces,
              };
            }),
            forced: user.mustChangePassword,
            error,
            csrf: csrfFor(ctx, deps),
          }),
          status,
        );
      const next = body.get("newPassword") ?? "";
      if (next !== (body.get("confirm") ?? "")) {
        render("The new passwords do not match.");
        return;
      }
      try {
        const updated = await deps.users.changeOwnPassword(user.id, body.get("currentPassword") ?? "", next);
        deps.users.record("auth.password.changed", { actor: updated, target: updated.email, ip: ctx.ip });
        setSessionCookie(ctx, deps.users.issue(updated).token, SESSION_TTL_SEC);
        ctx.redirect("/account?changed=1", 303);
      } catch (err) {
        render(err instanceof HttpError ? err.message : "That password could not be set.");
      }
    }),
    { body: "raw" },
  );

  // ── product surfaces ──

  app.get(
    "/p/:slug",
    html(deps, (ctx) => {
      const user = gate(ctx, deps);
      if (!user) return;
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      const slug = product.config.slug;
      requireSurface(ctx, deps, user, slug, "marketing");
      count();
      const view = productViewFor(deps, user, product);
      const positioningPath = "docs/product-marketing/positioning.md";
      const raw = readIfPresent(deps, product, positioningPath);
      const rendered = raw ? renderContent(slug, positioningPath, raw) : null;
      const surfaces = surfacesOf(user, slug);
      const extras: Array<{ href: string; label: string; description: string }> = [];
      if (surfaces.includes("partner-pitch") && product.pages.some((p) => p.path.includes("partner-pitch")))
        extras.push({
          href: contentUrl(slug, "docs/product-marketing/partner-pitch.md"),
          label: "Partner pitch",
          description: "How partners take this to market",
        });
      if (surfaces.includes("marketing"))
        extras.push({
          href: contentUrl(slug, "docs/product-marketing/launch-blog.md"),
          label: "Launch blog",
          description: "The announcement narrative",
        });
      if (surfaces.includes("docs"))
        extras.push(
          {
            href: contentUrl(slug, "docs/business/overview.md"),
            label: "Business overview",
            description: "What it does and why it matters",
          },
          {
            href: contentUrl(slug, "docs/architecture/architecture.md"),
            label: "Architecture",
            description: "How the service is put together",
          },
        );
      if (surfaces.includes("enablement"))
        extras.push({
          href: `/p/${slug}/enablement`,
          label: "Enablement",
          description: "Developer and architect tracks",
        });
      ctx.html(
        productOverviewPage({
          chrome: chromeFor(user, "", deps.branding),
          product: view,
          positioningHtml: rendered?.html ?? "",
          positioningPath: raw ? `${view.repo}/${positioningPath}` : null,
          hasMermaid: rendered?.hasMermaid ?? false,
          extras,
        }),
      );
    }),
  );

  for (const area of ["docs", "enablement"] as const) {
    app.get(
      `/p/:slug/${area}`,
      html(deps, (ctx) => {
        const user = gate(ctx, deps);
        if (!user) return;
        const product = deps.catalogue.get(ctx.params.slug ?? "");
        const slug = product.config.slug;
        requireSurface(ctx, deps, user, slug, area === "docs" ? "docs" : "enablement");
        count();
        ctx.html(
          readerPage({
            chrome: chromeFor(user, "", deps.branding),
            product: productViewFor(deps, user, product),
            sections: sectionsFor(deps, product, user, area),
            page: null,
            area,
            intro:
              area === "docs"
                ? "Everything the product team publishes: developer guides, architecture, business material and positioning."
                : "Hands-on labs and workshops. Solutions are visible to partners and administrators.",
          }),
        );
      }),
    );

    app.get(
      `/p/:slug/${area}/:path*`,
      html(deps, (ctx) => {
        const user = gate(ctx, deps);
        if (!user) return;
        const product = deps.catalogue.get(ctx.params.slug ?? "");
        const slug = product.config.slug;
        const contentPath = contentPathFor(product, area, ctx.params.path ?? "");
        const node = deps.catalogue.page(product, contentPath);
        requireSurface(ctx, deps, user, slug, node.surface);
        count();
        const { raw } = deps.catalogue.readPage(product, node.path);
        const rendered = renderContent(slug, node.path, raw);
        const view = productViewFor(deps, user, product);
        ctx.html(
          readerPage({
            chrome: chromeFor(user, "", deps.branding),
            product: view,
            sections: sectionsFor(deps, product, user, area),
            area,
            page: {
              path: node.path,
              title: rendered.title || node.title,
              html: rendered.html,
              hasMermaid: rendered.hasMermaid,
              sourcePath: `${view.repo}/${node.path}`,
              section: node.section,
            },
          }),
        );
      }),
    );
  }

  app.get(
    "/p/:slug/showcase",
    html(deps, (ctx) => {
      const user = gate(ctx, deps);
      if (!user) return;
      const product = deps.catalogue.get(ctx.params.slug ?? "");
      const slug = product.config.slug;
      requireSurface(ctx, deps, user, slug, "showcase");
      count();
      ctx.html(
        showcasePage({
          chrome: chromeFor(user, "", deps.branding),
          product: productViewFor(deps, user, product),
          scriptHtml: renderFragment(
            slug,
            "showcase/SCRIPT.md",
            readIfPresent(deps, product, "showcase/SCRIPT.md"),
          ),
          storyboardHtml: renderFragment(
            slug,
            "showcase/STORYBOARD.md",
            readIfPresent(deps, product, "showcase/STORYBOARD.md"),
          ),
        }),
      );
    }),
  );

  // ── administration ──

  app.get(
    "/admin",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      count();
      ctx.html(
        adminUsersPage({
          chrome: chromeFor(admin, "admin", deps.branding),
          users: deps.users.list().map((u) => deps.users.publicUser(u)),
          products: productChoices(deps),
          notice: ctx.query.get("ok") ?? undefined,
          error: ctx.query.get("error") ?? undefined,
          csrf: csrfFor(ctx, deps),
        }),
      );
    }),
  );

  app.post(
    "/admin/users",
    html(deps, async (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = form(ctx);
      assertCsrfForm(ctx, deps, body);
      const temporaryPassword = generatePassword();
      try {
        const user = await deps.users.create({
          email: body.get("email") ?? "",
          name: body.get("name") ?? "",
          password: temporaryPassword,
          role: roleFrom(body.get("role")),
          productRoles: productRolesFrom(body),
          mustChangePassword: true,
          invitedBy: admin.email,
        });
        deps.users.record("user.created", {
          actor: admin,
          target: user.email,
          ip: ctx.ip,
          detail: { role: user.role },
        });
        ctx.html(
          adminUsersPage({
            chrome: chromeFor(admin, "admin", deps.branding),
            users: deps.users.list().map((u) => deps.users.publicUser(u)),
            products: productChoices(deps),
            notice: `Created ${user.email}.`,
            temporaryPassword: { email: user.email, password: temporaryPassword },
            csrf: csrfFor(ctx, deps),
          }),
          201,
        );
      } catch (err) {
        redirectBack(ctx, "/admin", `error=${encodeURIComponent(errorText(err))}`);
      }
    }),
    { body: "raw" },
  );

  app.post(
    "/admin/users/:id",
    html(deps, async (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = form(ctx);
      assertCsrfForm(ctx, deps, body);
      const id = ctx.params.id ?? "";
      const target = deps.users.byId(id);
      if (!target) throw new HttpError(404, "Not found", "That user no longer exists.");
      const action = body.get("action");
      try {
        if (action === "role") {
          const role = roleFrom(body.get("role"));
          guardAdminChange(deps, admin, target, { role });
          deps.users.update(id, { role });
          deps.users.record("user.updated", {
            actor: admin,
            target: target.email,
            ip: ctx.ip,
            detail: { role },
          });
          redirectBack(ctx, "/admin", `ok=${encodeURIComponent(`${target.email} is now ${role}.`)}`);
        } else if (action === "disable" || action === "enable") {
          const disabled = action === "disable";
          guardAdminChange(deps, admin, target, { disabled });
          deps.users.update(id, { disabled });
          deps.users.record(disabled ? "user.disabled" : "user.enabled", {
            actor: admin,
            target: target.email,
            ip: ctx.ip,
          });
          redirectBack(
            ctx,
            "/admin",
            `ok=${encodeURIComponent(`${target.email} ${disabled ? "disabled" : "enabled"}.`)}`,
          );
        } else if (action === "reset") {
          const temporaryPassword = generatePassword();
          await deps.users.setPassword(id, temporaryPassword, { mustChange: true });
          deps.users.record("user.password.reset", { actor: admin, target: target.email, ip: ctx.ip });
          ctx.html(
            adminUsersPage({
              chrome: chromeFor(admin, "admin", deps.branding),
              users: deps.users.list().map((u) => deps.users.publicUser(u)),
              products: productChoices(deps),
              notice: `Password reset for ${target.email}.`,
              temporaryPassword: { email: target.email, password: temporaryPassword },
              csrf: csrfFor(ctx, deps),
            }),
          );
        } else if (action === "delete") {
          if (target.id === admin.id)
            throw new HttpError(400, "Bad request", "You cannot delete your own account.");
          deps.users.remove(id);
          deps.users.record("user.deleted", { actor: admin, target: target.email, ip: ctx.ip });
          redirectBack(ctx, "/admin", `ok=${encodeURIComponent(`${target.email} removed.`)}`);
        } else {
          throw new HttpError(400, "Bad request", "Unknown action.");
        }
      } catch (err) {
        redirectBack(ctx, "/admin", `error=${encodeURIComponent(errorText(err))}`);
      }
    }),
    { body: "raw" },
  );

  app.get(
    "/admin/invites",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      count();
      ctx.html(
        adminInvitesPage({
          chrome: chromeFor(admin, "admin", deps.branding),
          invites: deps.users.listInvites().map((i) => deps.users.publicInvite(i)),
          requests: deps.requests.list(),
          products: productChoices(deps),
          notice: ctx.query.get("ok") ?? undefined,
          error: ctx.query.get("error") ?? undefined,
          csrf: csrfFor(ctx, deps),
        }),
      );
    }),
  );

  app.post(
    "/admin/invites",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = form(ctx);
      assertCsrfForm(ctx, deps, body);
      try {
        const { invite, token } = deps.users.createInvite({
          email: body.get("email") ?? "",
          name: body.get("name") ?? "",
          role: roleFrom(body.get("role")),
          productRoles: productRolesFrom(body),
          expiresInDays: Number(body.get("expiresInDays") ?? 7) || 7,
          createdBy: admin,
        });
        deps.requests.markInvited(invite.email, admin.email);
        deps.users.record("invite.created", {
          actor: admin,
          target: invite.email,
          ip: ctx.ip,
          detail: { role: invite.role, expiresAt: invite.expiresAt },
        });
        ctx.html(
          adminInvitesPage({
            chrome: chromeFor(admin, "admin", deps.branding),
            invites: deps.users.listInvites().map((i) => deps.users.publicInvite(i)),
            requests: deps.requests.list(),
            products: productChoices(deps),
            created: deps.users.publicInvite(invite, inviteUrl(deps, token)),
            csrf: csrfFor(ctx, deps),
          }),
          201,
        );
      } catch (err) {
        redirectBack(ctx, "/admin/invites", `error=${encodeURIComponent(errorText(err))}`);
      }
    }),
    { body: "raw" },
  );

  app.post(
    "/admin/invites/:id/revoke",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      assertCsrfForm(ctx, deps, form(ctx));
      try {
        const invite = deps.users.revokeInvite(ctx.params.id ?? "");
        deps.users.record("invite.revoked", { actor: admin, target: invite.email, ip: ctx.ip });
        redirectBack(
          ctx,
          "/admin/invites",
          `ok=${encodeURIComponent(`Invitation for ${invite.email} revoked.`)}`,
        );
      } catch (err) {
        redirectBack(ctx, "/admin/invites", `error=${encodeURIComponent(errorText(err))}`);
      }
    }),
    { body: "raw" },
  );

  app.post(
    "/admin/access-requests/:id",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      const body = form(ctx);
      assertCsrfForm(ctx, deps, body);
      const status = body.get("status") === "invited" ? "invited" : "dismissed";
      try {
        const request = deps.requests.resolve(ctx.params.id ?? "", status, admin.email);
        deps.users.record("access.resolved", {
          actor: admin,
          target: request.email,
          ip: ctx.ip,
          detail: { status },
        });
        redirectBack(
          ctx,
          "/admin/invites",
          `ok=${encodeURIComponent(`Request from ${request.email} ${status}.`)}`,
        );
      } catch (err) {
        redirectBack(ctx, "/admin/invites", `error=${encodeURIComponent(errorText(err))}`);
      }
    }),
    { body: "raw" },
  );

  app.get(
    "/admin/audit",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      count();
      const action = ctx.query.get("action") ?? "";
      ctx.html(
        adminAuditPage({
          chrome: chromeFor(admin, "admin", deps.branding),
          entries: deps.users.listAudit({ limit: 200, action: action || undefined }),
          action,
        }),
      );
    }),
  );

  app.get(
    "/admin/system",
    html(deps, (ctx) => {
      const admin = requireAdmin(ctx, deps);
      count();
      ctx.html(
        adminSystemPage({
          chrome: chromeFor(admin, "admin", deps.branding),
          health: adminHealth(deps),
          usage: { ...deps.usage, uptimeSec: (Date.now() - deps.usage.startedAt) / 1000 },
          config: {
            version: deps.version,
            publicUrl: deps.publicUrl,
            publicDemoLinks: deps.publicDemoLinks,
            nodeEnv: deps.env.nodeEnv,
            dataDir: deps.env.dataDir,
            products: deps.catalogue.list().map((p) => ({
              slug: p.config.slug,
              demoUrl: deps.catalogue.demoUrl(p),
              adminUrl: deps.catalogue.adminUrl(p),
              adminTokenEnv: deps.catalogue.adminTokenEnvName(p),
              adminTokenConfigured: Boolean(deps.catalogue.adminToken(p)),
            })),
          },
          logs: deps.log.recent({ limit: 80 }) as Array<Record<string, unknown>>,
        }),
      );
    }),
  );
}

// ───────────────────────────── helpers ─────────────────────────────

function sectionsFor(deps: Deps, product: Product, user: UserDoc, area: "docs" | "enablement") {
  const allowed = surfacesOf(user, product.config.slug);
  if (area === "enablement") return deps.catalogue.sections(product, allowed, "enablement/");
  return deps.catalogue
    .sections(product, allowed)
    .filter((s) => !s.section.startsWith("Enablement") && s.section !== "Showcase");
}

/** The partner pilot playbook, when the workspace has synced one. */
function playbook(deps: Deps): { slug: string; title: string } | null {
  const docs = deps.catalogue.programme();
  const match = docs.find((d) => d.slug.includes("playbook")) ?? docs[0];
  return match ? { slug: match.slug, title: match.title } : null;
}

function productChoices(deps: Deps): Array<{ slug: string; title: string }> {
  return deps.catalogue.list().map((p) => ({
    slug: p.config.slug,
    title: p.manifest?.recommendedName || p.config.workingTitle,
  }));
}

function roleFrom(value: string | null): Role {
  return isRole(value) ? value : "viewer";
}

function productRolesFrom(body: URLSearchParams): Record<string, Role> {
  const out: Record<string, Role> = {};
  for (const [key, value] of body) {
    if (!key.startsWith("productRole:") || !value) continue;
    const slug = key.slice("productRole:".length);
    if (isRole(value)) out[slug] = value;
  }
  return out;
}

function assertCsrfForm(ctx: Ctx, deps: Deps, body: URLSearchParams): void {
  ctx.body = { csrf: body.get("csrf") ?? "" };
  assertCsrf(ctx, deps);
}

function errorText(err: unknown): string {
  return err instanceof HttpError ? err.message : "Something went wrong.";
}

export { isSiteAdmin, principalOf, type ProductView };
