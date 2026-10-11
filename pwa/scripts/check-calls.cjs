const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: "America/Los_Angeles" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.DASHBOARD_URL || "http://127.0.0.1:3100";
    const demo = process.env.EXPECT_MOCK_CALLS === "true";
    assert.equal((await page.goto(`${base}/calls`, { waitUntil: "networkidle" })).status(), 200);
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Дуудлагууд");
    assert.equal(await page.locator('.desktop-navigation a[aria-current="page"]').getAttribute("href"), "/calls");
    assert.equal(await page.locator(".breadcrumb strong").textContent(), "Дуудлагууд");
    const search = page.getByRole("searchbox", { name: "Утас эсвэл дуудлагын ID" });
    const status = page.getByRole("combobox", { name: "Төлөв" });
    const rows = page.locator(".call-row");
    if (demo) {
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 1);
      assert.equal(await rows.count(), 6);
      assert.deepEqual(await rows.locator("small").allTextContents(), Array.from({ length: 6 }, (_, index) => `demo-call-0${index + 1}`));
      assert.match(await rows.nth(1).textContent(), /3:24.*Цаг захиалах.*Үүссэн.*Дууссан/);
      assert.match(await rows.nth(3).textContent(), /Дугаар тодорхойгүй.*0:00.*Тодорхойгүй.*Амжилтгүй/);
      assert.match(await rows.last().locator("time").textContent(), /2026.*10.*08.*00:15/, "Ulaanbaatar date crosses UTC midnight, regardless of browser timezone");
      for (const [value, count] of [["active", 1], ["completed", 3], ["failed", 1], ["handed_off", 1]]) {
        await status.selectOption(value);
        assert.equal(await rows.count(), count);
      }
      await page.getByRole("button", { name: "Цэвэрлэх", exact: true }).click();
      await search.fill(" +976 (0000) 0002 ");
      assert.equal(await rows.count(), 1, "formatted phone search");
      await status.selectOption("failed");
      assert.equal(await rows.count(), 0, "search and status combine");
      assert.equal(await page.getByRole("heading", { name: "Тохирох дуудлага олдсонгүй" }).count(), 1);
      await page.getByRole("button", { name: "Бүх дуудлагыг харах" }).click();
      assert.equal(await rows.count(), 6);
      assert.equal(await search.inputValue(), "");
      assert.equal(await status.inputValue(), "");
      await search.fill(" DEMO-CALL-05 ");
      assert.equal(await rows.count(), 1, "trimmed case-insensitive ID search");
      await search.fill("++");
      assert.equal(await rows.count(), 0, "punctuation must not match every phone");
      await search.fill("");
      const details = rows.nth(1).getByRole("button");
      await details.focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator("#call-detail-demo-call-02").isVisible(), true);
      assert.match(await page.locator("#call-detail-demo-call-02").textContent(), /demo-booking-01/);
      await page.getByRole("button", { name: "Дэлгэрэнгүй demo-call-01", exact: true }).click();
      assert.equal(await page.locator("#call-detail-demo-call-02").isVisible(), false);
      assert.match(await page.locator("#call-detail-demo-call-01").textContent(), /Дуусаагүй/);
      await page.getByRole("button", { name: "Хураах demo-call-01", exact: true }).click();
      assert.equal(await page.locator("#call-detail-demo-call-01").isVisible(), false);
    } else {
      assert.equal(await rows.count(), 0);
      assert.equal(await page.getByText("Холболт хүлээж байна", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Дуудлагын түүх хараахан алга" }).count(), 1);
      assert.equal(await search.isDisabled(), true);
      assert.equal(await status.isDisabled(), true);
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 0);
    }
    const screenshots = resolve(__dirname, "../docs");
    mkdirSync(screenshots, { recursive: true });
    if (demo) {
      await page.getByRole("heading", { level: 1 }).click();
      await page.screenshot({ path: resolve(screenshots, "calls-desktop.png"), fullPage: true });
    }
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (demo) {
      const scroll = page.locator(".calls-table-scroll");
      await scroll.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector(".calls-table-scroll").scrollLeft > 0);
      await scroll.evaluate((element) => { element.scrollLeft = 0; });
      await page.getByRole("heading", { level: 1 }).click();
      await page.screenshot({ path: resolve(screenshots, "calls-mobile.png"), fullPage: true });
    }
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Ерөнхий тойм" }).click();
    await page.waitForURL(`${base}/dashboard`);
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Дуудлагууд" }).click();
    await page.waitForURL(`${base}/calls`);
    assert.equal(await menu.getAttribute("open"), null, "mobile navigation closes after route change");
    assert.equal(await menu.locator('a[aria-current="page"]').getAttribute("href"), "/calls");
    assert.deepEqual(errors, [], "no runtime or hydration errors");
    console.log(`Calls browser check passed (${demo ? "demo" : "unconfigured"}): data state, filters/details when enabled, timezone, navigation, keyboard scroll, 5 viewport widths.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
