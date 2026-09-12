/**
 * The public site: a home page that explains the platform and the three products, one full page per
 * product, and the request-access form.
 *
 * This layer is for people who have not signed in — investors, partners, anyone the owner sends a
 * link to. It is assembled from exactly the same synced markdown the gated portal serves, so the
 * public story and the internal documentation cannot drift apart. Three rules hold everywhere here:
 * no gated content (enablement, solutions, partner pitch, docs bodies) ever reaches this layer, no
 * product admin token is ever rendered, and live demo URLs appear only when the deployment opts in
 * with SHOWROOM_PUBLIC_DEMO_LINKS=1.
 */
import { PARTNER_TYPE_LABELS, PARTNER_TYPES } from "../services/access-requests.ts";
import type { Capability, ProductFacts } from "../services/catalogue.ts";
import { type HomeCopy, type PartnerModel, type PricingCopy, toCapabilities } from "../services/site-copy.ts";
import { icon, iconFor } from "./icons.ts";
import {
  alert,
  type BrandChrome,
  brandOr,
  card,
  csrfInput,
  esc,
  field,
  type NavLink,
  select,
  siteLayout,
  type ViewerChrome,
} from "./layout.ts";

export interface PublicProduct {
  slug: string;
  name: string;
  /** Benefit-led hero copy for the customer-facing landing page. */
  customerHeadline: string;
  customerSubhead: string;
  outcomes: Capability[];
  heroMoment: string;
  trust: string[];
  ctaHeadline: string;
  ctaBody: string;
  workingTitle: string;
  oneLiner: string;
  summary: string;
  accent: string;
  repoUrl: string | null;
  heroShot: string | null;
  screenshots: string[];
  video: string | null;
  capabilities: Capability[];
  availableNow: string[];
  roadmap: string[];
  facts: ProductFacts;
  whyItWins: string[];
  /** Pre-rendered, sanitised HTML from the synced markdown. */
  elevatorHtml: string;
  /** A shortened version for the home page's product band. */
  elevatorTeaserHtml: string;
  howItWorksHtml: string;
  dataFlowHtml: string;
  personasHtml: string;
  useCasesHtml: string;
  faqHtml: string;
  /** Present only when the deployment publishes demo links. */
  demoUrl: string | null;
  hasMermaid: boolean;
  /** Partner-facing blocks, rendered from the product's own docs when they exist. */
  whiteLabelHtml: string;
  extensionPointsHtml: string;
  /** Authored copy, when the marketing lead has supplied it. Empty strings when not. */
  howItWorksStepsHtml: string;
  proofHtml: string;
  partnerModels: PartnerModel[];
  enablementHtml: string;
  roadmapPhases: Array<{ phase: string; items: string[] }>;
  /** Gated links to the full guides, when the product repo has published them. */
  whiteLabelDocUrl: string | null;
  extensionPointsDocUrl: string | null;
}

/** Used only when `content/site/home.json` has no authored engagement models. */
const PARTNER_MODELS_FALLBACK: PartnerModel[] = [
  {
    model: "White-label",
    body: "Deploy an accelerator as it stands under your own brand, pointed at your own Knowledge Box. Name, tagline, logo, colours and the attribution line are BRAND_* environment variables read at boot — a rebrand needs no rebuild and no fork.",
  },
  {
    model: "Extend for your vertical",
    body: "The interesting work is in the services layer: extraction schemas, call taxonomies, prospect configurations, handoff rules. Every repository documents its extension points and ships a lab that walks an engineer through adding one.",
  },
  {
    model: "Build your own on the platform",
    body: "The shared platform — typed ARAG client, HTTP toolkit, mock Knowledge Box, UI kit, repo template — is the part you would otherwise rebuild. `make new-product` gives you a fourth accelerator with the tests, CI and security baseline already in place.",
  },
];

const assetUrl = (slug: string, path: string) => `/api/v1/products/${esc(slug)}/assets/${esc(path)}`;

function statTile(value: string, label: string, note?: string): string {
  return `<div class="sr-stat"><span class="sr-stat-value">${esc(value)}</span><span class="sr-stat-label">${esc(label)}</span>${
    note ? `<span class="sr-stat-note">${esc(note)}</span>` : ""
  }</div>`;
}

function capabilityCards(capabilities: Capability[], limit = 8): string {
  if (!capabilities.length) return "";
  return `<div class="sr-cap-grid">${capabilities
    .slice(0, limit)
    .map(
      (c, i) =>
        `<article class="sr-cap"><span class="sr-cap-icon">${icon(iconFor(`${c.title} ${c.body}`, i))}</span>
      <h4>${esc(c.title)}</h4><p>${esc(clamp(c.body, 320))}</p></article>`,
    )
    .join("")}</div>`;
}

