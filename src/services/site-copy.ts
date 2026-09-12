/**
 * Authored marketing copy, synced from `../marketing/` into `content/site/` and `content/market.json`.
 *
 * The product-marketing lead owns the wording; this module owns nothing but the shape. When a file
 * is present its copy wins over anything the showroom would otherwise parse out of the engineering
 * documentation — marketing can tighten a sentence without a code change or a doc rewrite — and when
 * it is absent every page still renders from the synced docs. Everything that reaches a template
 * from here is turned into markdown and run through the sanitising renderer like any other content;
 * none of it is trusted as HTML.
 */

export interface Titled {
  title: string;
  body: string;
}

/**
 * The marketing files use both shapes for the same idea — `{title, body}` in one product's personas
 * and a single "Title — body" string in another's. Accepting both is cheaper than asking three
 * documents to be rewritten, and means a new file can never 500 a public page.
 */
export type TextItem = Titled | string;

export interface ProofPoint {
  label: string;
  value: string;
  source?: string;
}

export interface PartnerModel {
  model: string;
  body: string;
  requires?: string;
}

export interface RoadmapPhase {
  phase: string;
  items: string[];
}

export interface QandA {
  q: string;
  a: string;
}

export interface EnablementCopy {
  developerTrack?: string;
  architectTrack?: string;
  showcase?: string;
  docs?: string;
  deploy?: string;
}

/**
 * Customer-facing copy for the product landing page.
 *
 * A product page is a white-label asset: a partner deploys this portal under their own brand and
 * shows the page to *their* customers. So the words have to be benefit-led and vertical-neutral,
 * while the partner-facing material (white-label surface, extension points, enablement) lives on
 * `/partners` instead. The marketing lead keeps this block in `marketing/site/<product>.json`; when
 * it is absent the page falls back to the partner-facing fields, which read acceptably but are less
 * outcome-first.
 */
export interface CustomerCopy {
  /** Benefit-led hero headline, e.g. "Turn paperwork into data your systems can use." */
  headline?: string;
  subhead?: string;
  /** "What you get": the outcomes, not the features. */
  outcomes?: TextItem[];
  /** One concrete moment that makes the value obvious. */
  heroMoment?: string;
  /** Trust signals shown in the proof band; falls back to the engineering `proof` list. */
  proof?: ProofPoint[];
  trust?: string[];
  faq?: QandA[];
  cta?: { label?: string; body?: string };
}

/** `content/site/<product>.json`. Every field is optional. */
export interface ProductCopy {
  /** Customer-facing copy for the public product page. */
  customer?: CustomerCopy;
  slug?: string;
  name?: string;
  workingTitle?: string;
  oneLiner?: string;
  elevator?: string;
  heroMoment?: string;
  personas?: TextItem[];
  capabilities?: TextItem[];
  howItWorks?: string[] | string;
  whyItWins?: string[] | string;
  useCases?: TextItem[];
  partnerModels?: PartnerModel[];
  enablement?: EnablementCopy;
  roadmap?: RoadmapPhase[];
  faq?: QandA[];
  proof?: ProofPoint[];
}

/** `content/site/home.json`. */
export interface HomeCopy {
  hero?: { headline?: string; subhead?: string; body?: string };
  programme?: { name?: string; forProgress?: string[]; forPartners?: string[] };
  platform?: { title?: string; body?: string; capabilities?: TextItem[]; proof?: string };
  products?: Array<{
    slug?: string;
    name?: string;
    workingTitle?: string;
    oneLiner?: string;
    heroMoment?: string;
  }>;
  partnerModels?: PartnerModel[];
  enablement?: EnablementCopy;
  verifiability?: { title?: string; body?: string; evidence?: string[] };
  openSource?: { licence?: string; body?: string; points?: string[] };
  faq?: QandA[];
  ctas?: Array<{ label: string; body: string }>;
  pricing?: PricingCopy;
}

/** `home.json#pricing` — suggested on-sell price ranges for partners, shown on the home page. */
export interface PricingCopy {
  headline?: string;
  body?: string;
  principles?: string[];
  products?: Array<{
    slug?: string;
    name?: string;
    unit?: string;
    tiers?: Array<{ name: string; price: string; body?: string }>;
    anchors?: string;
  }>;
  caveat?: string;
}

/** `content/market.json` — sizing research, shown on the home page when present. */
export interface MarketCopy {
  framing?: { headline?: string; body?: string; primaryMetric?: string };
  caveats?: string[];
  progressContext?: {
    partnersNetwork?: { description?: string; programName?: string; tracks?: string[]; source?: string };
    financials?: Record<string, unknown>;
  };
  products?: Array<{
    slug?: string;
    name?: string;
    topDownTam?: string;
    cagr?: string;
    bottomUpCheck?: string;
    sam?: string;
    somYear3Base?: string;
    somYear3Low?: string;
    somYear3High?: string;
    biggestHole?: string;
  }>;
  combined?: { somThreeYearBase?: string; interpretation?: string };
  sources?: Array<{ label: string; path: string }>;
}

