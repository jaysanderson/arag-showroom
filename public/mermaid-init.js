/**
 * Renders the ```mermaid blocks the markdown renderer emitted as <pre class="mermaid">. Loaded only
 * on pages that actually contain a diagram, and a no-op when the CDN is unreachable — the diagram
 * source stays on the page as readable text rather than an empty box.
 */
const mermaid = globalThis.mermaid;
if (mermaid) {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: dark ? "dark" : "neutral",
    fontFamily: "Inter, system-ui, sans-serif",
    themeVariables: { primaryColor: "#eef1fd", primaryBorderColor: "#4b4bf7", lineColor: "#55627a" },
  });
  try {
    // Mermaid measures label widths before it draws. If the web font is still loading it measures
    // the fallback and the text ends up clipped, so wait for the fonts first.
    if (document.fonts?.ready) await document.fonts.ready;
    await mermaid.run({ querySelector: "pre.mermaid" });
  } catch {
    /* leave the source visible */
  }
}
