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
    const demo = process.env.EXPECT_MOCK_BOOKINGS === "true";
    assert.equal((await page.goto(`${base}/bookings`, { waitUntil: "networkidle" })).status(), 200);
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Захиалгууд");
    assert.equal(await page.locator('.sidebar a[aria-current="page"]').getAttribute("href"), "/bookings");
    assert.equal(await page.locator(".breadcrumb strong").textContent(), "Захиалгууд");
    const search = page.getByRole("searchbox", { name: "Нэр, утас, үйлчилгээ эсвэл ID" });
    const date = page.getByLabel("Өдөр · Улаанбаатар", { exact: true });
    const rows = page.locator(".booking-row");
    if (demo) {
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 1);
      assert.equal(await rows.count(), 6);
      assert.deepEqual(await rows.locator("button").allTextContents(), [2, 3, 1, 4, 5, 6].map((id) => `Дэлгэрэнгүй demo-booking-0${id}`), "earliest start first, not fixture order");
      assert.match(await rows.nth(1).textContent(), /Д. Саруул.*00000013.*Үс будах.*90 мин.*Баталгаажсан.*AI утасны туслах/);
      assert.equal(await rows.nth(3).locator("time").textContent(), "2026.10.09 00:15");
      await date.fill("2026-10-08");
      assert.equal(await rows.count(), 3);
      assert.equal(await page.getByRole("status").textContent(), "6 захиалгаас 3 харагдаж байна · Эхлэх цагаар өсөх дараалал");
      await date.fill("2026-10-09");
      assert.equal(await rows.count(), 3);
      assert.match(await rows.first().textContent(), /Н. Номин.*2026.10.09 00:15/, "filter uses Ulaanbaatar day across UTC midnight, not browser timezone");
      await search.fill(" +976 (0000) 0002 ");
      assert.equal(await rows.count(), 0, "search and local-day filter combine");
      assert.equal(await page.getByRole("heading", { name: "Тохирох захиалга олдсонгүй" }).count(), 1);
      await page.getByRole("button", { name: "Бүх захиалгыг харах" }).click();
      assert.equal(await rows.count(), 6);
      assert.equal(await search.inputValue(), "");
      assert.equal(await date.inputValue(), "");
      for (const query of [" +976 (0000) 0002 ", " ЭНХЖИН ", " DEMO-BOOKING-01 "]) {
        await search.fill(query);
        assert.equal(await rows.count(), 1);
        assert.match(await rows.first().textContent(), /А. Энхжин/);
      }
      await search.fill("үс будах");
      assert.equal(await rows.count(), 2, "service search");
      await search.fill("++");
      assert.equal(await rows.count(), 0, "punctuation cannot match every phone");
      await search.fill("");
      await date.fill("2026-10-10");
      assert.equal(await rows.count(), 0, "empty date");
      await page.getByRole("button", { name: "Цэвэрлэх", exact: true }).click();
      const details = rows.nth(2).getByRole("button");
      await details.focus();
      await page.keyboard.press("Enter");
      assert.equal(await details.getAttribute("aria-expanded"), "true");
      const detail = page.locator("#booking-detail-demo-booking-01");
      assert.equal(await detail.isVisible(), true);
      assert.match(await detail.textContent(), /demo-booking-01.*demo-event-01.*haircut.*2026.10.08 15:30/);
      await rows.first().getByRole("button").click();
      assert.equal(await detail.isVisible(), false, "only one expanded booking");
      await rows.first().getByRole("button").click();
      assert.equal(await page.locator("#booking-detail-demo-booking-02").isVisible(), false);
    } else {
      assert.equal(await rows.count(), 0);
      assert.equal(await page.getByText("Холболт хүлээж байна", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Захиалгын жагсаалт хараахан алга" }).count(), 1);
      assert.equal(await search.isDisabled(), true);
      assert.equal(await date.isDisabled(), true);
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 0);
    }
    const screenshots = resolve(__dirname, "../docs");
    mkdirSync(screenshots, { recursive: true });
    if (demo) {
      await page.getByRole("heading", { level: 1 }).click();
      await page.screenshot({ path: resolve(screenshots, "bookings-desktop.png"), fullPage: true });
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
      await page.screenshot({ path: resolve(screenshots, "bookings-mobile.png"), fullPage: true });
    }
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Дуудлагууд" }).click();
    await page.waitForURL(`${base}/calls`);
    await menu.locator("summary").click();
    await menu.getByRole("link", { name: "Захиалгууд" }).click();
    await page.waitForURL(`${base}/bookings`);
    assert.equal(await menu.getAttribute("open"), null);
    assert.equal(await menu.locator('a[aria-current="page"]').getAttribute("href"), "/bookings");
    assert.deepEqual(errors, [], "no runtime or hydration errors");
    console.log(`Bookings browser check passed (${demo ? "demo" : "unconfigured"}): data state, search/date filtering and details when enabled, navigation, five widths, no runtime errors.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
