import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

const previewUrl = required("E2E_PREVIEW_SHARE_URL");
const origin = new URL(previewUrl).origin;
const email = required("E2E_USER_EMAIL");
const password = required("E2E_USER_PASSWORD");
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });

  // Each locale gets a real authenticated v2.1 start and an axe scan. The
  // deployed server must have both TEMPLATE_COPILOT_V2 and STEP4 enabled.
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const page = await signedInCopilotPage(context);
    await page.getByLabel(/Language|語言|语言/).selectOption(locale);
    await start(page);
    assert.equal(await answerBox(page).getAttribute("aria-describedby"), "template-copilot-answer-length", "collapsed help is not referenced");
    await observeReadOnly(page, () => page.getByRole("button", { name: /Why are you asking|為何要問|为什么要问/ }).click(), "opening help");
    const help = page.locator("#copilot-current-question-help");
    await help.waitFor({ state: "visible" });
    await setExplicitTheme(page, "light");
    await fullAxeScan(page, `${locale} light`);
    await setExplicitTheme(page, "dark");
    await fullAxeScan(page, `${locale} dark`);
    await setExplicitTheme(page, "light");
    await page.getByRole("button", { name: /Why are you asking|為何要問|为什么要问/ }).click();
    await help.waitFor({ state: "detached" });
    assert.equal(await answerBox(page).getAttribute("aria-describedby"), "template-copilot-answer-length", "closed help is not referenced");
    await page.close();
  }

  // The English flow proves the genuine choice interaction: selecting twice
  // is purely local, then Continue makes exactly one durable answer request.
  const page = await signedInCopilotPage(context);
  await start(page);
  const suggestion = page.getByRole("button", { name: "Supplier payment request", exact: true });
  await suggestion.focus();
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY", "Tab keeps keyboard focus within the Step 4 controls");
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Enter");
  assert.equal(await answerBox(page).inputValue(), "Supplier payment request");
  assert.equal(await page.locator("textarea").getAttribute("aria-describedby"), "template-copilot-answer-length", "hidden help is never referenced");
  await answer(page, "Supplier payment request");
  await assertFocus(page, "textarea");
  await answer(page, "Approve supplier payments before Finance pays them.");
  await assertFocus(page, "textarea");
  await answer(page, "Supplier payment requests.");
  await assertFocus(page, "textarea");
  await answer(page, "Staff expense claims.");
  await page.getByRole("heading", { name: "Who may start a request?" }).waitFor();
  await assertFocus(page, "#copilot-current-question");
  await assertVerticalStep4Layout(page);

  let answerRequests = 0;
  let lastAnswerNetworkAt = Date.now();
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/answers$/.test(new URL(request.url()).pathname)) {
      answerRequests += 1;
      lastAnswerNetworkAt = Date.now();
    }
  });
  const choice = page.getByRole("button", { name: "Any employee", exact: true });
  await choice.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Enter");
  await networkQuiet(page, () => lastAnswerNetworkAt);
  assert.equal(answerRequests, 0, "a choice click only drafts the selection");
  const continueButton = page.getByRole("button", { name: "Continue", exact: true });
  assert.equal(await continueButton.isEnabled(), true);
  const response = page.waitForResponse((item) => item.request().method() === "POST" && /\/answers$/.test(new URL(item.url()).pathname));
  await continueButton.focus();
  await page.keyboard.press("Enter");
  assert.equal((await response).status(), 200);
  await networkQuiet(page, () => lastAnswerNetworkAt);
  assert.equal(answerRequests, 1, "double-click plus Continue creates one mutation");
  await page.getByRole("heading", { name: "What is one piece of information every request must include?" }).waitFor();
  await assertFocus(page, "textarea");
  await observeReadOnly(page, () => page.getByRole("button", { name: "Show another example", exact: true }).click(), "rotating an example");
  await assertMobileTouchAndLayout(context);
  await page.close();
  await context.close();
  console.log("template_copilot_v2_step4_browser=PASS");
} finally {
  if (browser) await browser.close();
}

async function signedInCopilotPage(context) {
  const page = await context.newPage();
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.origin === origin && url.pathname === "/"),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor();
  return page;
}

