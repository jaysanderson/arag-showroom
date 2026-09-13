#!/usr/bin/env node
/**
 * Copy each product repo's published material into `content/<slug>/` and write a manifest.
 *
 * The showroom does not read the product repos at runtime — it serves a committed snapshot, so the
 * portal keeps working when a sibling repo is mid-rebase, and so a deploy carries exactly the
 * content that was reviewed. This script is the only bridge between the two, it never writes to a
 * product repo, and it is idempotent: each product's content directory is rebuilt from scratch, so
 * files deleted upstream disappear here too.
 *
 *   make sync-content                 # every product in config/products.json
 *   node scripts/sync-content.ts call-analysis    # just one
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const CONTENT = join(ROOT, "content");

interface ProductConfig {
  slug: string;
  workingTitle: string;
  repo: string;
  demoUrl: string;
  adminUrl: string;
}

/** Markdown trees copied wholesale. */
const TREES = ["docs", "enablement"];
/** Individual files copied when present. */
const FILES = ["README.md", "CHANGELOG.md", "showcase/SCRIPT.md", "showcase/STORYBOARD.md"];

const ONE_LINER_HEADINGS = [
  "one-liner",
  "one line positioning",
  "one-line positioning",
  "positioning statement",
];

export function extractOneLiner(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i]?.match(/^#{2,3}\s+(.+?)\s*$/);
    if (!heading?.[1]) continue;
    const name = heading[1].toLowerCase().replace(/[*_`]/g, "").replace(/\s*—.*$/, "").trim();
    if (!ONE_LINER_HEADINGS.includes(name)) continue;
    const paragraph: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const line = (lines[j] ?? "").trim();
      if (line.startsWith("#")) break;
      if (!line) {
        if (paragraph.length) break;
        continue;
      }
      paragraph.push(line);
    }
    if (paragraph.length) return stripInline(paragraph.join(" "));
  }
  return "";
}

export function extractRecommendedName(markdown: string): string {
  const inline = markdown.match(/\*\*Recommendation:\s*([^*.:]+)[.:]?\*\*/i);
  if (inline?.[1]) return inline[1].trim();
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/^#{2,4}\s+Recommendation\s*$/i.test(lines[i] ?? "")) continue;
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const line = (lines[j] ?? "").trim();
      if (!line) continue;
      if (line.startsWith("#")) break;
      const bold = line.match(/\*\*([^*]+?)\.?\*\*/);
      if (bold?.[1]) return bold[1].replace(/^Recommendation:\s*/i, "").trim();
      return stripInline(line).split(/[.—]/)[0]?.trim() ?? "";
    }
  }
  return "";
}

function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function gitCommitCount(repo: string): number {
  try {
    const out = execFileSync("git", ["-C", repo, "rev-list", "--count", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

/**
 * Facts for the public site's traction strip. Everything here is counted from the repository the
 * content came from, never hand-typed, so the numbers on the marketing page cannot drift away from
 * the code. A fact we cannot measure is omitted rather than guessed.
 */
export function collectFacts(repo: string, dest: string): Record<string, unknown> {
  const facts: Record<string, unknown> = {
    commits: gitCommitCount(repo),
    endpoints: countEndpoints(join(dest, "docs", "developer", "api-reference.md")),
    tests: countTests(repo),
    testFiles: countTestFiles(repo),
    coverageLinesPct: findCoverage(repo),
    runtimeDependencies: countRuntimeDeps(repo),
    docPages: 0,
  };
  return facts;
}

function countEndpoints(apiReference: string): number {
  if (!existsSync(apiReference)) return 0;
  const text = readFileSync(apiReference, "utf8");
  return (text.match(/^###\s+`(GET|POST|PUT|PATCH|DELETE)\s+\//gm) ?? []).length;
}

function countTestFiles(repo: string): number {
  let count = 0;
  for (const dir of ["test", "tests", "src"]) {
    const base = join(repo, dir);
    if (!existsSync(base)) continue;
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(test|spec)\.(ts|tsx|js)$/.test(e.name)) count++;
      }
    };
    walk(base);
  }
  return count;
}

