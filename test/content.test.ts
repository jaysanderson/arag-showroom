/**
 * The content layer: the catalogue's view of the synced tree, path safety, section extraction and
 * the manifest fields the sync script derives from each product's positioning document.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";
import { extractOneLiner, extractRecommendedName } from "../scripts/sync-content.ts";
import {
  bulletLeads,
  extractMermaid,
  extractSection,
  extractSectionWithHeading,
  firstParagraph,
  plainText,
  sections,
} from "../src/content-extract.ts";
import { Catalogue, envSuffix, normaliseRelative } from "../src/services/catalogue.ts";

const ROOT = resolve(import.meta.dirname ?? ".", "..");

/** A miniature content tree, so the assertions do not depend on what the product teams wrote today. */
function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "showroom-fixture-"));
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(
    join(root, "config", "products.json"),
    JSON.stringify({
      products: [
        {
          slug: "demo",
          workingTitle: "Demo Product",
          repo: "../demo",
          demoUrl: "https://demo.example",
          adminUrl: "https://demo.example/admin",
          demoUrlEnv: "DEMO_URL",
        },
        { slug: "empty", workingTitle: "Empty", repo: "../empty", demoUrl: "x", adminUrl: "y" },
      ],
    }),
  );
  const content = join(root, "content", "demo");
  for (const dir of [
    "docs/business",
    "docs/product-marketing",
    "enablement/developer-track/solutions",
    "showcase/out",
  ])
    mkdirSync(join(content, dir), { recursive: true });
  writeFileSync(join(content, "README.md"), "# Demo\n\nA demo.\n");
  writeFileSync(join(content, "docs/business/overview.md"), "# Overview\n\nWhat it does.\n");
  writeFileSync(join(content, "docs/product-marketing/partner-pitch.md"), "# Partner pitch\n");
  writeFileSync(join(content, "enablement/developer-track/LAB.md"), "# Lab\n");
  writeFileSync(join(content, "enablement/developer-track/solutions/01.md"), "# Solution 1\n");
  writeFileSync(join(content, "showcase/SCRIPT.md"), "# Script\n");
  writeFileSync(join(content, "showcase/out/01-home.png"), "not-really-a-png");
  writeFileSync(join(content, "showcase/out/video.webm"), "not-really-a-video");
  writeFileSync(
    join(content, "manifest.json"),
    JSON.stringify({ slug: "demo", recommendedName: "Recommended", oneLiner: "A one liner.", commit: "abc" }),
  );
  writeFileSync(join(content, "facts.json"), JSON.stringify({ commits: 7, endpoints: 12, tests: 40 }));
  return root;
}

