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
    const demo = process.env.EXPECT_MOCK_KNOWLEDGE === "true";
    assert.equal((await page.goto(`${base}/knowledge`, { waitUntil: "networkidle" })).status(), 200);
    assert.equal(await page.getByRole("heading", { level: 1 }).textContent(), "Мэдээллийн сан");
    assert.equal(await page.locator('.sidebar a[aria-current="page"]').getAttribute("href"), "/knowledge");
    const cards = page.getByRole("article");
    const search = page.getByRole("searchbox", { name: "Гарчиг, агуулга эсвэл ID" });
    const category = page.getByRole("combobox", { name: "Ангиллаар шүүх", exact: true });
    const status = page.getByRole("combobox", { name: "Төлөв", exact: true });
    const add = page.getByRole("button", { name: "Мэдээлэл нэмэх", exact: true });
    const form = page.getByRole("form");
    const title = form.getByRole("textbox", { name: "Гарчиг", exact: true });
    const content = form.getByRole("textbox", { name: "Агуулга", exact: true });
    const price = form.getByRole("spinbutton", { name: "Үнэ (₮, заавал биш)", exact: true });
    const approval = form.getByRole("checkbox");
    const save = form.getByRole("button", { name: "Туршилтад хадгалах" });
    if (demo) {
      assert.equal(await cards.count(), 7);
      assert.equal(await page.getByText("Туршилтын өгөгдөл", { exact: true }).count(), 1);
      assert.equal(await cards.first().getByRole("heading").textContent(), "Манай салон");
      assert.equal(await cards.last().locator("time").textContent(), "2026.10.08 00:15");
      for (const value of ["business_info", "opening_hours", "service", "product", "faq", "policy", "promotion"]) {
        await category.selectOption(value); assert.equal(await cards.count(), 1);
      }
      assert.equal(await cards.first().locator(".knowledge-price").textContent(), "0 ₮");
      await status.selectOption("active");
      assert.equal(await cards.count(), 0, "category and approval combine");
      await page.getByRole("button", { name: "Бүх мэдээллийг харах" }).click();
      await status.selectOption("active"); assert.equal(await cards.count(), 5);
      await status.selectOption("draft"); assert.equal(await cards.count(), 2);
      await page.getByRole("button", { name: "Цэвэрлэх", exact: true }).click();
      for (const query of [" МАНАЙ САЛОН ", "маникюрын", " DEMO-KNOWLEDGE-01 "]) {
        await search.fill(query); assert.equal(await cards.count(), 1);
      }
      await search.fill("no match"); assert.equal(await cards.count(), 0);
      await page.getByRole("button", { name: "Бүх мэдээллийг харах" }).click();
      await add.focus(); await page.keyboard.press("Enter");
      assert.equal(await title.evaluate((element) => element === document.activeElement), true);
      assert.equal(await approval.isChecked(), false);
      await save.click(); assert.equal(await form.count(), 1, "required fields block an empty save");
      await title.fill("   "); await content.fill("Туршилтын агуулга"); await save.click();
      assert.equal(await form.getByRole("alert").count(), 1, "whitespace title rejected");
      await title.fill("  Шинэ жишээ  "); await content.fill("   "); await save.click();
      assert.equal(await form.getByRole("alert").count(), 1, "whitespace content rejected");
      await content.fill("Туршилтын агуулга"); await price.fill("-1"); await save.click();
      assert.equal(await price.evaluate((element) => element.validity.rangeUnderflow), true);
      assert.equal(await cards.count(), 7, "invalid input cannot add a record");
      await price.fill("0"); await save.click();
      assert.equal(await cards.count(), 8);
      const created = page.getByRole("article", { name: "Шинэ жишээ", exact: true });
      assert.match(await created.textContent(), /Ноорог.*Шинэ жишээ.*0 ₮/);
      assert.equal(await page.locator(":focus").getAttribute("id"), "knowledge-title");
      const createdAt = await created.locator("time").getAttribute("datetime");
      assert.ok(Number.isFinite(Date.parse(createdAt)));
      await created.getByRole("button", { name: /^Засах/ }).click();
      assert.equal(await price.inputValue(), "0");
      await approval.check(); await content.fill("Өөрчилсөн агуулга");
      assert.equal(await approval.isChecked(), false, "content change invalidates earlier approval");
      await price.fill(""); await approval.check(); await save.click();
      assert.equal(await cards.count(), 8, "edit replaces the existing record");
      assert.match(await created.textContent(), /Баталгаажсан.*Өөрчилсөн агуулга.*Үнэ оруулаагүй/);
      await created.getByRole("button", { name: /^Засах/ }).click();
      assert.equal(await approval.isChecked(), false, "existing approval is not inherited by an edit");
      await title.fill("Цуцалсан өөрчлөлт"); await form.getByRole("button", { name: "Болих", exact: true }).click();
      assert.equal(await created.count(), 1);
      assert.match(await created.textContent(), /Баталгаажсан/, "cancel leaves the approved record intact");
      await created.getByRole("button", { name: /^Засах/ }).click();
      await save.click(); assert.match(await created.textContent(), /Ноорог/, "save without renewed approval is a draft");
      page.once("dialog", (dialog) => dialog.dismiss());
      await created.getByRole("button", { name: /^Устгах/ }).click(); assert.equal(await created.count(), 1);
      page.once("dialog", (dialog) => dialog.accept());
      await created.getByRole("button", { name: /^Устгах/ }).click(); assert.equal(await created.count(), 0);
      await add.click(); await title.fill("Түр мэдээлэл"); await content.fill("Хуудас шинэчлэхэд арилна."); await save.click();
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(await cards.count(), 7);
      assert.equal(await page.getByRole("article", { name: "Түр мэдээлэл", exact: true }).count(), 0, "demo edits never persist after reload");
    } else {
      assert.equal(await cards.count(), 0);
      assert.equal(await page.getByText("Холболт хүлээж байна", { exact: true }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Мэдээлэл хараахан алга" }).count(), 1);
      for (const control of [search, category, status, add]) assert.equal(await control.isDisabled(), true);
      assert.equal(await form.count(), 0);
    }
    const screenshots = resolve(__dirname, "../docs"); mkdirSync(screenshots, { recursive: true });
    if (demo) await page.screenshot({ path: resolve(screenshots, "knowledge-desktop.png"), fullPage: true });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `list overflow at ${width}px`);
      if (demo) {
        await add.click();
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `editor overflow at ${width}px`);
        await form.getByRole("button", { name: "Болих", exact: true }).click();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("heading", { level: 1 }).click();
    if (demo) {
      await page.screenshot({ path: resolve(screenshots, "knowledge-mobile.png"), fullPage: true });
      await cards.first().getByRole("button", { name: /^Засах/ }).click();
      await page.locator(".knowledge-editor").screenshot({ path: resolve(screenshots, "knowledge-editor.png") });
      await form.getByRole("button", { name: "Болих", exact: true }).click();
    }
    const menu = page.locator(".mobile-menu");
    await menu.locator("summary").click(); await menu.getByRole("link", { name: "Захиалгууд" }).click();
    await page.waitForURL(`${base}/bookings`);
    await menu.locator("summary").click(); await menu.getByRole("link", { name: "Мэдээллийн сан" }).click();
    await page.waitForURL(`${base}/knowledge`);
    assert.equal(await menu.getAttribute("open"), null);
    assert.equal(await menu.locator('a[aria-current="page"]').getAttribute("href"), "/knowledge");
    assert.deepEqual(errors, [], "no runtime or hydration errors");
    console.log(`Knowledge browser check passed (${demo ? "demo CRUD" : "unconfigured"}): filters, approval/validation when enabled, focus, reload behavior, five widths and navigation.`);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