function countTests(repo: string): number {
  let count = 0;
  for (const dir of ["test", "tests"]) {
    const base = join(repo, dir);
    if (!existsSync(base)) continue;
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(test|spec)\.(ts|tsx|js)$/.test(e.name)) {
          const text = readFileSync(p, "utf8");
          count += (text.match(/^\s*(?:await\s+)?(?:test|it)\s*\(/gm) ?? []).length;
        }
      }
    };
    walk(base);
  }
  return count;
}

/** Coverage is reported in prose by the product teams; take the highest percentage they claim. */
function findCoverage(repo: string): number | null {
  let best: number | null = null;
  for (const file of ["CHANGELOG.md", "README.md", "STATUS.md", "AUDIT.md"]) {
    const p = join(repo, file);
    if (!existsSync(p)) continue;
    for (const m of readFileSync(p, "utf8").matchAll(/([0-9]{2}(?:\.[0-9])?)\s*%\s*(?:line\s*)?coverage/gi)) {
      const value = Number(m[1]);
      if (Number.isFinite(value) && (best === null || value > best)) best = value;
    }
  }
  return best;
}

function countRuntimeDeps(repo: string): number | null {
  const p = join(repo, "package.json");
  if (!existsSync(p)) return null;
  try {
    const pkg = JSON.parse(readFileSync(p, "utf8")) as { dependencies?: Record<string, string> };
    return Object.keys(pkg.dependencies ?? {}).length;
  } catch {
    return null;
  }
}

function gitCommit(repo: string): string {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", "--short=12", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function copyTree(from: string, to: string, filter: (rel: string) => boolean, rel = ""): number {
  if (!existsSync(from)) return 0;
  let count = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const childRel = rel ? `${rel}/${entry.name}` : entry.name;
    const src = join(from, entry.name);
    if (entry.isDirectory()) count += copyTree(src, to, filter, childRel);
    else if (entry.isFile() && filter(childRel)) {
      const dest = join(to, childRel);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest);
      count++;
    }
  }
  return count;
}

/** showcase/out may be absent (a repo that has not recorded yet) or nested one level under a run dir. */
function copyShowcaseOut(repo: string, dest: string): { screenshots: string[]; video: string | null } {
  const out = join(repo, "showcase", "out");
  const screenshots: string[] = [];
  if (!existsSync(out) || !statSync(out).isDirectory()) return { screenshots, video: null };
  const seen = new Set<string>();
  // The narrated MP4 (talk track muxed onto the recording) wins over the silent screencast.
  let narrated: string | null = null;
  let silent: string | null = null;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const src = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(src);
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (lower.endsWith(".png")) {
        if (seen.has(lower)) continue;
        seen.add(lower);
        const rel = `showcase/out/${entry.name}`;
        mkdirSync(dirname(join(dest, rel)), { recursive: true });
        cpSync(src, join(dest, rel));
        screenshots.push(rel);
      } else if (lower === "video-narrated.mp4") {
        narrated ??= src;
      } else if (lower === "video.webm") {
        silent ??= src;
      }
    }
  };
  walk(out);
  screenshots.sort((a, b) => a.localeCompare(b));
  let video: string | null = null;
  const chosen = narrated ?? silent;
  if (chosen) {
    const rel = narrated ? "showcase/out/video.mp4" : "showcase/out/video.webm";
    mkdirSync(dirname(join(dest, rel)), { recursive: true });
    cpSync(chosen, join(dest, rel));
    video = rel;
  }
  return { screenshots, video };
}

