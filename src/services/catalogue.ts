/**
 * The product catalogue and the synced content tree.
 *
 * `config/products.json` names the products and where their live surfaces are; `content/<slug>/`
 * holds what `make sync-content` copied out of each product repo, with a `manifest.json` written by
 * the same script. This module is the only place that touches those files: it scans the tree once
 * at boot, derives a title for every page, classifies each page into a surface (so permission
 * checks are uniform), and resolves request paths safely — every lookup is confined to the product's
 * own content directory and can never escape it, whatever the URL says.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { badRequest, notFound } from "../../vendor/arag-platform/src/index.ts";
import { type Surface, surfaceForContentPath } from "../permissions.ts";
import { type HomeCopy, type MarketCopy, matchesProduct, type ProductCopy } from "./site-copy.ts";

export type { HomeCopy, MarketCopy, ProductCopy };

/** A feature card on a product page. Same shape as the marketing copy's `Titled`. */
export interface Capability {
  title: string;
  body: string;
}

export interface ProductConfig {
  slug: string;
  workingTitle: string;
  repo: string;
  accent?: string;
  summary?: string;
  demoUrl: string;
  adminUrl: string;
  docsUrl?: string;
  repoUrl?: string;
  demoUrlEnv?: string;
  adminUrlEnv?: string;
  adminTokenEnv?: string;
  capabilities?: Capability[];
  /** Customer-facing "what you get" cards, until the marketing copy supplies `customer.outcomes`. */
  outcomes?: Capability[];
  availableNow?: string[];
  roadmap?: string[];
}

/** Counted from the product repository at sync time — never hand-typed. */
export interface ProductFacts {
  commits?: number;
  endpoints?: number;
  tests?: number;
  testFiles?: number;
  coverageLinesPct?: number | null;
  runtimeDependencies?: number | null;
  docPages?: number;
  screenshots?: number;
  video?: boolean;
}

/** Optional market sizing supplied by the product-marketing lead in `content/market.json`. */

export interface ProductManifest {
  slug: string;
  title: string;
  recommendedName: string;
  oneLiner: string;
  demoUrl: string;
  adminUrl: string;
  repo: string;
  commit: string;
  syncedAt: string;
  files: number;
  screenshots: string[];
  video: string | null;
}

export interface ContentNode {
  /** Path relative to `content/<slug>/`, e.g. "docs/architecture/architecture.md". */
  path: string;
  /** Human title, taken from the first level-1 heading when there is one. */
  title: string;
  /** Nav grouping label. */
  section: string;
  /** Surface that gates this page. */
  surface: Surface;
  /** Size in bytes. */
  size: number;
}

export interface ContentSection {
  section: string;
  items: ContentNode[];
}

export interface Product {
  config: ProductConfig;
  manifest: ProductManifest | null;
  facts: ProductFacts;
  /** Authored copy overriding the parsed documentation, when the marketing lead has supplied it. */
  copy: ProductCopy;
  pages: ContentNode[];
  /** Screenshot asset paths relative to the content root, in order. */
  screenshots: string[];
  video: string | null;
  hasContent: boolean;
}

const SECTIONS: Array<{ prefix: string; section: string; order: number }> = [
  { prefix: "docs/developer/", section: "Developer", order: 3 },
  { prefix: "docs/architecture/", section: "Architecture", order: 4 },
  { prefix: "docs/business/", section: "Business", order: 2 },
  { prefix: "docs/product-marketing/", section: "Product marketing", order: 1 },
  { prefix: "enablement/developer-track/", section: "Enablement · developer track", order: 5 },
  { prefix: "enablement/architect-track/", section: "Enablement · architect track", order: 6 },
  { prefix: "enablement/", section: "Enablement", order: 7 },
  { prefix: "showcase/", section: "Showcase", order: 8 },
  { prefix: "docs/", section: "Documentation", order: 9 },
];

const SECTION_ORDER = new Map(SECTIONS.map((s) => [s.section, s.order]));
SECTION_ORDER.set("Overview", 0);

export const READABLE_EXTENSIONS = new Set([".md"]);
export const ASSET_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".webm", ".mp4"]);

export interface CatalogueOptions {
  /** Repo root; `config/` and `content/` are resolved beneath it. */
  root: string;
  /** Env used for per-deployment URL and admin-token overrides. */
  env?: Record<string, string | undefined>;
}

export class Catalogue {
  readonly root: string;
  readonly contentRoot: string;
  private readonly env: Record<string, string | undefined>;
  private products: Product[] = [];
  private marketData: MarketCopy | null = null;
  private homeCopy: HomeCopy = {};
  private siteCopy: ProductCopy[] = [];
  private programmeDocs: Array<{ slug: string; title: string; file: string }> = [];

