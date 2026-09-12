/**
 * Zero-dependency Markdown → HTML renderer.
 *
 * Why a hand-rolled renderer instead of a library: this product renders operator-authored
 * and repo-sourced Markdown (docs, runbooks, notes) directly into pages served to users, so the
 * renderer's sanitisation behaviour is a security property of the product, not an implementation
 * detail we can outsource to a dependency we don't control the update cadence of. Keeping it
 * dependency-free also means it runs unmodified under Node's TypeScript type-stripping.
 *
 * Sanitisation guarantee: the renderer never copies source bytes into the output HTML without
 * passing them through `escapeHtml` first. There is no code path that trusts raw source text as
 * markup — inline HTML in the source (a literal `<div>`, a `<script>` tag, an `onerror` attribute)
 * is treated as plain text and escaped like any other character. The only attribute values the
 * renderer emits from source data are `href`/`src` on links and images, and those are always
 * passed through `sanitizeUrl` first, which rejects `javascript:`, `data:`, `vbscript:` and other
 * script-executing schemes (case-insensitively, tolerating whitespace/control-character and
 * percent-encoded obfuscation of the scheme delimiter) before the value is escaped and emitted.
 *
 * Design: a small block-level tokenizer (`parseBlocks`) turns the source into a tree of block
 * nodes (headings, paragraphs, lists, blockquotes, code fences, tables, thematic breaks). Each
 * block is then rendered to HTML; leaf text runs through the inline renderer (`renderInline`),
 * which is a single left-to-right scan handling emphasis, code spans, strikethrough, links,
 * images and autolinks. The inline scanner is deliberately linear (no backtracking regex on
 * attacker-controlled input) so pathological inputs (long runs of `*`, deeply nested emphasis)
 * cannot cause catastrophic backtracking.
 */

export interface MarkdownOptions {
  /** Rewrites a relative link target found in the source (e.g. "../architecture/x.md" or "./img.png").
   *  Return the URL to emit. If omitted, relative targets are emitted unchanged. */
  resolveLink?: (href: string) => string;
  /** Rewrites a relative image src. If omitted, falls back to resolveLink. */
  resolveImage?: (src: string) => string;
  /** Prefix for heading anchor ids (default ""). */
  idPrefix?: string;
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export interface MarkdownResult {
  html: string;
  headings: Heading[];
  /** text of the first level-1 heading, or "" */
  title: string;
  /** true if the document contains at least one ```mermaid block */
  hasMermaid: boolean;
}

/** Escape a string for safe HTML text/attribute context. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Slugify heading text into an anchor id (lowercase, alphanumerics + dashes, deduped by caller). */
export function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "section";
}

const DANGEROUS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** Strip control characters and ascii whitespace that can be used to obfuscate a scheme. */
function normalizeForSchemeCheck(href: string): string {
  // Decode a handful of percent-encoded characters commonly used to hide a colon, then drop
  // all whitespace/control characters that browsers historically ignore inside a scheme.
  let out = href;
  try {
    out = out.replace(/%0[9ad]/gi, "").replace(/%3a/gi, ":");
  } catch {
    // ignore malformed percent sequences
  }
  let stripped = "";
  for (const c of out) {
    if (c.charCodeAt(0) > 0x20) stripped += c;
  }
  return stripped.toLowerCase();
}

/** Returns true if `href` is a scheme known to be safe for emission (http/https/mailto), a
 *  protocol-relative URL, a fragment, or a relative path with no scheme at all. */
function isSanitizedUrl(href: string): { safe: boolean; external: boolean; mailto: boolean } {
  const trimmed = href.trim();
  if (trimmed.length === 0) return { safe: true, external: false, mailto: false };
  if (trimmed.startsWith("#")) return { safe: true, external: false, mailto: false };
  if (trimmed.startsWith("//")) return { safe: true, external: true, mailto: false };
  const normalized = normalizeForSchemeCheck(trimmed);
  const match = normalized.match(DANGEROUS_SCHEME);
  if (!match) {
    // no scheme at all -> relative path
    return { safe: true, external: false, mailto: false };
  }
  const scheme = match[0];
  if (SAFE_SCHEMES.has(scheme)) {
    return { safe: true, external: true, mailto: scheme === "mailto:" };
  }
  return { safe: false, external: false, mailto: false };
}

