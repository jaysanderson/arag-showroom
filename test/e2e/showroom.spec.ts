/**
 * End-to-end journeys in a real browser.
 *
 * The first spec is the one that matters: an administrator invites someone, that person opens the
 * one-time link, sets a password, signs in, browses the documentation, watches the showcase, and is
 * refused the administration area. Everything in between (roles, sessions, CSRF, content rendering)
 * has to work for that journey to pass.
 */
import { expect, type Page, test } from "@playwright/test";

const ADMIN_EMAIL = "e2e-admin@showroom.test";
const ADMIN_PASSWORD = "lantern-quarry-fathom-77";
/** The bootstrap administrator must choose this on first sign-in. */
const ADMIN_NEW_PASSWORD = "burrow-kestrel-manifold-08";

/** Sign in through the form, handling the forced password change on the very first run. */
async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.fill("#f-email", ADMIN_EMAIL);
  await page.fill("#f-password", ADMIN_PASSWORD);
  await page.click('button[type="submit"]');
  if (page.url().includes("/account")) {
    await expect(page.getByText("Password change required")).toBeVisible();
    await page.fill("#f-currentPassword", ADMIN_PASSWORD);
    await page.fill("#f-newPassword", ADMIN_NEW_PASSWORD);
    await page.fill("#f-confirm", ADMIN_NEW_PASSWORD);
    await page.click('form[action="/account/password"] button[type="submit"]');
    await expect(page).toHaveURL(/\/account\?changed=1/);
    return;
  }
  // A later run in the same data directory: the password has already been rotated.
  if (page.url().includes("/login")) {
    await page.fill("#f-email", ADMIN_EMAIL);
    await page.fill("#f-password", ADMIN_NEW_PASSWORD);
    await page.click('button[type="submit"]');
  }
  await expect(page).toHaveURL(/\/(portal|account)/);
}

test.describe.configure({ mode: "serial" });

test("public site: the programme, a product page and a partner access request", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sr-hero-copy h1")).not.toBeEmpty();
  await expect(page.locator(".sr-hero-stats .sr-stat")).toHaveCount(4);
  await expect(page.locator("#platform .sr-diagram")).toBeVisible();
  await expect(page.locator("#products .sr-product-band")).toHaveCount(3);
  // Each band leads with a real product screenshot, not a placeholder.
  await expect(page.locator("#products .sr-product-band img").first()).toBeVisible();

  // Partner mechanics live on their own page, reachable from the teaser and the nav.
  await page.locator('#partners-teaser a[href="/partners"]').click();
  await expect(page).toHaveURL(/\/partners$/);
  expect(await page.locator("#models article").count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator("#white-label > .sr-shell > h2")).toBeVisible();
  await page.goto("/");

  // Traction numbers come from the synced repositories, so they must be real digits.
  await expect(page.locator("#traction .sr-stat-value").first()).toHaveText(/\d/);

  await page.locator('#products a[href="/products/doc-processing"]').first().click();
  await expect(page).toHaveURL(/\/products\/doc-processing/);
  await expect(page.locator("h1").first()).not.toBeEmpty();
  // A customer-facing page: outcomes, capabilities with icons, how it works, proof — and no
  // partner mechanics anywhere on it.
  await expect(page.locator("#outcomes .sr-outcome")).not.toHaveCount(0);
  await expect(page.locator("#capabilities .sr-cap .sr-icon").first()).toBeVisible();
  await expect(page.locator("#how .sr-diagram")).toBeVisible();
  await expect(page.locator("#proof")).toBeVisible();
  await expect(page.locator("#showcase video")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Engagement models");
  // A gated surface is never linked with its content on a public page.
  await expect(page.locator("body")).not.toContainText("e2e-doc-processing-admin-token");

  await page.locator('a[href^="/request-access"]').first().click();
  await expect(page.locator("h1")).toContainText("Request partner access");
  await page.fill("#f-name", "Ada Partner");
  await page.fill("#f-email", "ada@isv.example");
  await page.fill("#f-organisation", "Partner Ltd");
  await page.selectOption("#f-partnerType", "isv");
  await page.selectOption("#f-aragAccount", "no");
  await page.fill("#f-message", "We build claims software and would like to evaluate all three.");
  await page.click('form[action="/request-access"] button[type="submit"]');
  await expect(page.locator("h1")).toContainText("with the administrators");
});

