/**
 * Full-page reference screenshots of the public site at desktop and phone width, written to
 * `docs/screenshots/`. Run with `make screenshots`. These are review artefacts for the visual
 * quality of the marketing layer, not test assertions — the spec fails only if a page will not load.
 */
import { expect, test } from "@playwright/test";

const PAGES: Array<[string, string]> = [
  ["home", "/"],
  ["partners", "/partners"],
  ["request-access", "/request-access"],
  ["product-doc-processing", "/products/doc-processing"],
  ["product-call-analysis", "/products/call-analysis"],
  ["product-voicebridge", "/products/voicebridge"],
];

const WIDTHS: Array<[string, number, number]> = [
  ["desktop-1440", 1440, 1000],
  ["mobile-390", 390, 844],
];

for (const [label, width, height] of WIDTHS) {
  test(`public site at ${width}px`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    for (const [name, path] of PAGES) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      // Walk the whole page so lazy images start, then wait for every one of them to decode and
      // for Mermaid to draw. A full-page capture taken before that shows empty boxes.
      await page.evaluate(async () => {
        const step = window.innerHeight * 0.8;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1500);
      await page.evaluate(() =>
        Promise.all(
          Array.from(document.images).map((img) =>
            img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
          ),
        ),
      );
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `docs/screenshots/${name}-${label}.png`, fullPage: true });
    }
    await context.close();
  });
}
