const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const { chromium } = require("playwright-core");

// Use the optional browser tooling documented in pwa/README.md.
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, colorScheme: "light", reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.DASHBOARD_URL || "http://127.0.0.1:3100";
    const go = async (path) => {
      assert.equal((await page.goto(`${base}${path}`, { waitUntil: "networkidle" })).status(), 200);
      await page.evaluate(() => document.fonts.ready);
    };
    const colors = () => page.evaluate(() => {
      const body = getComputedStyle(document.body);
      return { background: body.backgroundColor, color: body.color, font: body.fontFamily };
    });
    await go("/");
    const landingLight = await colors();
    assert.match(landingLight.font, /Manrope/);
    await page.getByRole("button", { name: "Загвар солих" }).click();
    await page.getByRole("button", { name: "Загвар солих" }).click();
    const landingDark = await colors();
    assert.notEqual(landingDark.background, landingLight.background);
    await page.getByRole("link", { name: "Хянах самбар", exact: true }).click();
    await page.waitForURL(`${base}/dashboard`);
    await page.getByRole("button", { name: "Загвар солих: бараан", exact: true }).waitFor();
    assert.deepEqual(await colors(), landingDark, "workspace inherits landing's saved palette and font");

    for (const route of ["dashboard", "calls", "bookings", "knowledge", "analytics"]) {
      await go(`/${route}`);
      assert.deepEqual(await colors(), landingDark, `${route} uses the shared dark theme`);
      assert.match(await page.locator("h1").evaluate((heading) => getComputedStyle(heading).fontFamily), /Unbounded/);
      assert.equal(await page.locator('.desktop-navigation a[aria-current="page"]').getAttribute("href"), `/${route}`);
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} dark overflow at ${width}px`);
      }
    }
    await page.screenshot({ path: resolve(__dirname, "../docs/workspace-dark-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").focus();
    await page.keyboard.press("Enter");
    await page.screenshot({ path: resolve(__dirname, "../docs/workspace-dark-mobile-menu.png"), fullPage: true });
    await menu.getByRole("link", { name: "Дуудлагууд", exact: true }).click();
    await page.waitForURL(`${base}/calls`);
    assert.equal(await menu.getAttribute("open"), null);
    assert.deepEqual(await colors(), landingDark, "client navigation preserves theme");
    await page.getByRole("button", { name: "Загвар солих: бараан", exact: true }).click();
    assert.deepEqual(await colors(), landingLight, "auto follows the light system theme");
    await page.emulateMedia({ colorScheme: "dark" });
    assert.deepEqual(await colors(), landingDark, "auto follows system changes");
    await page.getByRole("button", { name: "Загвар солих: автомат", exact: true }).click();
    assert.deepEqual(await colors(), landingLight, "explicit light overrides a dark system");
    await page.reload({ waitUntil: "networkidle" });
    assert.deepEqual(await colors(), landingLight, "workspace preference survives reload");
    await page.getByRole("link", { name: "AI Front-Desk — нүүр хуудас", exact: true }).click();
    await page.waitForURL(`${base}/`);
    assert.deepEqual(await colors(), landingLight, "landing inherits workspace preference");

    await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } });
    });
    await go("/dashboard");
    assert.deepEqual(await colors(), landingDark, "blocked storage falls back to the system theme");
    await page.getByRole("button", { name: "Загвар солих: автомат", exact: true }).click();
    assert.deepEqual(await colors(), landingLight, "theme button works without storage");
    assert.deepEqual(errors, [], "no theme or hydration runtime errors");
    console.log("Workspace theme check passed: all 5 routes/widths, landing parity, persisted/system themes, blocked storage, mobile navigation.");
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