test("admin invites a partner, who accepts, browses the docs, watches the showcase and is refused /admin", async ({
  page,
  context,
}) => {
  await signInAsAdmin(page);

  // The access request from the public journey is waiting.
  await page.goto("/admin/invites");
  await expect(page.locator("body")).toContainText("ada@isv.example");

  await page.fill("#f-email", "e2e-partner@isv.example");
  await page.fill("#f-name", "E2E Partner");
  await page.selectOption("#f-role", "partner");
  await page.selectOption("#f-productRole\\:call-analysis", "operator");
  await page.click('form[action="/admin/invites"] button[type="submit"]');

  const inviteUrl = await page.locator("#invite-url").getAttribute("data-secret");
  expect(inviteUrl).toContain("/invite/");
  await page.context().clearCookies();

  // The invited person opens the link in a clean session.
  const guest = await context.newPage();
  await guest.goto(inviteUrl as string);
  await expect(guest.locator("h1")).toContainText("Welcome");
  await expect(guest.locator("body")).toContainText("e2e-partner@isv.example");
  await guest.fill("#f-password", "cobweb-plinth-argosy-45");
  await guest.fill("#f-confirm", "cobweb-plinth-argosy-45");
  await guest.click('button[type="submit"]');
  await expect(guest).toHaveURL(/\/portal/);
  await expect(guest.locator(".sr-card")).toHaveCount(3);

  // Browse the documentation.
  await guest.locator('.sr-card a[href="/p/doc-processing/docs"]').click();
  await expect(guest).toHaveURL(/\/p\/doc-processing\/docs/);
  await guest.locator('.sr-reader a[href*="/docs/business/overview.md"]').first().click();
  await expect(guest.locator(".sr-reader h1")).toBeVisible();
  await expect(guest.locator(".sr-source")).toContainText("arag-doc-processing/docs/business/overview.md");
  // The navigation is rendered twice (a collapsed <details> for narrow screens and the sidebar).
  await expect(guest.locator('.sr-docnav-side .sr-docnav a[aria-current="page"]')).toBeVisible();

  // Watch the showcase.
  await guest.goto("/p/doc-processing/showcase");
  await expect(guest.locator("video")).toBeVisible();
  await expect(guest.locator(".sr-gallery figure").first()).toBeVisible();

  // A partner is not a site administrator.
  await guest.goto("/admin");
  await expect(guest.locator("body")).toContainText("Administrator access is required");

  // ...but their per-product operator role does open Call Analysis's admin entry point.
  await guest.goto("/p/call-analysis");
  await expect(guest.getByRole("link", { name: /Open admin/ })).toBeVisible();
  await guest.goto("/p/doc-processing");
  await expect(guest.getByRole("link", { name: /Open admin/ })).toHaveCount(0);
  await guest.close();
});

test("a viewer sees marketing and docs but is refused enablement", async ({ page, context }) => {
  await signInAsAdmin(page);
  await page.goto("/admin");
  await page.fill("#f-email", "e2e-viewer@showroom.test");
  await page.fill("#f-name", "E2E Viewer");
  await page.selectOption("#f-role", "viewer");
  await page.click('form[action="/admin/users"] button[type="submit"]');
  const temporary = await page.locator(".sr-secret").first().textContent();
  expect(temporary).toBeTruthy();
  await page.context().clearCookies();

  const viewer = await context.newPage();
  await viewer.goto("/login");
  await viewer.fill("#f-email", "e2e-viewer@showroom.test");
  await viewer.fill("#f-password", (temporary as string).trim());
  await viewer.click('button[type="submit"]');
  await expect(viewer).toHaveURL(/\/account\?forced=1/);
  await viewer.fill("#f-currentPassword", (temporary as string).trim());
  await viewer.fill("#f-newPassword", "sundial-pennant-crozier-62");
  await viewer.fill("#f-confirm", "sundial-pennant-crozier-62");
  await viewer.click('form[action="/account/password"] button[type="submit"]');

  await viewer.goto("/portal");
  await expect(viewer.locator(".sr-card")).toHaveCount(3);
  await expect(viewer.locator(".sr-cards")).not.toContainText("Open demo");
  await viewer.goto("/p/doc-processing/enablement");
  await expect(viewer.locator("body")).toContainText("role does not include");
  await viewer.close();
});

test("signing out returns the visitor to the public site", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/portal");
  await page.click('form[action="/logout"] button[type="submit"]');
  await expect(page).toHaveURL(/\/login\?signedout=1/);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/login/);
});