/** The "what you get" band: fewer, larger cards than the capability grid. */
function outcomeCards(outcomes: Capability[]): string {
  if (!outcomes.length) return "";
  return `<div class="sr-outcome-grid">${outcomes
    .slice(0, 4)
    .map(
      (o, i) =>
        `<article class="sr-outcome"><span class="sr-cap-icon">${icon(iconFor(`${o.title} ${o.body}`, i))}</span>
      <h3>${esc(o.title)}</h3><p>${esc(clamp(o.body, 300))}</p></article>`,
    )
    .join("")}</div>`;
}

function whyList(points: string[], limit = 4): string {
  if (!points.length) return "";
  return `<ul class="sr-why">${points
    .slice(0, limit)
    .map((p) => `<li>${esc(p)}</li>`)
    .join("")}</ul>`;
}

const PLATFORM_DIAGRAM = `<pre class="mermaid">flowchart TB
  KB["Progress Agentic RAG\nKnowledge Box"]
  subgraph P["arag-platform — the shared foundation"]
    direction LR
    C["Typed ARAG client"]
    H["HTTP toolkit\nOpenAPI validation\nRFC 9457 errors"]
    M["Mock Knowledge Box\ndeterministic, offline"]
    U["UI kit\n+ repo template"]
  end
  DP["Document Processing"]
  CA["Call Analysis"]
  VB["VoiceBridge"]
  KB --> C
  P --> DP
  P --> CA
  P --> VB</pre>`;

// ───────────────────────────── home ─────────────────────────────