type LinkKind = "external" | "relative" | "fragment" | "unsafe";

interface ResolvedUrl {
  href: string;
  kind: LinkKind;
}

function resolveUrl(raw: string, resolve: ((href: string) => string) | undefined): ResolvedUrl {
  const { safe, external, mailto } = isSanitizedUrl(raw);
  if (!safe) {
    return { href: "#", kind: "unsafe" };
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("#")) {
    return { href: trimmed, kind: "fragment" };
  }
  if (external) {
    void mailto; // mailto is itself an "external" kind; distinguished later via the href prefix
    return { href: trimmed, kind: "external" };
  }
  const resolved = resolve ? resolve(trimmed) : trimmed;
  return { href: resolved, kind: "relative" };
}

// ---------------------------------------------------------------------------------------------
// Block-level tokenizer
// ---------------------------------------------------------------------------------------------

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "mermaid"; code: string }
  | { type: "hr" }
  | { type: "blockquote"; blocks: Block[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "table"; header: string[]; align: Align[]; rows: string[][] };

interface ListItem {
  lines: string[];
  children: Block[];
  checked?: boolean;
  hasCheckbox?: boolean;
  /** indent width of the first continuation line seen for this item, used to strip a consistent
   *  amount from later continuation lines so nested structure survives. */
  contIndent?: number;
}

type Align = "left" | "center" | "right" | null;

const HR_RE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)\s*$/;
const ORDERED_RE = /^(\d{1,9})[.)]\s+(.*)$/;
const UNORDERED_RE = /^[-*+]\s+(.*)$/;
const BLOCKQUOTE_RE = /^ {0,3}>\s?(.*)$/;

function isTableSeparatorRow(line: string): boolean {
  const cells = splitRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.trim()));
}

function splitRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) trimmed = trimmed.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      current += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function parseAlign(sepCell: string): Align {
  const t = sepCell.trim();
  const left = t.startsWith(":");
  const right = t.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** Count leading indentation width, treating a tab as 4 spaces. */
function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }
  return width;
}