// ───────────────────────────── markdown projections ─────────────────────────────

/** Normalise either shape into `{title, body}`. A bare string splits on its first dash or colon. */
export function toTitled(item: TextItem | undefined): Titled | null {
  if (!item) return null;
  if (typeof item !== "string") {
    const title = typeof item.title === "string" ? item.title : "";
    const body = typeof item.body === "string" ? item.body : "";
    return title || body ? { title, body } : null;
  }
  const text = item.trim();
  if (!text) return null;
  const split = text.match(/^(.{3,70}?)\s+[—–-]\s+(.+)$/s) ?? text.match(/^(.{3,70}?):\s+(.+)$/s);
  return split?.[1] && split[2]
    ? { title: split[1].trim(), body: split[2].trim() }
    : { title: "", body: text };
}

/** A list of strings, whichever way the copy expressed it. */
export function toLines(value: string[] | string | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

/** `[{title, body}]` (or plain strings) → a run of headed sections. */
export function titledToMarkdown(items: TextItem[] | undefined, level = 3): string {
  if (!items?.length) return "";
  const hashes = "#".repeat(level);
  return items
    .map(toTitled)
    .filter((i): i is Titled => i !== null)
    .map((i) => (i.title ? `${hashes} ${escapeMarkdown(i.title)}\n\n${i.body}` : i.body))
    .join("\n\n");
}

/** The same items as cards, for the capability grid. */
export function toCapabilities(items: TextItem[] | undefined): Titled[] {
  return (items ?? []).map(toTitled).filter((i): i is Titled => i !== null && i.title !== "");
}

export function qandaToMarkdown(items: QandA[] | undefined): string {
  if (!items?.length) return "";
  return items
    .filter((i) => typeof i?.q === "string" && typeof i?.a === "string")
    .map((i) => `**${escapeMarkdown(i.q)}**\n\n${i.a}`)
    .join("\n\n");
}

export function stepsToMarkdown(steps: string[] | string | undefined): string {
  const lines = toLines(steps);
  if (!lines.length) return "";
  return lines.map((s, i) => `${i + 1}. ${s}`).join("\n");
}

export function bulletsToMarkdown(items: string[] | string | undefined): string {
  const lines = toLines(items);
  return lines.length ? lines.map((s) => `- ${s}`).join("\n") : "";
}

export function proofToMarkdown(points: ProofPoint[] | undefined): string {
  const rows = (points ?? [])
    .filter((p) => typeof p?.label === "string" && typeof p?.value === "string")
    .map((p) => `| ${cell(p.label)} | ${cell(p.value)} | ${cell(p.source ?? "")} |`);
  if (!rows.length) return "";
  return ["| Measure | Result | Source |", "| --- | --- | --- |", ...rows].join("\n");
}

export function enablementToMarkdown(enablement: EnablementCopy | undefined): string {
  if (!enablement) return "";
  const labels: Array<[keyof EnablementCopy, string]> = [
    ["developerTrack", "Developer track"],
    ["architectTrack", "Architect track"],
    ["showcase", "Showcase"],
    ["docs", "Documentation"],
    ["deploy", "Deployment"],
  ];
  return labels
    .filter(([key]) => typeof enablement[key] === "string" && enablement[key])
    .map(([key, label]) => `- **${label}.** ${enablement[key]}`)
    .join("\n");
}

/** Roadmap phases, tolerating a missing or malformed entry. */
export function toPhases(roadmap: RoadmapPhase[] | undefined): RoadmapPhase[] {
  return (roadmap ?? [])
    .filter((p) => typeof p?.phase === "string")
    .map((p) => ({ phase: p.phase, items: toLines(p.items) }))
    .filter((p) => p.items.length > 0);
}

/** Pipe characters would split a table cell; newlines would end the row. */
function cell(text: string): string {
  return text
    .replace(/\|/g, "\\|")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** Neutralise markdown control characters in text that is being placed into a heading. */
function escapeMarkdown(text: string): string {
  return text.replace(/([*_`[\]#])/g, "\\$1");
}

/**
 * Match a product to its copy file. The marketing repo keys products by its own slugs and working
 * titles (`document-processing`, `arag-doc-processing`) rather than the showroom's, so try every
 * identifier a product has before giving up.
 */
export function matchesProduct(
  copy: ProductCopy,
  identifiers: { slug: string; workingTitle: string; recommendedName: string; repo: string },
): boolean {
  const candidates = new Set(
    [copy.slug, copy.workingTitle, copy.name]
      .filter((v): v is string => typeof v === "string" && v.length > 0)
      .map((v) => v.toLowerCase()),
  );
  return [identifiers.slug, identifiers.workingTitle, identifiers.recommendedName, identifiers.repo]
    .filter(Boolean)
    .some((id) => candidates.has(id.toLowerCase()));
}
