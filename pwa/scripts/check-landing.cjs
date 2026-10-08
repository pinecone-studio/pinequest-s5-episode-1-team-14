const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright-core");

// Use the optional browser tooling documented in pwa/README.md.
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce", colorScheme: "light" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.url().includes("/landing/assets/") && ![200, 304].includes(response.status())) errors.push(`${response.status()} ${response.url()}`);
    });
    page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    const base = process.env.DASHBOARD_URL || "http://127.0.0.1:3100";
    assert.equal((await page.goto(base, { waitUntil: "networkidle" })).status(), 200);
    assert.equal(new URL(page.url()).pathname, "/", "landing stays at the root URL");
    assert.equal(await page.locator("html").getAttribute("lang"), "mn");
    assert.match(await page.getByRole("heading", { level: 1 }).textContent(), /AI 24\/7 монголоор хариулна/);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".hero-stick")).display === "grid");
    assert.equal(await page.locator("#steps > li").count(), 3);
    assert.equal(await page.locator("#clinicList > *").count(), 3);
    assert.equal(await page.locator("#callBtn").getAttribute("aria-disabled"), "true");
    assert.equal(await page.locator('a[href^="tel:"]').count(), 0, "no invented demo phone number");
    assert.equal(await page.locator("#chat > div").count(), 6, "reduced motion renders the complete demo immediately");

    const bookingButton = page.getByRole("button", { name: "Захиалга", exact: true });
    await bookingButton.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.getByRole("dialog").isVisible(), true);
    assert.equal(await page.locator("#tabB").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#tbl tr").count(), 6, "five demo bookings plus header");
    await page.getByRole("tab", { name: "Дуудлагын түүх" }).click();
    assert.equal(await page.locator("#tabC").getAttribute("aria-selected"), "true");
    assert.equal(await page.locator("#tbl tr").count(), 7, "six demo calls plus header");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").isVisible(), false);
    assert.equal(await bookingButton.evaluate((button) => button === document.activeElement), true);
    await page.getByRole("button", { name: "Дуудлагын түүх", exact: true }).click();
    assert.equal(await page.locator("#tabC").getAttribute("aria-selected"), "true");
    await page.getByRole("button", { name: "Хаах" }).click();
    assert.equal(await page.getByRole("dialog").isVisible(), false);

    await page.getByRole("link", { name: "Хэрхэн ажилладаг вэ", exact: true }).click();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(new URL(page.url()).hash, "#how");
    const themeButton = page.getByRole("button", { name: "Загвар солих" });
    await themeButton.click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
    await themeButton.click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark", "theme survives reload");
    await themeButton.click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), null, "auto theme restores system preference");

    const screenshots = resolve(__dirname, "../docs");
    mkdirSync(screenshots, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, "landing-desktop.png"), fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `landing overflow at ${width}px`);
      await bookingButton.click();
      const bounds = await page.getByRole("dialog").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width, `dialog fits at ${width}px`);
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(screenshots, "landing-mobile.png"), fullPage: true });
    await page.getByRole("link", { name: "Хянах самбар", exact: true }).click();
    await page.waitForURL(`${base}/dashboard`);
    assert.equal(await page.locator(".metric-card").count(), 6);
    assert.equal(await page.locator('script[src*="/landing/"]').count(), 0, "landing scripts do not load in the dashboard");
    assert.equal(await page.locator('link[href*="/landing/"]').count(), 0, "landing styles do not load in the dashboard");

    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal((await page.goto(`${base}/landing/index.html`, { waitUntil: "networkidle" })).status(), 200);
    await page.getByText("Цаг захиалагдлаа", { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator("#chat > div").count(), 6, "animated demo completes without duplicate bubbles");
    assert.deepEqual(errors, [], "no failed assets or browser runtime errors");
    console.log("Landing check passed: root route, assets, demo dialogs, themes, anchors, 5 widths, reduced/normal motion and dashboard navigation.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