function stripIndent(line: string, width: number): string {
  let consumed = 0;
  let i = 0;
  while (i < line.length && consumed < width) {
    const ch = line[i];
    if (ch === " ") consumed += 1;
    else if (ch === "\t") consumed += 4;
    else break;
    i++;
  }
  return line.slice(i);
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.trim().length === 0) {
      i++;
      continue;
    }

    // Fenced code block (also mermaid)
    const fenceMatch = line.match(FENCE_RE);
    if (fenceMatch) {
      const fenceChar = fenceMatch[1] ?? "```";
      const fenceMarker = fenceChar[0] ?? "`";
      const fenceLen = fenceChar.length;
      const lang = (fenceMatch[2] ?? "").trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] ?? "";
        const closing = l.match(FENCE_RE);
        const closingFence = closing?.[1] ?? "";
        if (closing && closingFence[0] === fenceMarker && closingFence.length >= fenceLen) {
          i++;
          break;
        }
        codeLines.push(l);
        i++;
      }
      // an unterminated fence simply consumes to EOF, which is fine (no throw, no hang)
      const code = codeLines.join("\n");
      if (lang.toLowerCase() === "mermaid") {
        blocks.push({ type: "mermaid", code });
      } else {
        blocks.push({ type: "code", lang, code });
      }
      continue;
    }

    // Thematic break
    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      const hashes = headingMatch[1] ?? "#";
      blocks.push({ type: "heading", level: hashes.length, text: headingMatch[2] ?? "" });
      i++;
      continue;
    }

    // Table: a header row immediately followed by a separator row
    const next = lines[i + 1];
    if (next !== undefined && line.includes("|") && isTableSeparatorRow(next)) {
      const header = splitRow(line).map((c) => c.trim());
      const align = splitRow(next).map(parseAlign);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.trim().length === 0 || !l.includes("|")) break;
        rows.push(splitRow(l).map((c) => c.trim()));
        i++;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    // Blockquote
    if (BLOCKQUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        const m = l.match(BLOCKQUOTE_RE);
        if (m) {
          inner.push(m[1] ?? "");
          i++;
        } else if (l.trim().length === 0) {
          // a blank line ends the blockquote unless followed by more '>' lines
          const peek = lines[i + 1];
          if (peek !== undefined && BLOCKQUOTE_RE.test(peek)) {
            inner.push("");
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }
      blocks.push({ type: "blockquote", blocks: parseBlocks(inner) });
      continue;
    }

    // Lists (ordered or unordered), possibly nested by indentation
    const orderedMatch = line.match(ORDERED_RE);
    const unorderedMatch = line.match(UNORDERED_RE);
    if (orderedMatch || unorderedMatch) {
      const ordered = Boolean(orderedMatch);
      const start = orderedMatch ? Number.parseInt(orderedMatch[1] ?? "1", 10) : 1;
      const baseIndent = indentWidth(line);
      const items: ListItem[] = [];
      while (i < lines.length) {
        const l = lines[i] ?? "";
        if (l.trim().length === 0) {
          // blank line: consume it; a following item at the same indent continues the list
          const peek = lines[i + 1];
          const peekIndent = peek !== undefined ? indentWidth(peek) : -1;
          const peekIsItem =
            peek !== undefined &&
            peekIndent === baseIndent &&
            (ORDERED_RE.test(peek.slice(peekIndent)) || UNORDERED_RE.test(peek.slice(peekIndent)));
          if (peekIsItem) {
            i++;
            continue;
          }
          break;
        }
        const thisIndent = indentWidth(l);
        if (thisIndent < baseIndent) break;
        const content = l.slice(thisIndent);
        if (thisIndent === baseIndent) {
          const om = content.match(ORDERED_RE);
          const um = content.match(UNORDERED_RE);
          if (!om && !um) break;
          if (Boolean(om) !== ordered) break;
          const text = (om ? om[2] : (um?.[1] ?? "")) ?? "";
          items.push({ lines: [text], children: [] });
          i++;
          continue;
        }
        // deeper indentation: belongs to the current (last) item, as a lazy continuation or
        // nested block — collect raw lines (indentation normalized) and parse them recursively.
        const last = items[items.length - 1];
        if (!last) break;
        if (last.contIndent === undefined) last.contIndent = thisIndent;
        last.lines.push(stripIndent(l, last.contIndent));
        i++;
      }
      for (const item of items) {
        const firstLine = item.lines[0] ?? "";
        const taskMatch = firstLine.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          item.hasCheckbox = true;
          item.checked = (taskMatch[1] ?? " ").toLowerCase() === "x";
          item.lines[0] = taskMatch[2] ?? "";
        }
        // continuation lines beyond the first belong to nested content; parse them as blocks
        // when there's more than one line, otherwise treat as a single inline text item.
        if (item.lines.length > 1) {
          const nestedSource = item.lines.slice(1);
          const nested = parseBlocks(nestedSource);
          item.children = nested;
        }
      }
      blocks.push({ type: "list", ordered, start, items });
      continue;
    }

    // Paragraph: consume until a blank line or a line that starts a new block type
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (l.trim().length === 0) break;
      if (
        HR_RE.test(l) ||
        HEADING_RE.test(l) ||
        FENCE_RE.test(l) ||
        BLOCKQUOTE_RE.test(l) ||
        ORDERED_RE.test(l) ||
        UNORDERED_RE.test(l)
      ) {
        break;
      }
      paraLines.push(l);
      i++;
    }
    blocks.push({ type: "paragraph", lines: paraLines });
  }
  return blocks;
}