describe("catalogue", () => {
  const catalogue = new Catalogue({ root: fixtureRoot(), env: { DEMO_URL: "http://localhost:9000" } });

  test("lists configured products and reports missing content rather than failing", () => {
    assert.deepEqual(
      catalogue.list().map((p) => p.config.slug),
      ["demo", "empty"],
    );
    assert.equal(catalogue.get("empty").hasContent, false);
    assert.equal(catalogue.get("empty").pages.length, 0);
    assert.throws(() => catalogue.get("nope"), /not found/i);
    assert.equal(catalogue.has("demo"), true);
  });

  test("reads the manifest and the generated facts", () => {
    const demo = catalogue.get("demo");
    assert.equal(demo.manifest?.recommendedName, "Recommended");
    assert.equal(demo.facts.endpoints, 12);
    assert.equal(catalogue.totals().endpoints, 12);
  });

  test("manifest.json and facts.json are not exposed as content pages", () => {
    const paths = catalogue.get("demo").pages.map((p) => p.path);
    assert.equal(paths.includes("manifest.json"), false);
    assert.equal(paths.includes("facts.json"), false);
  });

  test("titles come from the first heading, sections from the path", () => {
    const overview = catalogue.get("demo").pages.find((p) => p.path === "docs/business/overview.md");
    assert.equal(overview?.title, "Overview");
    assert.equal(overview?.section, "Business");
    assert.equal(overview?.surface, "docs");
  });

  test("assets are classified into screenshots and the recording", () => {
    const demo = catalogue.get("demo");
    assert.deepEqual(demo.screenshots, ["showcase/out/01-home.png"]);
    assert.equal(demo.video, "showcase/out/video.webm");
  });

  test("the nav tree is filtered to the surfaces the caller holds", () => {
    const demo = catalogue.get("demo");
    const viewer = catalogue.sections(demo, ["marketing", "docs", "showcase"]);
    const flat = viewer.flatMap((s) => s.items.map((i) => i.path));
    assert.equal(flat.includes("enablement/developer-track/LAB.md"), false);
    assert.equal(flat.includes("docs/product-marketing/partner-pitch.md"), false);
    assert.equal(flat.includes("docs/business/overview.md"), true);

    const partner = catalogue.sections(demo, ["docs", "enablement", "enablement-solutions", "partner-pitch"]);
    const partnerFlat = partner.flatMap((s) => s.items.map((i) => i.path));
    assert.equal(partnerFlat.includes("enablement/developer-track/solutions/01.md"), true);
    assert.equal(partnerFlat.includes("docs/product-marketing/partner-pitch.md"), true);
  });

  test("the tree can be scoped to a subdirectory", () => {
    const sectionsOnly = catalogue.sections(catalogue.get("demo"), ["enablement"], "enablement/");
    assert.ok(sectionsOnly.every((s) => s.items.every((i) => i.path.startsWith("enablement/"))));
  });

  test("env overrides the demo URL, and the admin token env name is derived from the slug", () => {
    const demo = catalogue.get("demo");
    assert.equal(catalogue.demoUrl(demo), "http://localhost:9000");
    assert.equal(catalogue.adminUrl(demo), "https://demo.example/admin");
    assert.equal(catalogue.adminTokenEnvName(demo), "SHOWROOM_ADMIN_TOKEN_DEMO");
    assert.equal(catalogue.adminToken(demo), "");
    assert.equal(envSuffix("doc-processing"), "DOC_PROCESSING");
  });

  test("reading a page returns the raw markdown", () => {
    const { node, raw } = catalogue.readPage(catalogue.get("demo"), "docs/business/overview.md");
    assert.equal(node.title, "Overview");
    assert.match(raw, /What it does/);
  });

  test("an unknown page is a 404", () => {
    assert.throws(() => catalogue.page(catalogue.get("demo"), "docs/nope.md"), /not found/i);
  });
});

describe("path safety", () => {
  test("traversal, absolute paths, backslashes and NUL bytes are refused", () => {
    for (const bad of [
      "../../../etc/passwd",
      "docs/../../../etc/passwd",
      "..",
      "docs/..%2f..%2fetc/passwd".replace(/%2f/g, "/"),
      "docs\\..\\secret",
      "docs/a\0.md",
      "",
      "/",
      "///",
      "a/".repeat(20) + "b",
    ])
      assert.throws(
        () => normaliseRelative(bad),
        /Invalid content path|required|too deep/,
        `accepted ${bad}`,
      );
  });

  test("legitimate paths are normalised, not mangled", () => {
    assert.equal(normaliseRelative("/docs/business/overview.md"), "docs/business/overview.md");
    assert.equal(normaliseRelative("docs/./business//overview.md"), "docs/business/overview.md");
    assert.equal(normaliseRelative("README.md"), "README.md");
  });

  test("resolveFile refuses to leave the product's content directory", () => {
    const catalogue = new Catalogue({ root: fixtureRoot() });
    const demo = catalogue.get("demo");
    assert.throws(() => catalogue.resolveFile(demo, "../empty/secret.md"), /Invalid content path/);
    assert.throws(() => catalogue.resolveFile(demo, "docs/../../../package.json"), /Invalid content path/);
    assert.throws(() => catalogue.resolveFile(demo, "docs/missing.md"), /not found/i);
    assert.ok(catalogue.resolveFile(demo, "README.md").endsWith("content/demo/README.md"));
  });
});

