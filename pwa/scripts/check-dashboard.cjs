const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright-core");

// Optional local browser check; Playwright Core is not a production dependency.
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.DASHBOARD_URL || "http://127.0.0.1:3100";
    const response = await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    assert.equal(await page.locator("html").getAttribute("lang"), "mn");
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Ерөнхий тойм");
    assert.equal(await page.locator(".metric-card").count(), 6);
    assert.equal(await page.locator('.sidebar a[aria-current="page"]').count(), 1);
    assert.equal(await page.locator(".sidebar button:disabled").count(), 3);
    await page.keyboard.press("Tab");
    assert.equal(await page.locator(":focus").getAttribute("class"), "skip-link");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator(":focus").getAttribute("id"), "main-content");
    await page.getByRole("link", { name: "Холболтуудыг харах" }).click();
    assert.equal(await page.locator(":focus").getAttribute("id"), "connections");
    const screenshots = resolve(__dirname, "../docs");
    mkdirSync(screenshots, { recursive: true });
    assert.equal((await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" })).status(), 200);
    await page.screenshot({ path: resolve(screenshots, "dashboard-desktop.png"), fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow at ${width}px`);
      assert.equal(await page.locator(".sidebar").isVisible(), width > 800);
      assert.equal(await page.locator(".mobile-menu").isVisible(), width <= 800);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/dashboard`, { waitUntil: "networkidle" });
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.notEqual(await menu.getAttribute("open"), null, "keyboard opens the mobile menu");
    assert.equal(await menu.locator("button:disabled").count(), 3);
    await menu.getByRole("link", { name: "Ерөнхий тойм" }).click();
    assert.equal(await menu.getAttribute("open"), null, "navigation closes the mobile menu");
    assert.equal(await page.locator(":focus").evaluate((element) => element.tagName), "SUMMARY", "focus returns to the visible menu toggle");
    await menu.locator("summary").focus();
    await page.keyboard.press("Space");
    assert.notEqual(await menu.getAttribute("open"), null);
    await page.keyboard.press("Space");
    assert.equal(await menu.getAttribute("open"), null, "keyboard closes the mobile menu");
    await page.getByRole("heading", { level: 1 }).click();
    await page.screenshot({ path: resolve(screenshots, "dashboard-mobile.png"), fullPage: true });
    assert.deepEqual(errors, [], "no browser runtime or hydration errors");
    console.log("Dashboard browser check passed: direct route, keyboard navigation, mobile menu, 5 viewport widths, no runtime errors.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