// ---------------------------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------------------------

interface InlineCtx {
  resolveLink?: (href: string) => string;
  resolveImage?: (src: string) => string;
}

function renderLinkOrImage(
  isImage: boolean,
  label: string,
  href: string,
  title: string,
  ctx: InlineCtx,
): string {
  if (isImage) {
    const resolve = ctx.resolveImage ?? ctx.resolveLink;
    const resolved = resolveUrl(href, resolve);
    const src = resolved.kind === "unsafe" ? "#" : resolved.href;
    const titleAttr = title.length > 0 ? ` title="${escapeHtml(title)}"` : "";
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(label)}"${titleAttr} loading="lazy" />`;
  }
  const resolved = resolveUrl(href, ctx.resolveLink);
  const titleAttr = title.length > 0 ? ` title="${escapeHtml(title)}"` : "";
  const inner = renderInline(label, ctx);
  if (resolved.kind === "unsafe") {
    return `<a href="#" rel="nofollow"${titleAttr}>${inner}</a>`;
  }
  if (resolved.kind === "external") {
    const isMailto = resolved.href.trim().toLowerCase().startsWith("mailto:");
    const relTarget = isMailto ? "" : ' target="_blank" rel="noopener noreferrer"';
    const extBadge = isMailto ? "" : '<span class="md-ext" aria-hidden="true">↗</span>';
    return `<a href="${escapeHtml(resolved.href)}"${relTarget}${titleAttr}>${inner}${extBadge}</a>`;
  }
  return `<a href="${escapeHtml(resolved.href)}"${titleAttr}>${inner}</a>`;
}

/** Render inline markdown (emphasis, code, links, images, autolinks) into safe HTML. */
export function renderInline(text: string, ctx: InlineCtx = {}): string {
  let out = "";
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i] ?? "";

    // Escaped character
    if (ch === "\\" && i + 1 < n) {
      const next = text[i + 1] ?? "";
      if (/[\\`*_{}[\]()#+\-.!~>]/.test(next)) {
        out += escapeHtml(next);
        i += 2;
        continue;
      }
    }

    // Inline code span: backtick run of length k, closed by same-length run
    if (ch === "`") {
      let k = 0;
      while (text[i + k] === "`") k++;
      const fence = "`".repeat(k);
      const closeIdx = text.indexOf(fence, i + k);
      if (closeIdx !== -1) {
        let content = text.slice(i + k, closeIdx);
        if (content.startsWith(" ") && content.endsWith(" ") && content.trim().length > 0) {
          content = content.slice(1, -1);
        }
        out += `<code>${escapeHtml(content)}</code>`;
        i = closeIdx + k;
        continue;
      }
      out += escapeHtml(fence);
      i += k;
      continue;
    }

    // Autolink: <https://...> or <mailto:...>
    if (ch === "<") {
      const closeIdx = text.indexOf(">", i + 1);
      if (closeIdx !== -1) {
        const candidate = text.slice(i + 1, closeIdx);
        if (/^[a-z][a-z0-9+.-]*:[^\s<>]*$/i.test(candidate) && !/\s/.test(candidate)) {
          out += renderLinkOrImage(false, candidate, candidate, "", ctx);
          i = closeIdx + 1;
          continue;
        }
      }
      out += "&lt;";
      i += 1;
      continue;
    }

    // Image
    if (ch === "!" && text[i + 1] === "[") {
      const parsed = parseLinkLike(text, i + 1);
      if (parsed) {
        out += renderLinkOrImage(true, parsed.label, parsed.href, parsed.title, ctx);
        i = parsed.end;
        continue;
      }
    }

    // Link
    if (ch === "[") {
      const parsed = parseLinkLike(text, i);
      if (parsed) {
        out += renderLinkOrImage(false, parsed.label, parsed.href, parsed.title, ctx);
        i = parsed.end;
        continue;
      }
    }

    // Strong: ** or __
    if ((ch === "*" || ch === "_") && text[i + 1] === ch) {
      const marker = ch + ch;
      const end = findClosing(text, i + 2, marker);
      if (end !== -1 && end > i + 2) {
        out += `<strong>${renderInline(text.slice(i + 2, end), ctx)}</strong>`;
        i = end + 2;
        continue;
      }
    }

    // Strikethrough: ~~
    if (ch === "~" && text[i + 1] === "~") {
      const end = findClosing(text, i + 2, "~~");
      if (end !== -1 && end > i + 2) {
        out += `<del>${renderInline(text.slice(i + 2, end), ctx)}</del>`;
        i = end + 2;
        continue;
      }
    }

    // Emphasis: * or _
    if (ch === "*" || ch === "_") {
      const end = findClosing(text, i + 1, ch);
      if (end !== -1 && end > i + 1) {
        out += `<em>${renderInline(text.slice(i + 1, end), ctx)}</em>`;
        i = end + 1;
        continue;
      }
    }

    // Two trailing spaces at end of a rendered line become <br /> — handled by caller joining
    // lines, so here we just pass ordinary characters through escaped.
    out += escapeHtml(ch);
    i++;
  }

  return out;
}

