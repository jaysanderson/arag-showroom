/**
 * Inline SVG icons for the capability and outcome cards.
 *
 * Inline rather than a font or a CDN: the Content-Security-Policy allows no external images, the
 * icons must survive a partner white-labelling the portal (they inherit `currentColor`), and one
 * missing network request is one fewer way for a marketing page to look broken. Every icon is a
 * 24×24 stroke drawing on the same grid so a row of cards reads as one set.
 */

const ICONS = {
  document: "M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M14 3v5h5 M9 13h7 M9 17h5",
  extract: "M4 5h9 M4 10h6 M4 15h9 M4 20h5 M16 9l5 5-5 5 M21 14h-7",
  waveform: "M3 12h2 M7 7v10 M11 4v16 M15 8v8 M19 10v4 M22 12h-1",
  microphone: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Z M5 11a7 7 0 0 0 14 0 M12 18v3 M9 21h6",
  search: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z M16.5 16.5 21 21",
  shield: "M12 3 5 6v6c0 4.5 3 7.8 7 9 4-1.2 7-4.5 7-9V6l-7-3Z M9 12l2 2 4-4",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M22 20H2",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  layers: "M12 3 3 8l9 5 9-5-9-5Z M3 13l9 5 9-5 M3 18l9 5 9-5",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z M12 7v5l3 2",
  link: "M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1 M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1",
  people:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M2 20a7 7 0 0 1 14 0 M17 4.5a3.5 3.5 0 0 1 0 7 M18 14a6.5 6.5 0 0 1 4 6",
  plug: "M9 3v6 M15 3v6 M6 9h12v3a6 6 0 0 1-12 0V9Z M12 18v3",
  gauge: "M12 4a9 9 0 0 1 9 9 M3 13a9 9 0 0 1 9-9 M3 13h4 M17 13h4 M12 13l4-4",
} as const;

export type IconName = keyof typeof ICONS;

/** Icons are chosen by what the card says, so the set stays meaningful without hand-tagging copy. */
const KEYWORDS: Array<[RegExp, IconName]> = [
  [/\b(document|pdf|scan|invoice|form|paper|file)\b/i, "document"],
  [/\b(extract|field|schema|structur|record|canonical)\b/i, "extract"],
  [/\b(transcri|audio|recording|call|moment|paragraph)\b/i, "waveform"],
  [/\b(voice|speak|spoken|listen|microphone|conversation)\b/i, "microphone"],
  [/\b(search|find|query|ask|question|chat)\b/i, "search"],
  [/\b(cite|citation|ground|verif|trust|guard|safe|secur|compliance|redact)\b/i, "shield"],
  [/\b(dashboard|metric|analytic|report|score|aggregate|rate)\b/i, "chart"],
  [/\b(fast|latency|real-?time|stream|instant|live)\b/i, "bolt"],
  [/\b(api|endpoint|integrat|rest|webhook|embed)\b/i, "plug"],
  [/\b(persona|team|agent|reviewer|analyst|operator|customer)\b/i, "people"],
  [/\b(pipeline|stage|job|workflow|process|layer)\b/i, "layers"],
  [/\b(link|handoff|route|connect|bridge)\b/i, "link"],
  [/\b(minute|second|time|turnaround|wait)\b/i, "clock"],
];

/** A stable icon for a card, from its text; falls back to a deterministic rotation by position. */
export function iconFor(text: string, index = 0): IconName {
  for (const [pattern, name] of KEYWORDS) if (pattern.test(text)) return name;
  const rotation: IconName[] = ["bolt", "layers", "gauge", "search", "shield", "chart"];
  return rotation[index % rotation.length] as IconName;
}

/** Render one icon. `title` is omitted deliberately: these are decorative beside a real heading. */
export function icon(name: IconName): string {
  const path = ICONS[name];
  return `<svg class="sr-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${path
    .split(" M")
    .map((segment, i) => `<path d="${i === 0 ? segment : `M${segment}`}"/>`)
    .join("")}</svg>`;
}