describe("section extraction", () => {
  const doc = `# Title

Intro paragraph that is not a section.

## One-liner

The product does a thing.

## Personas

**Someone**
Cares about outcomes.

## Proof points

- **First claim.** With detail that goes on.
- **Second claim.** More detail.
- A third claim without a bold lead. And a second sentence.
- **Fourth.** Detail.
- **Fifth should be dropped.** Detail.

## Architecture

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

## Not a heading inside a fence

\`\`\`
## This is code, not a heading
\`\`\`
`;

  test("sections are found by heading, case and dash insensitively", () => {
    assert.match(extractSection(doc, ["one-liner"]), /does a thing/);
    assert.match(extractSection(doc, ["ONE-LINER"]), /does a thing/);
    assert.match(extractSection(doc, ["Personas"]), /Cares about outcomes/);
    assert.equal(extractSection(doc, ["No such section"]), "");
    assert.equal(extractSection("", ["anything"]), "");
  });

  test("a section stops at the next heading of the same level", () => {
    const personas = extractSection(doc, ["Personas"]);
    assert.equal(personas.includes("Proof points"), false);
    assert.equal(personas.includes("First claim"), false);
  });

  test("headings inside fenced code are not treated as headings", () => {
    const all = sections(doc).map((s) => s.heading);
    assert.equal(all.includes("This is code, not a heading"), false);
    assert.ok(all.includes("Architecture"));
  });

  test("the heading can be kept for rendering", () => {
    assert.match(extractSectionWithHeading(doc, ["Personas"]), /^## Personas/);
    assert.equal(extractSectionWithHeading(doc, ["nope"]), "");
  });

  test("the first mermaid block is extracted with its fences", () => {
    const mermaid = extractMermaid(doc);
    assert.match(mermaid, /^```mermaid\n/);
    assert.match(mermaid, /flowchart LR/);
    assert.match(mermaid, /```$/);
    assert.equal(extractMermaid("# No diagram here"), "");
  });

  test("firstParagraph skips the title, quotes and code", () => {
    assert.equal(firstParagraph(doc), "Intro paragraph that is not a section.");
    assert.equal(firstParagraph("# T\n\n> a quote\n\nReal text."), "Real text.");
    assert.equal(firstParagraph("# T\n"), "");
  });

  test("bulletLeads makes a readable phrase from each item and caps the count", () => {
    const leads = bulletLeads(extractSection(doc, ["Proof points"]), 4);
    assert.equal(leads.length, 4);
    // A short bold lead is a stub on its own, so the sentence after it is carried across.
    assert.equal(leads[0], "First claim — with detail that goes on");
    assert.equal(leads[2], "A third claim without a bold lead");
    assert.equal(
      leads.some((l) => l.startsWith("Fifth")),
      false,
    );
    assert.deepEqual(bulletLeads("no bullets here"), []);
  });

  test("a long bold lead stands alone, and a very long phrase is truncated", () => {
    const long = "- **" + "A genuinely long claim that says everything on its own" + ".** Extra detail.";
    assert.equal(bulletLeads(long)[0], "A genuinely long claim that says everything on its own");
    const wordy = `- **Short lead.** ${"detail ".repeat(40)}.`;
    const [phrase] = bulletLeads(wordy);
    assert.ok((phrase ?? "").length <= 131, `too long: ${phrase?.length}`);
    assert.match(phrase ?? "", /^Short lead — detail/);
  });

  test("plainText strips markup and truncates on a word boundary", () => {
    assert.equal(plainText("**Bold** and `code` and [a link](http://x)"), "Bold and code and a link");
    const long = plainText("word ".repeat(200), 100);
    assert.ok(long.length <= 101);
    assert.match(long, /…$/);
  });
});

describe("manifest derivation", () => {
  test("the one-liner is found under any of the three headings the teams used", () => {
    assert.equal(extractOneLiner("## One-liner\n\nA. B.\n"), "A. B.");
    assert.equal(extractOneLiner("## One-line positioning\n\nWraps\nacross lines.\n"), "Wraps across lines.");
    assert.equal(extractOneLiner("## Positioning statement\n\nThird spelling.\n"), "Third spelling.");
    assert.equal(extractOneLiner("## Something else\n\nNope.\n"), "");
  });

  test("the recommended name is read from either recommendation style", () => {
    assert.equal(
      extractRecommendedName("### Recommendation\n\n**Fieldwork.** Because reasons.\n"),
      "Fieldwork",
    );
    assert.equal(
      extractRecommendedName("**Recommendation: GroundLine.** It names the mechanism"),
      "GroundLine",
    );
    assert.equal(
      extractRecommendedName("## Recommendation\n\nPlain prose wins. And more.\n"),
      "Plain prose wins",
    );
    assert.equal(extractRecommendedName("no recommendation at all"), "");
  });

  test("the committed content really does carry a manifest and facts for every product", () => {
    const catalogue = new Catalogue({ root: ROOT });
    assert.ok(catalogue.list().length >= 3);
    for (const product of catalogue.list()) {
      assert.ok(product.hasContent, `${product.config.slug} has no synced content`);
      assert.ok(product.manifest?.oneLiner, `${product.config.slug} has no one-liner`);
      assert.ok(product.manifest?.recommendedName, `${product.config.slug} has no recommended name`);
      assert.ok((product.facts.endpoints ?? 0) > 0, `${product.config.slug} has no endpoint count`);
      assert.ok(product.pages.length > 20, `${product.config.slug} has too few pages`);
    }
  });
});
