import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

// Authenticated Preview-only qualification for the exact Step 8 tree.
// The deployed server must return newly created v2.2 sessions.
const previewUrl = required("E2E_PREVIEW_SHARE_URL");
const origin = new URL(previewUrl).origin;
const email = required("E2E_USER_EMAIL");
const password = required("E2E_USER_PASSWORD");
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const storageState = await authenticate(browser);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 960 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Workflow", exact: true }).click();
    await page.getByLabel(/Language|語言|语言/).selectOption(locale);
    const startResponse = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && /\/copilot\/sessions$/.test(new URL(response.url()).pathname));
    await page.getByRole("button", { name: /Start guided interview|開始引導訪談|开始引导访谈/ }).click();
    const response = await startResponse;
    assert.equal(response.status(), 201);
    const payload = await response.json();
    assert.equal(payload.ledger.questionLibraryVersion, "v2.2");
    assert.equal(payload.interview.libraryVersion, "v2.2");
    assert.equal(payload.interview.conceptLibraryVersion, "concepts.v1.0");
    assert.equal(payload.interview.nextQuestion.helpDetail.libraryVersion, "concepts.v1.0");
    assert.equal(payload.interview.nextQuestion.helpDetail.requestedLocale, locale);
    assert.equal(payload.interview.nextQuestion.helpDetail.displayedLocale, locale);
    assert.equal(payload.interview.nextQuestion.helpDetail.fallback, undefined);

    const helpButton = page.getByRole("button", { name: /What does this mean|這是甚麼意思|这是什么意思/ });
    await helpButton.waitFor();
    assert.equal(await helpButton.getAttribute("aria-expanded"), "false");
    await helpButton.focus();
    await page.keyboard.press("Enter");
    assert.equal(await helpButton.getAttribute("aria-expanded"), "true");
    const panel = page.locator("#copilot-current-question-help");
    await panel.waitFor();
    assert.equal(await helpButton.getAttribute("aria-controls"), await panel.getAttribute("id"));
    assert.equal(await panel.getAttribute("aria-labelledby"), `${await panel.getAttribute("id")}-title`);
    assert.ok((await panel.locator("p").count()) >= 5, "help includes plain explanation, question tip, example, workflow effect, and screen-reader metadata");
    assert.equal(await panel.locator("[data-help-fallback-reason]").count(), 0, "fully reviewed locale does not silently fall back");
    assert.equal(await page.locator("[data-concept-library-version='concepts.v1.0']").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);

    await axe(page, `${locale} light`);
    await page.locator("html").evaluate((element) => { element.dataset.theme = "dark"; });
    await axe(page, `${locale} dark`);
    await page.setViewportSize({ width: 390, height: 844 });
    const renderedStressText = locale === "en"
      ? "［Ŧh́ḯś ḯś ä́ ḉö́ḿṕö́ñ́ë́ñ́t́-ŕë́ñ́d́ë́ŕë́d́ ṕśë́ǘd́ö́-ĺö́ḉä́ĺḯźä́t́ḯö́ñ́ śt́ŕë́śś t́ë́x́t́ ẃḯt́h́ Éx́t́ŕä́Ĺö́ñ́ǵǗñ́b́ŕö́ḱë́ñ́Ẃö́ŕd́śÁñ́d́D́ḯä́ḉŕḯt́ḯḉś］".repeat(4)
      : locale === "zh-Hant"
        ? "這是實際寫入說明元件的繁體中文超長版面測試內容，用來確認窄螢幕、放大文字、深色模式及連續中文字符不會令內容超出畫面。".repeat(8)
        : "这是实际写入说明组件的简体中文超长布局测试内容，用来确认窄屏幕、放大文字、深色模式及连续中文字符不会让内容超出画面。".repeat(8);
    await panel.locator("[data-help-section='explanation']").evaluate((element, value) => {
      element.textContent = value;
    }, renderedStressText);
    assert.equal(
      await panel.locator("[data-help-section='explanation']").textContent(),
      renderedStressText,
      `${locale} stress content is rendered in the actual help component`,
    );
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${locale} help does not overflow mobile viewport`);
    const buttonBox = await helpButton.boundingBox();
    assert.ok(buttonBox && buttonBox.height >= 44 && buttonBox.width >= 44, `${locale} help control is a touch target`);
    const panelBox = await panel.boundingBox();
    assert.ok(panelBox && panelBox.x >= 0 && panelBox.x + panelBox.width <= 390, `${locale} CJK/pseudo-long help stays within the mobile viewport`);
    await axe(page, `${locale} rendered stress content`);
    await page.keyboard.press("Shift+Tab");
    await helpButton.focus();
    await page.keyboard.press("Space");
    assert.equal(await helpButton.getAttribute("aria-expanded"), "false");
    await context.close();
  }
  console.log("template_copilot_v2_step8_browser=PASS");
} finally {
  if (browser) await browser.close();
}

async function authenticate(selectedBrowser) {
  const context = await selectedBrowser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.origin === origin && url.pathname === "/"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  const state = await context.storageState();
  await context.close();
  return state;
}

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).analyze();
  assert.equal(result.violations.length, 0, `${label}: ${result.violations.map((item) => item.id).join(", ")}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Step 8 Preview qualification.`);
  return value;
}
