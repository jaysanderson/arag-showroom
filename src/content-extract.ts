/**
 * One short phrase per top-level list item ("**Deterministic handoff.** …" → "Deterministic handoff
 * — the voice prompt is contracted to…"). Used for the "why it wins" lists on the public pages.
 */
export function bulletLeads(markdown: string, max = 4): string[] {
  const out: string[] = [];
  for (const item of listItems(markdown)) {
    out.push(leadOf(item));
    if (out.length >= max) break;
  }
  return out.filter(Boolean);
}

/**
 * Top-level list items, each joined back into one string. Markdown wraps a long item across several
 * indented lines; reading only the first would cut the sentence in half, which is exactly what the
 * public "why it wins" list must not do.
 */
export function listItems(markdown: string): string[] {
  const out: string[] = [];
  let current: string[] | null = null;
  let inFence = false;
  const flush = () => {
    if (current?.length) out.push(current.join(" ").trim());
    current = null;
  };
  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const start = line.match(/^\s{0,3}[-*+]\s+(.+)$/);
    if (start?.[1]) {
      flush();
      current = [start[1].trim()];
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    // An indented continuation belongs to the item above; anything at column 0 ends the list.
    if (current && /^\s+\S/.test(line)) current.push(line.trim());
    else flush();
  }
  flush();
  return out;
}

/**
 * Pulling named sections out of the synced product documentation.
 *
 * The public product pages are assembled from the same markdown the gated docs browser serves —
 * there is no second copy of the marketing copy to drift out of date. Each page asks for a section
 * by a list of candidate heading names because the three product teams did not converge on
 * identical headings ("One-liner" vs "One-line positioning" vs "Positioning statement"), and the
 * showroom would rather match several spellings than force a rename in three repos.
 */

export interface Section {
  heading: string;
  level: number;
  /** Markdown body under the heading, with the heading line removed. */
  body: string;
}

const FENCE = /^\s{0,3}(```|~~~)/;

function normaliseHeading(text: string): string {
  return text
    .replace(/[*_`]/g, "")
    .replace(/\s*[—–-]\s.*$/, "")
    .replace(/[?:.]+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** All top-level-ish headings (levels 2–4) with the text that follows each. */
export function sections(markdown: string): Section[] {
  const lines = markdown.split(/\r?\n/);
  const out: Section[] = [];
  let inFence = false;
  let current: { heading: string; level: number; start: number } | null = null;
  const push = (end: number) => {
    if (!current) return;
    out.push({
      heading: current.heading,
      level: current.level,
      body: lines.slice(current.start, end).join("\n").trim(),
    });
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (FENCE.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!m?.[1] || !m[2]) continue;
    const level = m[1].length;
    if (current && level <= current.level) {
      push(i);
      current = null;
    }
    if (level >= 2 && level <= 4 && !current) current = { heading: m[2], level, start: i + 1 };
  }
  push(lines.length);
  return out.filter(Boolean);
}

/**
 * One readable phrase for a list item. A bold lead on its own is often a stub ("Public API:"), so
 * when it is short we carry the sentence that follows it across, joined with an em dash.
 */
/** Truncate on a word boundary so a phrase never ends mid-word. */
function clip(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).replace(/[\s,;:.—-]+$/, "")}…`;
}

function leadOf(text: string): string {
  const bold = text.match(/^\*\*(.+?)\*\*[:\s]*/);
  const head = bold?.[1] ? plainText(bold[1], 80).replace(/[:.\s]+$/, "") : "";
  const rest = plainText(bold ? text.slice(bold[0].length) : text, 200);
  if (!head) return clip(plainText(rest.split(/(?<=[.!?])\s/)[0] ?? rest, 118).replace(/[.\s]+$/, ""), 118);
  if (head.length >= 45 || !rest) return head;
  const tail = (rest.split(/(?<=[.!?])\s/)[0] ?? rest).replace(/[.\s]+$/, "");
  const joined = `${head} — ${tail.charAt(0).toLowerCase()}${tail.slice(1)}`;
  return clip(joined, 118);
}

/** The body of the first section whose heading matches one of `names` (case/dash insensitive). */
export function extractSection(markdown: string, names: string[]): string {
  if (!markdown) return "";
  const wanted = names.map(normaliseHeading);
  for (const section of sections(markdown)) {
    if (wanted.includes(normaliseHeading(section.heading))) return section.body;
  }
  return "";
}

/** Same, but keeps the heading so the rendered block still has its own title. */
export function extractSectionWithHeading(markdown: string, names: string[]): string {
  if (!markdown) return "";
  const wanted = names.map(normaliseHeading);
  for (const section of sections(markdown)) {
    if (wanted.includes(normaliseHeading(section.heading)))
      return `${"#".repeat(section.level)} ${section.heading}\n\n${section.body}`;
  }
  return "";
}

/** The first fenced ```mermaid block, fences included, or "". */
export function extractMermaid(markdown: string): string {
  const match = markdown.match(/^\s{0,3}```mermaid\s*\n([\s\S]*?)^\s{0,3}```\s*$/m);
  return match?.[1] ? `\`\`\`mermaid\n${match[1].replace(/\s+$/, "")}\n\`\`\`` : "";
}

/** The first prose paragraph of a document, skipping the title, blockquotes and code. */
export function firstParagraph(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const buffer: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer.length) break;
      continue;
    }
    if (trimmed.startsWith("#") || trimmed.startsWith(">") || trimmed.startsWith("|")) {
      if (buffer.length) break;
      continue;
    }
    buffer.push(trimmed);
  }
  return buffer.join(" ");
}

/** Collapse markdown to plain text for meta descriptions and OG cards. */
export function plainText(markdown: string, maxLength = 300): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\s|-]+/gm, " ")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  // Prefer ending on a sentence: a teaser that stops mid-clause reads as a bug, not as brevity.
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastStop > maxLength * 0.55) return cut.slice(0, lastStop + 1).trim();
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : maxLength).trim()}…`;
}
