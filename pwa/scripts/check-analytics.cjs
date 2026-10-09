const assert = require("node:assert/strict");
const { mkdirSync } = require("node:fs");
const { resolve } = require("node:path");
const { chromium } = require("playwright-core");

// Optional local browser tooling; see pwa/README.md.
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, chromiumSandbox: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, timezoneId: "America/Los_Angeles" });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const base = process.env.DASHBOARD_URL || "http://127.0.0.1:3100";
    const demo = process.env.EXPECT_MOCK_ANALYTICS === "true";
    const response = await page.goto(`${base}/analytics`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    assert.doesNotMatch(await response.text(), /callerPhone|customerName|calendarEventId|demo-call-|demo-booking-/, "report payload excludes customer identifiers");
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Тайлан");
    assert.equal(await page.locator('.sidebar a[aria-current="page"]').getAttribute("href"), "/analytics");
    const date = page.getByLabel("Өдөр", { exact: true });
    const reset = page.getByRole("button", { name: "Бүх өдөр", exact: true });
    const metric = (label) => page.locator(".analytics-metric").filter({ has: page.getByText(label, { exact: true }) }).locator(".analytics-value");
    const rows = page.locator(".analytics-table tbody tr");
    assert.equal(await page.locator(".analytics-metric").count(), 6);
    assert.match(await metric("Тооцоолсон орлого").textContent(), /Мэдээлэл алга/);
    if (demo) {
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 1);
      for (const [label, value] of [["Нийт дуудлага", "6"], ["Дууссан дуудлага", "3"], ["Нийт захиалга", "6"], ["Захиалга болсон хувь", "20.0%"], ["Дундаж дуудлагын хугацаа", "1:26"]]) {
        assert.equal(await metric(label).textContent(), value);
      }
      assert.equal(await rows.count(), 2);
      assert.deepEqual(await rows.first().locator("th, td").allTextContents(), ["2026-10-08", "6", "3"]);
      assert.deepEqual(await rows.last().locator("th, td").allTextContents(), ["2026-10-09", "0", "3"]);
      assert.equal(await page.getByRole("region", { name: "Дуудлагын төлөв", exact: true }).getByRole("listitem").count(), 4);
      assert.match(await page.getByRole("region", { name: "Дуудлагын зорилго", exact: true }).textContent(), /Тодорхойгүй2/);
      await date.fill("2026-10-08");
      assert.equal(await metric("Нийт дуудлага").textContent(), "6", "UTC midnight call remains on its Ulaanbaatar day");
      assert.equal(await metric("Нийт захиалга").textContent(), "3");
      await date.fill("2026-10-09");
      assert.equal(await metric("Нийт дуудлага").textContent(), "0");
      assert.equal(await metric("Нийт захиалга").textContent(), "3", "booking day ignores browser timezone");
      assert.match(await metric("Захиалга болсон хувь").textContent(), /Мэдээлэл алга/);
      assert.match(await metric("Дундаж дуудлагын хугацаа").textContent(), /Мэдээлэл алга/);
      assert.equal(await rows.count(), 1);
      await date.fill("2026-10-10");
      assert.equal(await page.getByRole("heading", { name: "Сонгосон өдөр мэдээлэл алга" }).count(), 1);
      assert.equal(await metric("Нийт захиалга").textContent(), "0");
      assert.equal(await rows.count(), 0);
      await reset.focus(); await page.keyboard.press("Enter");
      assert.equal(await date.inputValue(), "");
      assert.equal(await rows.count(), 2);
      assert.equal(await reset.isDisabled(), true);
    } else {
      assert.equal(await date.isDisabled(), true);
      assert.equal(await reset.isDisabled(), true);
      assert.equal(await page.getByText("Холболт хүлээж байна", { exact: true }).count(), 1);
      assert.equal(await page.locator(".analytics-value .sr-only").count(), 6, "unconfigured metrics are unavailable, not zero");
      assert.equal(await rows.count(), 0);
      assert.equal(await page.getByRole("heading", { name: "Тайлан хараахан бэлэн болоогүй" }).count(), 1);
    }
    const screenshots = resolve(__dirname, "../docs");
    mkdirSync(screenshots, { recursive: true });
    await page.getByRole("heading", { level: 1 }).click();
    if (demo) await page.screenshot({ path: resolve(screenshots, "analytics-desktop.png"), fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    if (demo) {
      await page.getByRole("heading", { level: 1 }).click();
      await page.screenshot({ path: resolve(screenshots, "analytics-mobile.png"), fullPage: true });
      const scroll = page.getByRole("region", { name: "Өдрийн тайлан, хажуу тийш гүйлгэнэ" });
      await scroll.focus(); await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector(".calls-table-scroll").scrollLeft > 0);
      await scroll.evaluate((element) => { element.scrollLeft = 0; });
    }
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").click(); await menu.getByRole("link", { name: "Дуудлагууд", exact: true }).click();
    await page.waitForURL(`${base}/calls`);
    await menu.locator("summary").click(); await menu.getByRole("link", { name: "Тайлан", exact: true }).click();
    await page.waitForURL(`${base}/analytics`);
    assert.equal(await menu.getAttribute("open"), null);
    assert.equal(await menu.locator('a[aria-current="page"]').getAttribute("href"), "/analytics");
    assert.deepEqual(errors, [], "no runtime or hydration errors");
    console.log(`Analytics browser check passed (${demo ? "demo" : "unconfigured"}): metrics, date filter, empty states, timezone, privacy, navigation and 5 widths.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