  constructor(opts: CatalogueOptions) {
    this.root = resolve(opts.root);
    this.contentRoot = join(this.root, "content");
    this.env = opts.env ?? {};
    this.reload();
  }

  /** Re-read config and rescan the content tree (called at boot and by the admin refresh action). */
  /**
   * Re-read config and rescan the content tree (called at boot and after a content sync).
   * The authored copy is loaded first: `build()` attaches each product's copy as it goes.
   */
  reload(): void {
    const siteDir = join(this.contentRoot, "site");
    this.siteCopy =
      existsSync(siteDir) && statSync(siteDir).isDirectory()
        ? readdirSync(siteDir)
            .filter((f) => f.endsWith(".json") && f !== "home.json")
            .map((f) => readJson<ProductCopy>(join(siteDir, f)))
            .filter((c): c is ProductCopy => c !== null)
        : [];
    this.homeCopy = readJson<HomeCopy>(join(siteDir, "home.json")) ?? {};
    this.marketData = readJson<MarketCopy>(join(this.contentRoot, "market.json"));

    const programmeDir = join(this.contentRoot, "programme");
    this.programmeDocs =
      existsSync(programmeDir) && statSync(programmeDir).isDirectory()
        ? readdirSync(programmeDir)
            .filter((f) => f.endsWith(".md"))
            .sort()
            .map((f) => ({
              slug: f.replace(/\.md$/, ""),
              title: titleOf(join(programmeDir, f), f),
              file: join(programmeDir, f),
            }))
        : [];

    const configFile = join(this.root, "config", "products.json");
    const raw = existsSync(configFile)
      ? (JSON.parse(readFileSync(configFile, "utf8")) as { products?: ProductConfig[] })
      : { products: [] };
    this.products = (raw.products ?? []).map((config) => this.build(config));
  }

  /** Programme documents (the partner pilot playbook and anything beside it), served publicly. */
  programme(): Array<{ slug: string; title: string; file: string }> {
    return this.programmeDocs;
  }

  programmeDoc(slug: string): { slug: string; title: string; file: string } {
    const found = this.programmeDocs.find((d) => d.slug === slug);
    if (!found) throw notFound("Programme document");
    return found;
  }

  /** Authored home-page copy, when the PMM lead has supplied it. */
  home(): HomeCopy {
    return this.homeCopy;
  }

  /** Market sizing for the public home page, when the Head has supplied it. */
  market(): MarketCopy | null {
    return this.marketData;
  }

  /** Aggregate facts across every product, for the public traction strip. */
  totals(): { commits: number; endpoints: number; tests: number; docPages: number; products: number } {
    const sum = (pick: (f: ProductFacts) => number | null | undefined) =>
      this.products.reduce((acc, p) => acc + (pick(p.facts) ?? 0), 0);
    return {
      commits: sum((f) => f.commits),
      endpoints: sum((f) => f.endpoints),
      tests: sum((f) => f.tests),
      docPages: sum((f) => f.docPages),
      products: this.products.length,
    };
  }

  list(): Product[] {
    return this.products;
  }

  get(slug: string): Product {
    const found = this.products.find((p) => p.config.slug === slug);
    if (!found) throw notFound("Product");
    return found;
  }

  has(slug: string): boolean {
    return this.products.some((p) => p.config.slug === slug);
  }

  /** Demo URL for a product, honouring the per-deployment env override. */
  demoUrl(product: Product): string {
    const override = product.config.demoUrlEnv ? this.env[product.config.demoUrlEnv] : undefined;
    return override || product.config.demoUrl;
  }

  adminUrl(product: Product): string {
    const override = product.config.adminUrlEnv ? this.env[product.config.adminUrlEnv] : undefined;
    return override || product.config.adminUrl;
  }

  /** The product's own admin token, shown only to operators and admins. Empty when unset. */
  adminToken(product: Product): string {
    const name = product.config.adminTokenEnv ?? `SHOWROOM_ADMIN_TOKEN_${envSuffix(product.config.slug)}`;
    return this.env[name] ?? "";
  }

  adminTokenEnvName(product: Product): string {
    return product.config.adminTokenEnv ?? `SHOWROOM_ADMIN_TOKEN_${envSuffix(product.config.slug)}`;
  }

  /** Pages grouped into nav sections, filtered to the surfaces the caller may see. */
  sections(product: Product, allowed: Surface[], within?: string): ContentSection[] {
    const groups = new Map<string, ContentNode[]>();
    for (const page of product.pages) {
      if (within && !page.path.startsWith(within)) continue;
      if (!allowed.includes(page.surface)) continue;
      const list = groups.get(page.section) ?? [];
      list.push(page);
      groups.set(page.section, list);
    }
    return [...groups.entries()]
      .map(([section, items]) => ({ section, items }))
      .sort((a, b) => (SECTION_ORDER.get(a.section) ?? 99) - (SECTION_ORDER.get(b.section) ?? 99));
  }

