import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

// Authenticated Preview-only qualification. Run after the Step 7 migration,
// parent Step 5 edit gate, and all three Step 7 editor gates are enabled.
const previewUrl = required("E2E_PREVIEW_SHARE_URL");
const origin = new URL(previewUrl).origin;
const email = required("E2E_USER_EMAIL");
const password = required("E2E_USER_PASSWORD");
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const storageState = await authenticate(browser);
  for (const locale of ["en", "zh-Hant", "zh-Hans"]) {
    const context = await browser.newContext({ storageState, viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: "Workflow", exact: true }).click();
    await page.getByLabel(/Language|語言|语言/).selectOption(locale);
    await start(page);
    const map = page.getByLabel(/Authoritative workflow map|權威流程地圖|权威流程地图/);
    await map.waitFor();
    await saveRequestField(page, map);
    await saveStage(page, map);
    await saveAttachment(page, map);
    await validateAndSaveCondition(page, map);
    await saveNotification(page, map);
    await axe(page, `${locale} light`);
    await page.locator("html").evaluate((element) => { element.dataset.theme = "dark"; });
    await axe(page, `${locale} dark`);
    await assertMobileAndKeyboard(page, map);
    await context.close();
  }
  console.log("template_copilot_v2_step7_browser=PASS");
} finally {
  if (browser) await browser.close();
}

async function authenticate(browser) {
  const context = await browser.newContext();
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

async function start(page) {
  const response = page.waitForResponse((item) =>
    item.request().method() === "POST"
    && /\/copilot\/sessions$/.test(new URL(item.url()).pathname));
  await page.getByRole("button", { name: /Start guided interview|開始引導訪談|开始引导访谈/ }).click();
  assert.equal((await response).status(), 201);
}

async function saveRequestField(page, map) {
  await map.locator('[id="copilot-map-edit-request.fields"]').click();
  const editor = map.locator('[id="copilot-map-editor-request.fields"]');
  await editor.getByRole("button", { name: /Add|新增/ }).click();
  await editor.getByLabel(/Label|名稱|名称/).fill("Amount");
  await editor.getByLabel(/Type|類型|类型/).selectOption("currency");
  await save(page, editor, "request field");
}

async function saveStage(page, map) {
  await map.locator('[id="copilot-map-edit-workflow.stages"]').click();
  const editor = map.locator('[id="copilot-map-editor-workflow.stages"]');
  await editor.getByRole("button", { name: /Add|新增/ }).click();
  await editor.getByLabel(/Label|名稱|名称/).fill("Finance review");
  await save(page, editor, "stage");
}

async function saveAttachment(page, map) {
  await map.locator('[id="copilot-map-edit-attachments.requirements"]').click();
  const editor = map.locator('[id="copilot-map-editor-attachments.requirements"]');
  await editor.getByRole("button", { name: /Add|新增/ }).click();
  await editor.getByLabel(/Name|名稱|名称/).fill("Supplier quotation");
  await editor.getByLabel(/When it is provided|在哪個步驟提供|在哪个步骤提供/).selectOption("stage:Finance review");
  await save(page, editor, "attachment");
  await map.getByText(/Supplier quotation/).waitFor();
}

async function validateAndSaveCondition(page, map) {
  await map.locator('[id="copilot-map-edit-workflow.conditions"]').click();
  const editor = map.locator('[id="copilot-map-editor-workflow.conditions"]');
  await editor.getByRole("button", { name: /Add|新增/ }).click();
  await editor.getByLabel(/Comparison|比較方法|比较方法/).selectOption(">=");
  await editor.getByLabel(/^Value$|^比較值$|^比较值$/).fill("1000");
  await editor.getByLabel(/If it matches|符合時前往|符合时前往/).selectOption("stage:Finance review");
  await editor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  const invalid = editor.locator('[aria-invalid="true"]');
  await invalid.first().waitFor();
  assert.ok(await invalid.count() >= 1, "missing currency is associated with its field");
  await editor.getByLabel(/Currency|貨幣|货币/).fill("HKD");
  await save(page, editor, "condition");
  await map.getByText(/1000/).waitFor();
}

async function saveNotification(page, map) {
  await map.locator('[id="copilot-map-edit-notifications.rules"]').click();
  const editor = map.locator('[id="copilot-map-editor-notifications.rules"]');
  await editor.getByRole("button", { name: /Add|新增/ }).click();
  await save(page, editor, "notification");
  await map.getByText(/request submitted|申請已提交|申请已提交/i).waitFor();
}

async function save(page, editor, label) {
  const response = page.waitForResponse((item) =>
    item.request().method() === "POST"
    && /\/facts$/.test(new URL(item.url()).pathname));
  await editor.getByRole("button", { name: /Save authoritative change|儲存權威變更|保存权威更改/ }).click();
  assert.equal((await response).status(), 200, `${label} is saved by the authenticated revisioned fact route`);
}

async function assertMobileAndKeyboard(page, map) {
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  const attachmentEdit = map.locator('[id="copilot-map-edit-attachments.requirements"]');
  await attachmentEdit.focus();
  await page.keyboard.press("Enter");
  const editor = map.locator('[id="copilot-map-editor-attachments.requirements"]');
  await editor.waitFor();
  await page.waitForFunction(() => document.querySelector('[id="copilot-map-editor-attachments.requirements"]')?.contains(document.activeElement));
  for (let index = 0; index < await editor.getByRole("button").count(); index += 1) {
    const box = await editor.getByRole("button").nth(index).boundingBox();
    if (box) assert.ok(box.height >= 40, `touch target ${index} is at least 40px`);
  }
  await editor.getByRole("button", { name: /Cancel|取消/ }).click();
  await page.waitForFunction(() => document.activeElement?.id === "copilot-map-edit-attachments.requirements");
}

async function axe(page, label) {
  const result = await new AxeBuilder({ page }).analyze();
  assert.equal(result.violations.length, 0, `${label}: ${result.violations.map((item) => item.id).join(", ")}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the Step 7 Preview qualification.`);
  return value;
}