export function publicHomePage(opts: {
  viewer: ViewerChrome | null;
  brand?: BrandChrome;
  products: PublicProduct[];
  totals: { commits: number; endpoints: number; tests: number; docPages: number; products: number };
  home?: HomeCopy;
  /** The synced partner pilot playbook, when the workspace has one. */
  playbook?: { slug: string; title: string } | null;
}): string {
  const { totals } = opts;
  const zeroDep = opts.products.filter((p) => p.facts.runtimeDependencies === 0).length;
  const home = opts.home ?? {};
  const models = home.partnerModels?.length ? home.partnerModels : PARTNER_MODELS_FALLBACK;
  const hero = home.hero ?? {};
  return siteLayout({
    title: `${brandOr(opts.brand).productName} — reference products on Progress Agentic RAG`,
    description:
      "Open-source reference products for the Progress Agentic RAG partner network: white-label them, extend them for your vertical, or build your own on the shared platform.",
    viewer: opts.viewer,
    brand: opts.brand,
    mermaid: true,
    body: `
<section class="sr-hero-section">
  <div class="sr-shell sr-hero-grid">
    <div class="sr-hero-copy">
      <p class="sr-eyebrow">${esc(home.programme?.name ?? "Agentic RAG Partner Accelerators")} · Apache-2.0</p>
      <h1>${esc(hero.headline ?? "An Agentic RAG partner-accelerator programme.")}</h1>
      <p class="sr-lede">${esc(
        hero.subhead ??
          "Three open-source reference products Progress ISV partners can white-label, extend, or build on — and take to market through their existing reach.",
      )}</p>
      ${hero.body ? `<p class="sr-hero-body">${esc(hero.body)}</p>` : ""}
      <div class="sr-hero-actions">
        <a class="arag-btn lg" href="/request-access">Request partner access</a>
        <a class="arag-btn lg secondary" href="#products">See the products</a>
      </div>
      <p class="sr-hero-note">Documentation, enablement labs and live demos sit behind a partner invitation. Everything below is open.</p>
    </div>
    <div class="sr-hero-stats">
      ${statTile(String(totals.products), "products", "each API-first")}
      ${statTile(String(totals.endpoints), "documented endpoints", "OpenAPI 3.1")}
      ${statTile(String(totals.tests), "automated tests", "unit · integration · contract · e2e")}
      ${statTile(`${zeroDep}/${totals.products}`, "with zero runtime deps", "Node standard library only")}
    </div>
  </div>
</section>

<section class="sr-section sr-section-alt" id="platform">
  <div class="sr-shell">
    <p class="sr-eyebrow">The platform</p>
    <h2>${esc(home.platform?.title ?? "One foundation. Three accelerators. No duplicated plumbing.")}</h2>
    <p class="sr-section-lede">${esc(
      home.platform?.body ??
        "Every accelerator is a thin layer of domain logic over the same tested platform: a typed ARAG client, an HTTP toolkit that enforces the API contract, a deterministic mock of the Knowledge Box so anything can run offline, and a shared design system.",
    )}</p>
    <div class="sr-platform-grid">
      <div class="sr-diagram">${PLATFORM_DIAGRAM}</div>
      <ul class="sr-feature-list">
        ${(toCapabilities(home.platform?.capabilities).length
          ? toCapabilities(home.platform?.capabilities)
          : [
              {
                title: "Typed ARAG client",
                body: "One module knows the Knowledge Box URLs and shapes — search, ask with NDJSON streaming, stored search configurations, data-augmentation agents, predict. Accelerators never speak HTTP to ARAG.",
              },
              {
                title: "HTTP toolkit",
                body: "Routing, OpenAPI-driven request validation, RFC 9457 problem responses, rate limits, security headers, sessions, SSE and a safe static server — on node:http, with no framework.",
              },
              {
                title: "Mock Knowledge Box",
                body: "Every accelerator runs end to end with ARAG_MOCK=1: no account, no credentials, no model spend. Tests, CI and the showcase recordings all run against it.",
              },
              {
                title: "Shared UI kit and repo template",
                body: "Design tokens, components, Dockerfile, CI and the documentation structure ship as a template, so the fourth accelerator starts where the third finished.",
              },
            ]
        )
          .map((c) => `<li><strong>${esc(c.title)}.</strong> ${esc(c.body)}</li>`)
          .join("")}
      </ul>
    </div>
    ${home.platform?.proof ? `<p class="sr-proofline">${esc(home.platform.proof)}</p>` : ""}
  </div>
</section>

<section class="sr-section" id="partners-teaser">
  <div class="sr-shell sr-teaser">
    <div>
      <p class="sr-eyebrow">For ISV partners</p>
      <h2>Resell them, embed them, extend them — or build a fourth.</h2>
      <p class="sr-section-lede">Every accelerator is Apache-2.0 with rebranding by configuration rather than by
      forking, documented extension points, and enablement written to be taught. Four engagement models, one
      foundation.</p>
      <p><a class="arag-btn" href="/partners">See the partner programme</a></p>
    </div>
    <ul class="sr-teaser-list">
      ${models
        .slice(0, 4)
        .map((m) => `<li><strong>${esc(m.model)}</strong><span>${esc(clamp(m.body, 130))}</span></li>`)
        .join("")}
    </ul>
  </div>
</section>

<section class="sr-section" id="products">
  <div class="sr-shell">
    <p class="sr-eyebrow">The products</p>
    <h2>Three products, three different jobs, one retrieval engine.</h2>
  </div>
  ${opts.products.map((p, i) => homeProductSection(p, i)).join("")}
</section>

${
  home.verifiability
    ? `<section class="sr-section sr-section-alt" id="verifiability">
  <div class="sr-shell">
    <p class="sr-eyebrow">The wedge</p>
    <h2>${esc(home.verifiability.title ?? "Verifiability, not accuracy")}</h2>
    <p class="sr-section-lede">${esc(home.verifiability.body ?? "")}</p>
    ${
      home.verifiability.evidence?.length
        ? `<ul class="sr-why">${home.verifiability.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
        : ""
    }
  </div>
</section>`
    : ""
}

<section class="sr-section sr-section-dark" id="traction">
  <div class="sr-shell">
    <p class="sr-eyebrow">Traction</p>
    <h2>Counted from the repositories, not estimated.</h2>
    <p class="sr-section-lede">Every number here is measured during the content sync: commits from
    <code>git</code>, endpoints from each product's OpenAPI document, tests from the suites themselves.</p>
    <div class="sr-stat-strip">
      ${statTile(String(totals.commits), "commits across the products")}
      ${statTile(String(totals.endpoints), "documented API endpoints")}
      ${statTile(String(totals.tests), "automated tests")}
      ${statTile(String(totals.docPages), "pages of documentation")}
    </div>
    <div class="sr-traction-table">
      <table class="arag-table">
        <thead><tr><th scope="col">Product</th><th scope="col">Endpoints</th><th scope="col">Tests</th><th scope="col">Line coverage</th><th scope="col">Runtime deps</th><th scope="col">Doc pages</th></tr></thead>
        <tbody>${opts.products
          .map(
            (p) =>
              `<tr><th scope="row"><a href="/products/${esc(p.slug)}">${esc(p.name)}</a></th><td>${esc(String(p.facts.endpoints ?? "—"))}</td><td>${esc(String(p.facts.tests ?? "—"))}</td><td>${p.facts.coverageLinesPct ? esc(`${p.facts.coverageLinesPct} %`) : "—"}</td><td>${p.facts.runtimeDependencies === null || p.facts.runtimeDependencies === undefined ? "—" : esc(String(p.facts.runtimeDependencies))}</td><td>${esc(String(p.facts.docPages ?? "—"))}</td></tr>`,
          )
          .join("")}</tbody>
      </table>
    </div>
  </div>
</section>

${home.pricing ? pricingSection(home.pricing, opts.products) : ""}

<section class="sr-section sr-section-alt" id="roadmap">
  <div class="sr-shell">
    <p class="sr-eyebrow">Roadmap</p>
    <h2>What is shipped, and what is next.</h2>
    <div class="sr-roadmap-grid">
      ${opts.products
        .map(
          (p) => `<article class="sr-roadmap" style="--sr-accent:${esc(p.accent)}">
        <h3><a href="/products/${esc(p.slug)}">${esc(p.name)}</a></h3>
        <h4>Available now</h4>
        <ul class="sr-ticks">${p.availableNow.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
        <h4>On the roadmap</h4>
        <ul class="sr-arrows">${p.roadmap.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </article>`,
        )
        .join("")}
    </div>
  </div>
</section>

${
  home.openSource
    ? `<section class="sr-section" id="open-source">
  <div class="sr-shell">
    <p class="sr-eyebrow">Open source · ${esc(home.openSource.licence ?? "Apache-2.0")}</p>
    <h2>Nothing is held back.</h2>
    <p class="sr-section-lede">${esc(home.openSource.body ?? "")}</p>
    ${
      home.openSource.points?.length
        ? `<ul class="sr-ticks sr-two-col">${home.openSource.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
        : ""
    }
    <div class="sr-repo-grid">
      <a class="sr-repo" href="https://github.com/jaysanderson/arag-platform" rel="noopener"><strong>arag-platform</strong><span>The shared foundation: HTTP toolkit, ARAG client, mock server, jobs, UI kit, product template</span></a>
      ${opts.products
        .filter((p) => p.repoUrl)
        .map(
          (p) =>
            `<a class="sr-repo" href="${esc(p.repoUrl ?? "")}" rel="noopener"><strong>${esc((p.repoUrl ?? "").split("/").pop() ?? p.name)}</strong><span>${esc(p.name)}</span></a>`,
        )
        .join("")}
    </div>
  </div>
</section>`
    : ""
}

${
  home.faq?.length
    ? `<section class="sr-section sr-section-alt" id="faq">
  <div class="sr-shell sr-prose">
    <p class="sr-eyebrow">Questions</p>
    <h2>Straight answers.</h2>
    <dl class="sr-faq">${home.faq
      .map((item) => `<dt>${esc(item.q)}</dt><dd>${esc(item.a)}</dd>`)
      .join("")}</dl>
  </div>
</section>`
    : ""
}

<section class="sr-cta">
  <div class="sr-shell sr-cta-inner">
    <div>
      <h2>Become a partner on this stack.</h2>
      <p>Request partner access and an administrator will send you a one-time invitation link. You get the complete
      documentation, both enablement tracks, the showcase recordings and — depending on your role — the live demos,
      the partner pitch and the admin panels.</p>
    </div>
    <a class="arag-btn lg" href="/request-access">Request partner access</a>
  </div>
</section>`,
  });
}

function homeProductSection(p: PublicProduct, index: number): string {
  return `<article class="sr-product-band${index % 2 === 1 ? " reversed" : ""}" style="--sr-accent:${esc(p.accent)}" id="${esc(p.slug)}">
  <div class="sr-shell sr-product-grid">
    <div class="sr-product-copy">
      <p class="sr-eyebrow">${esc(p.name)} <span class="sr-muted">· working title ${esc(p.workingTitle)}</span></p>
      <h3>${esc(p.customerHeadline || p.oneLiner || p.summary)}</h3>
      <div class="md-body sr-elevator">${p.elevatorTeaserHtml}</div>
      ${whyList(p.whyItWins)}
      <div class="sr-product-actions">
        <a class="arag-btn" href="/products/${esc(p.slug)}">Full product page</a>
        ${p.demoUrl ? `<a class="arag-btn secondary" href="${esc(p.demoUrl)}" target="_blank" rel="noopener noreferrer">Live demo ↗</a>` : ""}
        <a class="sr-textlink" href="/request-access?product=${esc(p.slug)}">Request docs access</a>
      </div>
    </div>
    <div class="sr-product-media">
      ${
        p.heroShot
          ? `<a class="sr-shot" href="/products/${esc(p.slug)}"><img src="${assetUrl(p.slug, p.heroShot)}" alt="${esc(p.name)} in use" width="1280" height="800"></a>`
          : ""
      }
    </div>
  </div>
  <div class="sr-shell">
    ${capabilityCards(p.capabilities, 4)}
    ${
      p.howItWorksHtml
        ? `<details class="sr-howitworks"><summary>How ${esc(p.name)} works</summary><div class="md-body">${p.howItWorksHtml}</div></details>`
        : ""
    }
  </div>
</article>`;
}

/** Suggested on-sell pricing: one card per accelerator, with the published competitor anchors. */
function pricingSection(pricing: PricingCopy, products: PublicProduct[]): string {
  const accentFor = (slug: string | undefined) =>
    products.find((p) => p.slug === slug || p.name === slug)?.accent ?? "var(--arag-brand-500)";
  const cards = (pricing.products ?? []).map(
    (p) => `<article class="sr-pricing" style="--sr-accent:${esc(accentFor(p.slug))}">
        <h3>${esc(p.name ?? p.slug ?? "")}</h3>
        ${p.unit ? `<p class="sr-pricing-unit">${esc(p.unit)}</p>` : ""}
        <dl class="sr-pricing-tiers">${(p.tiers ?? [])
          .map(
            (t) =>
              `<div class="sr-pricing-tier"><dt><span class="sr-pricing-tier-name">${esc(t.name)}</span><span class="sr-pricing-price">${esc(t.price)}</span></dt>${t.body ? `<dd>${esc(t.body)}</dd>` : ""}</div>`,
          )
          .join("")}</dl>
        ${p.anchors ? `<p class="sr-pricing-anchors"><strong>Market anchors.</strong> ${esc(p.anchors)}</p>` : ""}
      </article>`,
  );
  return `<section class="sr-section" id="pricing">
  <div class="sr-shell">
    <p class="sr-eyebrow">Suggested pricing</p>
    <h2>${esc(pricing.headline ?? "Suggested on-sell pricing for partners")}</h2>
    ${pricing.body ? `<p class="sr-section-lede">${esc(pricing.body)}</p>` : ""}
    ${cards.length ? `<div class="sr-pricing-grid">${cards.join("")}</div>` : ""}
    ${
      pricing.principles?.length
        ? `<ul class="sr-why sr-two-col sr-pricing-principles">${pricing.principles.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
        : ""
    }
    ${pricing.caveat ? `<p class="sr-muted sr-pricing-caveat">${esc(pricing.caveat)}</p>` : ""}
  </div>
</section>`;
}

/** Trim authored prose that is longer than a card can carry, on a sentence boundary. */
function clamp(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > maxLength * 0.5) return cut.slice(0, stop + 1).trim();
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : maxLength).trim()}…`;
}

// ───────────────────────────── product page ─────────────────────────────

export function publicProductPage(opts: {
  viewer: ViewerChrome | null;
  brand?: BrandChrome;
  product: PublicProduct;
}): string {
  const p = opts.product;
  const heroShot = p.heroShot ? assetUrl(p.slug, p.heroShot) : "";
  return siteLayout({
    title: `${p.name} — ${brandOr(opts.brand).productName}`,
    description: p.customerSubhead || p.oneLiner || p.summary,
    viewer: opts.viewer,
    brand: opts.brand,
    mermaid: true,
    nav: [
      { href: "/#products", label: "Products" },
      { href: "#outcomes", label: "What you get" },
      { href: "#how", label: "How it works" },
      { href: "#proof", label: "Proof" },
      { href: "#faq", label: "FAQ" },
    ],
    body: `
<section class="sr-product-hero" style="--sr-accent:${esc(p.accent)}">
  <div class="sr-shell sr-product-hero-grid">
    <div class="sr-product-hero-copy">
      <p class="sr-eyebrow"><a href="/#products">Products</a> · ${esc(p.name)}</p>
      <h1>${esc(p.customerHeadline || p.oneLiner || p.name)}</h1>
      <p class="sr-lede">${esc(p.customerSubhead || p.summary || p.oneLiner)}</p>
      <div class="sr-hero-actions">
        <a class="arag-btn lg" href="/request-access?product=${esc(p.slug)}">Request access</a>
        ${p.demoUrl ? `<a class="arag-btn lg secondary" href="${esc(p.demoUrl)}" target="_blank" rel="noopener noreferrer">See the live demo ↗</a>` : `<a class="arag-btn lg secondary" href="#how">See how it works</a>`}
      </div>
    </div>
    ${heroShot ? `<div class="sr-product-hero-shot"><img src="${heroShot}" alt="${esc(p.name)} in use" width="1280" height="800" fetchpriority="high"></div>` : ""}
  </div>
</section>

${
  p.outcomes.length
    ? `<section class="sr-section" id="outcomes">
  <div class="sr-shell">
    <p class="sr-eyebrow">What you get</p>
    <h2>Outcomes, not a feature list.</h2>
    ${outcomeCards(p.outcomes)}
  </div>
</section>`
    : ""
}

${
  p.heroMoment
    ? `<section class="sr-moment" style="--sr-accent:${esc(p.accent)}">
  <div class="sr-shell sr-moment-inner">
    <p class="sr-eyebrow">The moment it clicks</p>
    <p class="sr-moment-text">${esc(p.heroMoment)}</p>
  </div>
</section>`
    : ""
}

<section class="sr-section sr-section-alt" id="capabilities">
  <div class="sr-shell">
    <p class="sr-eyebrow">What it does</p>
    <h2>Everything it can do, plainly.</h2>
    ${capabilityCards(p.capabilities)}
  </div>
</section>

<section class="sr-section" id="how">
  <div class="sr-shell">
    <p class="sr-eyebrow">How it works</p>
    <h2>Six steps, no black box.</h2>
    <div class="sr-how-grid">
      <div class="md-body sr-prose sr-steps">${p.howItWorksStepsHtml || p.dataFlowHtml}</div>
      <div class="sr-diagram md-body">${p.howItWorksHtml || ""}</div>
    </div>
  </div>
</section>

${
  p.useCasesHtml
    ? `<section class="sr-section sr-section-alt" id="use-cases">
  <div class="sr-shell sr-prose"><p class="sr-eyebrow">Where it is used</p><h2>Across sectors, not one niche.</h2>
  <div class="md-body">${p.useCasesHtml}</div></div>
</section>`
    : ""
}

${
  p.personasHtml
    ? `<section class="sr-section" id="who">
  <div class="sr-shell sr-prose"><p class="sr-eyebrow">Who it is for</p><h2>The people whose week changes.</h2>
  <div class="md-body">${p.personasHtml}</div></div>
</section>`
    : ""
}

<section class="sr-section sr-section-dark" id="proof">
  <div class="sr-shell">
    <p class="sr-eyebrow">Proof</p>
    <h2>Answers you can check.</h2>
    <p class="sr-section-lede">Every answer is grounded in your own content and carries a citation back to the
    source. The numbers below are measured on this product's own repository and test runs, not estimated.${
      p.repoUrl
        ? ` The code is open: <a href="${esc(p.repoUrl)}" rel="noopener">${esc(p.repoUrl.replace("https://", ""))}</a>.`
        : ""
    }</p>
    ${p.trust.length ? `<ul class="sr-why sr-trust">${p.trust.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${p.proofHtml ? `<div class="md-body sr-wide-body sr-proof-table">${p.proofHtml}</div>` : ""}
  </div>
</section>

${
  p.video || p.screenshots.length
    ? `<section class="sr-section" id="showcase">
  <div class="sr-shell">
    <p class="sr-eyebrow">See it running</p>
    <h2>A recorded walkthrough.</h2>
    ${
      p.video
        ? `<video class="sr-video" controls preload="metadata"${heroShot ? ` poster="${heroShot}"` : ""}>
      <source src="${assetUrl(p.slug, p.video)}" type="video/webm">
      Your browser cannot play this recording.
    </video>`
        : ""
    }
    ${
      p.screenshots.length
        ? `<div class="sr-gallery">${p.screenshots
            .slice(0, 8)
            .map(
              (shot, i) =>
                `<figure><a href="${assetUrl(p.slug, shot)}" target="_blank" rel="noopener noreferrer"><img src="${assetUrl(p.slug, shot)}" alt="${esc(p.name)} screenshot ${i + 1}" loading="lazy" width="480" height="300"></a></figure>`,
            )
            .join("")}</div>`
        : ""
    }
  </div>
</section>`
    : ""
}

${
  p.faqHtml
    ? `<section class="sr-section sr-section-alt" id="faq">
  <div class="sr-shell sr-prose"><p class="sr-eyebrow">Questions</p><h2>Straight answers.</h2>
  <div class="md-body">${p.faqHtml}</div></div>
</section>`
    : ""
}

<section class="sr-cta" id="cta">
  <div class="sr-shell sr-cta-inner">
    <div>
      <h2>${esc(p.ctaHeadline || `See ${p.name} on your own content.`)}</h2>
      <p>${esc(
        p.ctaBody ||
          "The documentation, the hands-on labs and the live demo are behind a sign-in. Tell us who you are and an administrator will send a one-time invitation link.",
      )}</p>
    </div>
    <div class="sr-cta-actions">
      <a class="arag-btn lg" href="/request-access?product=${esc(p.slug)}">Request access</a>
      <a class="arag-btn lg secondary" href="/login?next=${esc(encodeURIComponent(`/p/${p.slug}/docs`))}">Sign in</a>
      ${p.repoUrl ? `<a class="arag-btn lg ghost" href="${esc(p.repoUrl)}" rel="noopener">Source on GitHub</a>` : ""}
    </div>
  </div>
</section>`,
  });
}

// ───────────────────────────── for partners ─────────────────────────────

export function partnersPage(opts: {
  viewer: ViewerChrome | null;
  brand?: BrandChrome;
  home?: HomeCopy;
  products: PublicProduct[];
  playbook?: { slug: string; title: string } | null;
}): string {
  const home = opts.home ?? {};
  const models = home.partnerModels?.length ? home.partnerModels : PARTNER_MODELS_FALLBACK;
  return siteLayout({
    title: `For partners — ${brandOr(opts.brand).productName}`,
    description:
      "How ISV partners engage with the Agentic RAG accelerators: white-label, embed, extend, or build your own on the shared platform.",
    viewer: opts.viewer,
    brand: opts.brand,
    nav: [
      { href: "/", label: "Overview" },
      { href: "/#products", label: "Products" },
      { href: "#models", label: "Engagement models" },
      { href: "#white-label", label: "White-label" },
      { href: "#enablement", label: "Enablement" },
    ],
    body: `
<section class="sr-hero-section sr-hero-compact">
  <div class="sr-shell">
    <p class="sr-eyebrow">For ISV partners</p>
    <h1>Take these to your customers, under your own brand.</h1>
    <p class="sr-lede">Three open-source accelerators, one shared platform, Apache-2.0 throughout. Resell them as
    they stand, call them from the product you already sell, extend them for your vertical, or build a fourth on the
    same foundation. Nothing is held back and there is no separate "partner edition".</p>
    <div class="sr-hero-actions">
      <a class="arag-btn lg" href="/request-access">Request partner access</a>
      ${opts.playbook ? `<a class="arag-btn lg secondary" href="/programme/${esc(opts.playbook.slug)}">Partner pilot playbook</a>` : ""}
    </div>
  </div>
</section>

<section class="sr-section" id="models">
  <div class="sr-shell">
    <p class="sr-eyebrow">Engagement models</p>
    <h2>Four ways in, depending on what you sell.</h2>
    <div class="sr-engage-grid">
      ${models
        .map(
          (m, i) => `<article class="sr-engage">
        <span class="sr-engage-num" aria-hidden="true">${i + 1}</span>
        <h3>${esc(m.model)}</h3>
        <p>${esc(clamp(m.body, 560))}</p>
        ${m.requires ? `<p class="sr-engage-requires"><strong>What it needs:</strong> ${esc(clamp(m.requires, 460))}</p>` : ""}
      </article>`,
        )
        .join("")}
    </div>
  </div>
</section>

<section class="sr-section sr-section-alt" id="white-label">
  <div class="sr-shell">
    <p class="sr-eyebrow">White-label</p>
    <h2>Rebranding is configuration, not a fork.</h2>
    <p class="sr-section-lede">Product name, tagline, logo, colours, footer and the "built on Progress Agentic RAG"
    credit are <code>BRAND_*</code> environment variables read at boot and served at
    <code>/api/v1/branding</code>. This portal applies them to itself — including the product pages, which a partner
    can hand to their own customers as-is. See <a href="/request-access">the white-label guide</a> in the portal.</p>
    <div class="sr-engage-grid">
      ${opts.products
        .map(
          (p) => `<article class="sr-engage">
        <h3>${esc(p.name)}</h3>
        <div class="md-body">${p.whiteLabelHtml || `<p>Apache-2.0, brand-light, no telemetry to remove. A deployment is one container plus a data volume.</p>`}</div>
        ${p.whiteLabelDocUrl ? `<p><a class="sr-textlink" href="${esc(p.whiteLabelDocUrl)}">White-label guide →</a></p>` : ""}
      </article>`,
        )
        .join("")}
    </div>
  </div>
</section>

<section class="sr-section" id="extend">
  <div class="sr-shell">
    <p class="sr-eyebrow">Extend</p>
    <h2>Where your vertical logic goes.</h2>
    <div class="sr-engage-grid">
      ${opts.products
        .map(
          (p) => `<article class="sr-engage">
        <h3>${esc(p.name)}</h3>
        <div class="md-body">${p.extensionPointsHtml || `<p>Domain logic lives in a services layer with no HTTP types, the API contract is one OpenAPI document, and the platform's client, store and job manager are the seams you extend.</p>`}</div>
        ${p.extensionPointsDocUrl ? `<p><a class="sr-textlink" href="${esc(p.extensionPointsDocUrl)}">Extension points →</a></p>` : ""}
      </article>`,
        )
        .join("")}
    </div>
  </div>
</section>

<section class="sr-section sr-section-alt" id="enablement">
  <div class="sr-shell">
    <p class="sr-eyebrow">Enablement</p>
    <h2>Written to be taught, not just read.</h2>
    <div class="sr-engage-grid">
      ${
        [
          ["Developer track", home.enablement?.developerTrack],
          ["Architect track", home.enablement?.architectTrack],
          ["Showcase", home.enablement?.showcase],
          ["Documentation", home.enablement?.docs],
          ["Deployment", home.enablement?.deploy],
        ]
          .filter(([, body]) => body)
          .map(
            ([title, body]) =>
              `<article class="sr-engage"><h3>${esc(String(title))}</h3><p>${esc(clamp(String(body), 400))}</p></article>`,
          )
          .join("") ||
        `<article class="sr-engage"><h3>Developer track</h3><p>A 60–90 minute lab per accelerator with a starter
        project, graded exercises and a knowledge check.</p></article>
        <article class="sr-engage"><h3>Architect track</h3><p>A reference-architecture workshop, a sizing and
        deployment guide, and a design-review checklist.</p></article>`
      }
    </div>
    ${
      opts.products.some((p) => p.enablementHtml)
        ? `<div class="sr-engage-grid">${opts.products
            .filter((p) => p.enablementHtml)
            .map(
              (p) =>
                `<article class="sr-engage"><h3>${esc(p.name)}</h3><div class="md-body">${p.enablementHtml}</div></article>`,
            )
            .join("")}</div>`
        : ""
    }
  </div>
</section>

${
  home.programme?.forProgress?.length
    ? `<section class="sr-section" id="for-progress">
  <div class="sr-shell">
    <p class="sr-eyebrow">For Progress</p>
    <h2>A repeatable accelerator, not three one-off demos.</h2>
    <div class="sr-progress-grid">
      <article class="sr-engage">
        <h3>What the programme contains</h3>
        <ul class="sr-ticks">${home.programme.forProgress.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </article>
      <article class="sr-engage">
        <h3>What a partner gets</h3>
        <ul class="sr-ticks">${(home.programme.forPartners ?? []).map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </article>
    </div>
  </div>
</section>`
    : ""
}

<section class="sr-cta">
  <div class="sr-shell sr-cta-inner">
    <div>
      <h2>Start with a pilot.</h2>
      <p>Request partner access and an administrator will send a one-time invitation link with a role attached: the
      full documentation, both enablement tracks, the showcase recordings and, depending on your role, the live demos
      and admin panels.</p>
    </div>
    <div class="sr-cta-actions">
      <a class="arag-btn lg" href="/request-access">Request partner access</a>
      ${opts.playbook ? `<a class="arag-btn lg secondary" href="/programme/${esc(opts.playbook.slug)}">Pilot playbook</a>` : ""}
    </div>
  </div>
</section>`,
  });
}

// ───────────────────────────── request access ─────────────────────────────

export function requestAccessPage(opts: {
  viewer: ViewerChrome | null;
  brand?: BrandChrome;
  products: Array<{ slug: string; name: string }>;
  values?: Record<string, string>;
  error?: string;
  submitted?: boolean;
  csrf: string;
}): string {
  const v = opts.values ?? {};
  return siteLayout({
    title: "Request partner access — ARAG Showroom",
    description:
      "Ask for a partner invitation to the accelerator's documentation, enablement tracks, showcases and demos.",
    viewer: opts.viewer,
    brand: opts.brand,
    body: `
<section class="sr-section sr-form-section">
  <div class="sr-shell sr-narrow-shell">
    ${
      opts.submitted
        ? card(`
      <p class="sr-eyebrow">Thank you</p>
      <h1>Your partner access request is with the administrators.</h1>
      <p class="sr-lede">Nothing is sent anywhere else — the request is stored in this deployment and shown to the
      administrators next time they open the invitations page. When they approve it you will receive a one-time
      invitation link.</p>
      <p><a class="arag-btn" href="/">Back to the home page</a></p>
    `)
        : card(`
      <p class="sr-eyebrow">Invite only</p>
      <h1>Request partner access</h1>
      <p class="sr-lede">Tell us who you are and what you want to look at. An administrator reviews every request and
      issues a one-time invitation link with a role attached. No mailing list, no marketing, no third parties.</p>
      ${opts.error ? alert("danger", opts.error) : ""}
      <form method="post" action="/request-access" class="arag-stack">
        ${csrfInput(opts.csrf)}
        ${field({ name: "name", label: "Your name", value: v.name, required: true, autocomplete: "name", autofocus: true })}
        ${field({ name: "email", label: "Work email", type: "email", value: v.email, required: true, autocomplete: "email" })}
        ${field({ name: "organisation", label: "Organisation", value: v.organisation, required: true, autocomplete: "organization" })}
        <div class="sr-grid-2">
        ${select({
          name: "partnerType",
          label: "Partner type",
          options: PARTNER_TYPES.map((t) => ({
            value: t,
            label: PARTNER_TYPE_LABELS[t],
            selected: v.partnerType === t,
          })),
        })}
        ${select({
          name: "aragAccount",
          label: "Do you already have a Progress Agentic RAG account?",
          options: [
            {
              value: "unknown",
              label: "Not sure",
              selected: v.aragAccount !== "yes" && v.aragAccount !== "no",
            },
            { value: "yes", label: "Yes", selected: v.aragAccount === "yes" },
            { value: "no", label: "No", selected: v.aragAccount === "no" },
          ],
        })}
        </div>
        <fieldset class="sr-fieldset">
          <legend>Which products are you interested in?</legend>
          <div class="sr-check-grid">
          ${opts.products
            .map(
              (p) =>
                `<label class="sr-check"><input type="checkbox" name="products" value="${esc(p.slug)}"${
                  v.product === p.slug ? " checked" : ""
                }> <span>${esc(p.name)}</span></label>`,
            )
            .join("")}
          </div>
        </fieldset>
        <div class="arag-field">
          <label class="arag-label" for="f-message">What are you hoping to see?</label>
          <textarea class="arag-textarea" id="f-message" name="message" rows="4" maxlength="2000">${esc(v.message ?? "")}</textarea>
        </div>
        <button class="arag-btn lg" type="submit">Send partner access request</button>
        <p class="arag-help">Stored in this deployment only. Already have an account? <a href="/login">Sign in</a>.</p>
      </form>
    `)
    }
  </div>
</section>`,
  });
}

/** A synced programme document (the partner pilot playbook) rendered as a public page. */
export function programmePage(opts: {
  viewer: ViewerChrome | null;
  brand?: BrandChrome;
  title: string;
  html: string;
  hasMermaid: boolean;
}): string {
  return siteLayout({
    title: `${opts.title} — ARAG Showroom`,
    description: "Programme material for the Agentic RAG partner accelerator.",
    viewer: opts.viewer,
    brand: opts.brand,
    mermaid: opts.hasMermaid,
    body: `<section class="sr-section">
  <div class="sr-shell sr-prose">
    <p class="sr-eyebrow"><a href="/#programme">Programme</a></p>
    <article class="md-body">${opts.html}</article>
  </div>
</section>`,
  });
}

export const publicNav: NavLink[] = [
  { href: "/#products", label: "Products" },
  { href: "/#platform", label: "Platform" },
  { href: "/partners", label: "For partners" },
  { href: "/#roadmap", label: "Roadmap" },
];