  page(product: Product, path: string): ContentNode {
    const normalised = normaliseRelative(path);
    const found = product.pages.find((p) => p.path === normalised);
    if (!found) throw notFound("Page");
    return found;
  }

  /**
   * Absolute path of a file inside a product's content dir. The lexical check catches traversal in
   * the request; the `realpath` check catches a symlink inside the synced content that points
   * somewhere else — `content/` is populated from other repositories, so it is not wholly ours.
   */
  resolveFile(product: Product, path: string): string {
    const normalised = normaliseRelative(path);
    const base = resolve(join(this.contentRoot, product.config.slug));
    const target = resolve(join(base, normalised));
    if (target !== base && !target.startsWith(base + sep)) throw badRequest("Path escapes the content root.");
    if (!existsSync(target) || !statSync(target).isFile()) throw notFound("File");
    let real: string;
    let realBase: string;
    try {
      real = realpathSync(target);
      realBase = realpathSync(base);
    } catch {
      throw notFound("File");
    }
    if (real !== realBase && !real.startsWith(realBase + sep))
      throw badRequest("Path escapes the content root.");
    return real;
  }

  readPage(product: Product, path: string): { node: ContentNode; raw: string } {
    const node = this.page(product, path);
    return { node, raw: readFileSync(this.resolveFile(product, node.path), "utf8") };
  }

  // ── scanning ──

  private build(config: ProductConfig): Product {
    const dir = join(this.contentRoot, config.slug);
    const hasContent = existsSync(dir) && statSync(dir).isDirectory();
    let manifest: ProductManifest | null = null;
    const manifestFile = join(dir, "manifest.json");
    if (hasContent && existsSync(manifestFile)) {
      try {
        manifest = JSON.parse(readFileSync(manifestFile, "utf8")) as ProductManifest;
      } catch {
        manifest = null;
      }
    }
    const facts = (hasContent && readJson<ProductFacts>(join(dir, "facts.json"))) || {};
    const copy =
      this.siteCopy.find((c) =>
        matchesProduct(c, {
          slug: config.slug,
          workingTitle: config.workingTitle,
          recommendedName: manifest?.recommendedName ?? "",
          repo: manifest?.repo ?? "",
        }),
      ) ?? {};
    const pages: ContentNode[] = [];
    const screenshots: string[] = [];
    let video: string | null = null;
    if (hasContent) {
      for (const rel of walk(dir)) {
        const ext = extname(rel).toLowerCase();
        if (rel === "manifest.json" || rel === "facts.json") continue;
        if (READABLE_EXTENSIONS.has(ext)) {
          const abs = join(dir, rel);
          pages.push({
            path: rel,
            title: titleOf(abs, rel),
            section: sectionOf(rel),
            surface: surfaceForContentPath(rel),
            size: statSync(abs).size,
          });
        } else if (ASSET_EXTENSIONS.has(ext)) {
          if (ext === ".webm" || ext === ".mp4") video ??= rel;
          else if (rel.startsWith("showcase/")) screenshots.push(rel);
        }
      }
    }
    pages.sort((a, b) => a.path.localeCompare(b.path));
    screenshots.sort((a, b) => a.localeCompare(b));
    return { config, manifest, facts, copy, pages, screenshots, video, hasContent };
  }
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** SHOWROOM_ADMIN_TOKEN_<SLUG>: uppercase, dashes become underscores. */
export function envSuffix(slug: string): string {
  return slug.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

/** Reject absolute paths, traversal segments, NUL bytes and backslashes before they reach the fs. */
export function normaliseRelative(path: string): string {
  const value = String(path ?? "").replace(/^\/+/, "");
  if (value.includes("\0") || value.includes("\\")) throw badRequest("Invalid content path.");
  const parts = value.split("/").filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === "..")) throw badRequest("Invalid content path.");
  if (parts.length === 0) throw badRequest("A content path is required.");
  if (parts.length > 12) throw badRequest("Content path is too deep.");
  return parts.join("/");
}

function sectionOf(rel: string): string {
  for (const s of SECTIONS) if (rel.startsWith(s.prefix)) return s.section;
  return "Overview";
}

function titleOf(abs: string, rel: string): string {
  try {
    const head = readFileSync(abs, "utf8").slice(0, 4096);
    const match = head.match(/^#\s+(.+?)\s*$/m);
    if (match?.[1]) return match[1].replace(/[*_`]/g, "").trim().slice(0, 120);
  } catch {
    /* fall through to the filename */
  }
  const base = rel.split("/").pop() ?? rel;
  return base
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function walk(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}