async function start(page) {
  const response = page.waitForResponse((item) => item.request().method() === "POST" && /\/copilot\/sessions$/.test(new URL(item.url()).pathname));
  await page.getByRole("button", { name: /Start guided interview|開始引導訪談|开始引导访谈/ }).click();
  assert.equal((await response).status(), 201);
  await page.getByRole("button", { name: /Why are you asking|為何要問|为什么要问/ }).waitFor();
}

function answerBox(page) { return page.locator("textarea").first(); }

async function answer(page, value) {
  await answerBox(page).fill(value);
  const response = page.waitForResponse((item) => item.request().method() === "POST" && /\/answers$/.test(new URL(item.url()).pathname));
  await page.getByRole("button", { name: "Send answer", exact: true }).click();
  assert.equal((await response).status(), 200);
}

async function assertFocus(page, selector) {
  await page.locator(selector).waitFor();
  await page.waitForFunction((target) => document.activeElement?.matches(target), selector);
}

async function setExplicitTheme(page, theme) {
  const applied = await page.locator("html").evaluate((element, nextTheme) => {
    element.dataset.theme = nextTheme;
    return { theme: element.dataset.theme, paper: getComputedStyle(element).getPropertyValue("--cw-paper").trim() };
  }, theme);
  assert.equal(applied.theme, theme, `expected explicit ${theme} theme`);
  assert.equal(applied.paper, theme === "dark" ? "#151414" : "#f7f7f5", `computed ${theme} theme variables did not apply`);
}

async function fullAxeScan(page, label) {
  const scan = await new AxeBuilder({ page }).analyze();
  assert.equal(scan.violations.length, 0, `${label} has full axe/contrast violations: ${scan.violations.map((item) => item.id).join(", ")}`);
}

async function networkQuiet(page, getLastNetworkAt) {
  await page.waitForTimeout(350);
  assert.ok(Date.now() - getLastNetworkAt() >= 300, "answer network did not settle before the mutation count assertion");
}

async function observeReadOnly(page, action, label) {
  const writes = [];
  const before = await page.evaluate(() => ({
    prompt: document.querySelector("#copilot-current-question")?.textContent,
    transcript: document.querySelector('[aria-live="polite"]')?.textContent,
  }));
  const listener = (request) => {
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && /\/(answers|special|extraction-candidates|extraction-conflicts)$/.test(path)) writes.push(path);
  };
  page.on("request", listener);
  await action();
  await networkQuiet(page, () => 0);
  page.off("request", listener);
  const after = await page.evaluate(() => ({
    prompt: document.querySelector("#copilot-current-question")?.textContent,
    transcript: document.querySelector('[aria-live="polite"]')?.textContent,
  }));
  assert.deepEqual(writes, [], `${label} must not invoke an answer, special, or extraction mutation`);
  assert.deepEqual(after, before, `${label} must not change visible interview revision/state`);
}

async function assertVerticalStep4Layout(page) {
  const heading = await page.locator("#copilot-current-question").boundingBox();
  const choiceRow = await page.locator("fieldset").boundingBox();
  assert.ok(heading && choiceRow, "Step 4 question controls must be visible for layout verification");
  assert.ok(choiceRow.y > heading.y, "choice controls must stack below the question heading");
  assert.ok(choiceRow.x >= 0 && choiceRow.x + choiceRow.width <= (await page.viewportSize()).width, "choice controls must remain within the viewport");
}

async function assertMobileTouchAndLayout(context) {
  const page = await signedInCopilotPage(context);
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const targets = page.locator("button");
  for (let index = 0; index < await targets.count(); index += 1) {
    const box = await targets.nth(index).boundingBox();
    if (box) assert.ok(box.height >= 44 && box.width >= 44, `touch target ${index} is smaller than 44px`);
  }
  const section = await page.locator("[aria-label]").filter({ has: page.locator("textarea") }).boundingBox();
  assert.ok(section && section.width <= 390, "mobile Copilot layout must not overflow its viewport");
  await page.close();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for this deployed-browser test.`);
  return value;
}