/** Find the index of the next occurrence of `marker` at or after `from`, treating it as a plain
 *  substring search bounded to a reasonable scan (linear, no backtracking). */
function findClosing(text: string, from: number, marker: string): number {
  return text.indexOf(marker, from);
}

interface ParsedLink {
  label: string;
  href: string;
  title: string;
  end: number;
}

/** Parses `[label](href "title")` starting at the index of `[`. Returns null if malformed. */
function parseLinkLike(text: string, start: number): ParsedLink | null {
  if (text[start] !== "[") return null;
  let depth = 1;
  let i = start + 1;
  const n = text.length;
  while (i < n && depth > 0) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === "[") depth++;
    else if (text[i] === "]") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) return null;
  const label = text.slice(start + 1, i);
  let j = i + 1;
  if (text[j] !== "(") return null;
  j++;
  const parenStart = j;
  let parenDepth = 1;
  while (j < n && parenDepth > 0) {
    if (text[j] === "\\") {
      j += 2;
      continue;
    }
    if (text[j] === "(") parenDepth++;
    else if (text[j] === ")") parenDepth--;
    if (parenDepth === 0) break;
    j++;
  }
  if (parenDepth !== 0) return null;
  const inner = text.slice(parenStart, j);
  const { href, title } = splitHrefTitle(inner);
  return { label, href, title, end: j + 1 };
}

function splitHrefTitle(inner: string): { href: string; title: string } {
  const trimmed = inner.trim();
  const titleMatch = trimmed.match(/^(\S+)\s+"([^"]*)"\s*$/) ?? trimmed.match(/^(\S+)\s+'([^']*)'\s*$/);
  if (titleMatch) {
    return { href: titleMatch[1] ?? "", title: titleMatch[2] ?? "" };
  }
  return { href: trimmed, title: "" };
}

/** Join paragraph source lines, converting a trailing double-space (hard break) to <br />,
 *  and any other line break to a single space. */
function joinParagraphLines(lines: string[], ctx: InlineCtx): string {
  const parts: string[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx] ?? "";
    const hardBreak = / {2}$/.test(line) && idx < lines.length - 1;
    const rendered = renderInline(hardBreak ? line.replace(/ +$/, "") : line, ctx);
    parts.push(hardBreak ? `${rendered}<br />` : rendered);
  }
  return parts.join(" ").replace(/<br \/> /g, "<br />");
}

// ---------------------------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------------------------

interface RenderState {
  headings: Heading[];
  usedIds: Map<string, number>;
  hasMermaid: boolean;
  idPrefix: string;
  ctx: InlineCtx;
}

