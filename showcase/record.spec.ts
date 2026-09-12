/**
 * Records the showroom's own showcase: video plus numbered screenshots into `showcase/out`.
 * Run with `make showcase` (which clears `showcase/out` and the e2e data directory first).
 *
 * The walkthrough follows the two-and-a-half minute script in SCRIPT.md: the public programme page,
 * one product page, then the invite-only portal from the administrator's side and the partner's.
 */
import { expect, type Page, test } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@showroom.test";
const ADMIN_PASSWORD = "lantern-quarry-fathom-77";
const ADMIN_NEW_PASSWORD = "burrow-kestrel-manifold-08";
const PARTNER_PASSWORD = "cobweb-plinth-argosy-45";

const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `showcase/out/${name}.png`, fullPage });
const beat = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Scroll to a section and let the sticky header settle before the still is taken. */
async function reveal(page: Page, selector: string, ms = 900): Promise<void> {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await beat(ms);
}

test("showroom showcase walkthrough", async ({ page, context }) => {
  test.setTimeout(180_000);

  // ── 1. The public programme page ──
  await page.goto("/");
  await expect(page.locator(".sr-hero-copy h1")).not.toBeEmpty();
  await expect(page.locator(".sr-hero-stats .sr-stat")).toHaveCount(4);
  await beat(1500);
  await shot(page, "01-home-hero");

  await reveal(page, "#platform");
  await beat(1800); // let Mermaid draw the platform diagram
  await shot(page, "02-platform");

  await reveal(page, "#partners-teaser");
  await shot(page, "03-for-partners");

  await reveal(page, "#products");
  await shot(page, "04-products");

  await reveal(page, "#market");
  await shot(page, "05-market");

  await reveal(page, "#traction");
  await shot(page, "06-traction");

  await reveal(page, "#roadmap");
  await shot(page, "07-roadmap");

  // ── 2. The partner programme ──
  await page.goto("/partners");
  await expect(page.locator("h1")).toContainText("under your own brand");
  await beat(1200);
  await shot(page, "06a-partners-hero");
  await reveal(page, "#models");
  await shot(page, "06b-engagement-models");
  await reveal(page, "#white-label");
  await shot(page, "06c-white-label");

  // ── 3. A product page ──
  await page.goto("/products/call-analysis");
  await expect(page.locator("h1").first()).not.toBeEmpty();
  await beat(1500);
  await shot(page, "08-product-hero");
  await reveal(page, "#outcomes");
  await shot(page, "09-what-you-get");
  await reveal(page, "#how");
  await beat(1500);
  await shot(page, "10-how-it-works");
  await reveal(page, "#proof");
  await shot(page, "10b-proof");

  // ── 4. Requesting partner access ──
  await page.goto("/request-access?product=call-analysis");
  await page.fill("#f-name", "Ada Okafor");
  await page.fill("#f-email", "ada@example-isv.com");
  await page.fill("#f-organisation", "Example ISV");
  await page.selectOption("#f-partnerType", "isv");
  await page.selectOption("#f-aragAccount", "no");
  await page.fill("#f-message", "We build claims software and want to white-label the document pipeline.");
  await beat(800);
  await shot(page, "11-request-partner-access");
  await page.click('form[action="/request-access"] button[type="submit"]');
  await expect(page.locator("h1")).toContainText("with the administrators");
  await beat(900);

  // ── 5. The administrator's side ──
  await page.goto("/login");
  await page.fill("#f-email", ADMIN_EMAIL);
  await page.fill("#f-password", ADMIN_PASSWORD);
  await beat(700);
  await shot(page, "12-sign-in");
  await page.click('button[type="submit"]');
  if (page.url().includes("/account")) {
    await page.fill("#f-currentPassword", ADMIN_PASSWORD);
    await page.fill("#f-newPassword", ADMIN_NEW_PASSWORD);
    await page.fill("#f-confirm", ADMIN_NEW_PASSWORD);
    await page.click('form[action="/account/password"] button[type="submit"]');
  }

  await page.goto("/admin/invites");
  await expect(page.locator("body")).toContainText("ada@example-isv.com");
  await beat(900);
  await shot(page, "13-access-requests", true);

  await page.fill("#f-email", "ada@example-isv.com");
  await page.fill("#f-name", "Ada Okafor");
  await page.selectOption("#f-role", "partner");
  await page.selectOption("#f-productRole\\:call-analysis", "operator");
  await beat(600);
  await page.click('form[action="/admin/invites"] button[type="submit"]');
  const inviteUrl = await page.locator("#invite-url").getAttribute("data-secret");
  expect(inviteUrl).toContain("/invite/");
  await beat(900);
  await shot(page, "14-invitation-created");

  await page.goto("/admin");
  await beat(800);
  await shot(page, "15-users", true);
  await page.goto("/admin/audit");
  await beat(800);
  await shot(page, "16-audit-log");

  // ── 6. The partner's side ──
  await page.context().clearCookies();
  const guest = await context.newPage();
  await guest.goto(inviteUrl as string);
  await expect(guest.locator("h1")).toContainText("Welcome");
  await guest.fill("#f-password", PARTNER_PASSWORD);
  await guest.fill("#f-confirm", PARTNER_PASSWORD);
  await beat(900);
  await shot(guest, "17-accept-invitation");
  await guest.click('button[type="submit"]');
  await expect(guest).toHaveURL(/\/portal/);
  await beat(1200);
  await shot(guest, "18-portal");

  await guest.goto("/p/call-analysis");
  await beat(1400);
  await shot(guest, "19-product-overview");

  await guest.goto("/p/call-analysis/docs/architecture/architecture.md");
  await expect(guest.locator(".sr-reader h1")).toBeVisible();
  await beat(2000); // Mermaid
  await shot(guest, "20-docs-browser");

  await guest.goto("/p/call-analysis/enablement");
  await beat(1000);
  await shot(guest, "21-enablement");

  await guest.goto("/p/call-analysis/showcase");
  await expect(guest.locator("video")).toBeVisible();
  await beat(1400);
  await shot(guest, "22-showcase");

  await guest.goto("/api/v1/docs");
  await beat(3000);
  await shot(guest, "23-api-reference");
  await guest.close();
});