export function syncProduct(config: ProductConfig): Record<string, unknown> {
  const repo = resolve(ROOT, config.repo);
  const dest = join(CONTENT, config.slug);
  if (!existsSync(repo)) {
    console.warn(`! ${config.slug}: repo not found at ${repo} — leaving existing content untouched`);
    return { slug: config.slug, skipped: true };
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });

  let files = 0;
  for (const tree of TREES) files += copyTree(join(repo, tree), join(dest, tree), (r) => r.endsWith(".md"));
  for (const file of FILES) {
    const src = join(repo, file);
    if (!existsSync(src)) continue;
    mkdirSync(dirname(join(dest, file)), { recursive: true });
    cpSync(src, join(dest, file));
    files++;
  }
  const { screenshots, video } = copyShowcaseOut(repo, dest);

  const positioningFile = join(dest, "docs", "product-marketing", "positioning.md");
  const positioning = existsSync(positioningFile) ? readFileSync(positioningFile, "utf8") : "";
  const manifest = {
    slug: config.slug,
    title: config.workingTitle,
    recommendedName: extractRecommendedName(positioning),
    oneLiner: extractOneLiner(positioning),
    demoUrl: config.demoUrl,
    adminUrl: config.adminUrl,
    repo: basename(repo),
    commit: gitCommit(repo),
    syncedAt: new Date().toISOString(),
    files: files + screenshots.length + (video ? 1 : 0),
    screenshots,
    video,
  };
  const facts = collectFacts(repo, dest);
  facts.docPages = files;
  facts.screenshots = screenshots.length;
  facts.video = Boolean(video);
  writeFileSync(join(dest, "facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
  writeFileSync(join(dest, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `✓ ${config.slug}: ${files} markdown files, ${screenshots.length} screenshots, ${video ? "1 video" : "no video"} @ ${manifest.commit || "unknown commit"} · ${facts.commits} commits, ${facts.endpoints} endpoints, ${facts.tests} tests`,
  );
  return manifest;
}

/**
 * Copy the PMM lead's authored site copy, when the workspace has it. `marketing/site/*.json`
 * becomes `content/site/*.json` (preferred over parsing positioning.md at render time) and
 * `marketing/market.json` becomes `content/market.json` (the Market slot on the home page).
 * Absent sources are not an error: the showroom falls back to the synced documentation.
 */
export function syncMarketing(): { site: number; market: boolean; programme: number } {
  const source = resolve(ROOT, "../marketing");
  const siteDest = join(CONTENT, "site");
  let site = 0;
  let market = false;
  const siteSource = join(source, "site");
  if (existsSync(siteSource) && statSync(siteSource).isDirectory()) {
    rmSync(siteDest, { recursive: true, force: true });
    mkdirSync(siteDest, { recursive: true });
    for (const entry of readdirSync(siteSource, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      cpSync(join(siteSource, entry.name), join(siteDest, entry.name));
      site++;
    }
  }
  // Programme documents (the partner pilot playbook and anything beside it) become public pages.
  const programmeDest = join(CONTENT, "programme");
  let programme = 0;
  const programmeSources = [source, join(source, "programme")].filter(
    (d) => existsSync(d) && statSync(d).isDirectory(),
  );
  rmSync(programmeDest, { recursive: true, force: true });
  for (const dir of programmeSources) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
      mkdirSync(programmeDest, { recursive: true });
      cpSync(join(dir, entry.name), join(programmeDest, slugifyFile(entry.name)));
      programme++;
    }
  }
  const marketSource = join(source, "market.json");
  if (existsSync(marketSource)) {
    mkdirSync(CONTENT, { recursive: true });
    cpSync(marketSource, join(CONTENT, "market.json"));
    market = true;
  }
  console.log(
    site || market || programme
      ? `✓ marketing: ${site} site copy file(s), ${programme} programme doc(s)${market ? ", market.json" : ""}`
      : "· marketing: nothing to sync (../marketing not present)",
  );
  return { site, market, programme };
}

/** PARTNER-PILOT-PLAYBOOK.md → partner-pilot-playbook.md, so the URL is readable. */
function slugifyFile(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.md$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .concat(".md");
}

export function syncAll(only?: string[]): void {
  const configFile = join(ROOT, "config", "products.json");
  const { products } = JSON.parse(readFileSync(configFile, "utf8")) as { products: ProductConfig[] };
  const selected = only?.length ? products.filter((p) => only.includes(p.slug)) : products;
  if (!selected.length) {
    console.error(`No products matched ${only?.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(CONTENT, { recursive: true });
  for (const product of selected) syncProduct(product);
  syncMarketing();
}

if (import.meta.filename === process.argv[1]) syncAll(process.argv.slice(2));