function allocateId(state: RenderState, text: string): string {
  const base = state.idPrefix + slugify(text);
  const count = state.usedIds.get(base) ?? 0;
  state.usedIds.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function renderBlocks(blocks: Block[], state: RenderState): string {
  return blocks.map((b) => renderBlock(b, state)).join("\n");
}

function renderBlock(block: Block, state: RenderState): string {
  switch (block.type) {
    case "heading": {
      const id = allocateId(state, block.text);
      state.headings.push({ level: block.level, text: block.text, id });
      const inner = renderInline(block.text, state.ctx);
      const anchor = `<a class="hdr-anchor" href="#${escapeHtml(id)}" aria-label="Link to this section">#</a>`;
      return `<h${block.level} id="${escapeHtml(id)}">${inner} ${anchor}</h${block.level}>`;
    }
    case "paragraph":
      return `<p>${joinParagraphLines(block.lines, state.ctx)}</p>`;
    case "code": {
      const cls = block.lang.length > 0 ? ` class="language-${escapeHtml(block.lang)}"` : "";
      return `<pre><code${cls}>${escapeHtml(block.code)}</code></pre>`;
    }
    case "mermaid":
      state.hasMermaid = true;
      return `<pre class="mermaid">${escapeHtml(block.code)}</pre>`;
    case "hr":
      return "<hr />";
    case "blockquote":
      return `<blockquote>\n${renderBlocks(block.blocks, state)}\n</blockquote>`;
    case "list":
      return renderList(block, state);
    case "table":
      return renderTable(block, state);
    default:
      return "";
  }
}

function renderList(block: Extract<Block, { type: "list" }>, state: RenderState): string {
  const tag = block.ordered ? "ol" : "ul";
  const startAttr = block.ordered && block.start !== 1 ? ` start="${block.start}"` : "";
  const items = block.items
    .map((item) => {
      const firstLine = item.lines[0] ?? "";
      const checkbox = item.hasCheckbox
        ? `<input type="checkbox" disabled${item.checked ? " checked" : ""} /> `
        : "";
      const inline = renderInline(firstLine, state.ctx);
      const children = item.children.length > 0 ? `\n${renderBlocks(item.children, state)}\n` : "";
      return `<li>${checkbox}${inline}${children}</li>`;
    })
    .join("\n");
  return `<${tag}${startAttr}>\n${items}\n</${tag}>`;
}

function renderTable(block: Extract<Block, { type: "table" }>, state: RenderState): string {
  const alignStyle = (a: Align) => (a ? ` style="text-align:${a}"` : "");
  const headCells = block.header
    .map((c, idx) => `<th${alignStyle(block.align[idx] ?? null)}>${renderInline(c, state.ctx)}</th>`)
    .join("");
  const bodyRows = block.rows
    .map((row) => {
      const cells = block.header
        .map((_, idx) => {
          const value = row[idx] ?? "";
          return `<td${alignStyle(block.align[idx] ?? null)}>${renderInline(value, state.ctx)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("\n");
  return (
    '<div class="md-table-wrap"><table class="arag-table">\n' +
    `<thead>\n<tr>${headCells}</tr>\n</thead>\n` +
    `<tbody>\n${bodyRows}\n</tbody>\n` +
    "</table></div>"
  );
}

// ---------------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------------

export function renderMarkdown(source: string, opts: MarkdownOptions = {}): MarkdownResult {
  const normalized = source.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks = parseBlocks(lines);

  const state: RenderState = {
    headings: [],
    usedIds: new Map(),
    hasMermaid: false,
    idPrefix: opts.idPrefix ?? "",
    ctx: { resolveLink: opts.resolveLink, resolveImage: opts.resolveImage },
  };

  const html = renderBlocks(blocks, state);
  const firstH1 = state.headings.find((h) => h.level === 1);

  return {
    html,
    headings: state.headings,
    title: firstH1 ? firstH1.text : "",
    hasMermaid: state.hasMermaid,
  };
}
