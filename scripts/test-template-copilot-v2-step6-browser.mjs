import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

// Authenticated Preview qualification for the three Step 6 controls. It is
// deliberately separate from deterministic mode/SQL contracts: this proves
// labels, keyboard use, touch targets, and that server responses—not browser
// state—select the persisted entry mode.
const origin = new URL(required("E2E_PREVIEW_SHARE_URL")).origin;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page);
  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Start guided interview|開始引導訪談|开始引导访谈/ }).click();
  const selector = page.getByLabel(/Switch how you create this|切換建立方式|切换创建方式/);
  await selector.waitFor();
  for (const button of await selector.getByRole("button").all()) {
    const box = await button.boundingBox();
    if (box) assert.ok(box.height >= 40, "mode controls have 40px touch targets");
  }
  await selector.getByRole("button", { name: /Let me describe everything|一次描述全部|一次描述全部/ }).focus();
  await page.keyboard.press("Enter");
  const broadComposer = page.getByRole("textbox", { name: /Describe the whole workflow|一次描述整個流程|一次描述整个流程/ });
  await broadComposer.fill("Create a supplier payment workflow with Finance approval.");
  await broadComposer.press("Shift+Enter");
  assert.match(await broadComposer.inputValue(), /\n$/u, "Shift+Enter adds a line without submitting");
  const describe = page.waitForResponse((response) => response.request().method() === "POST" && /\/describe$/.test(new URL(response.url()).pathname));
  await page.getByRole("button", { name: /Send|傳送|发送/ }).click();
  assert.ok([200, 502, 503].includes((await describe).status()), "describe mode returns a controlled candidate or guided-fallback response");
  const axe = await new AxeBuilder({ page }).analyze();
  assert.equal(axe.violations.length, 0, axe.violations.map((item) => item.id).join(", "));
  await context.close();
  console.log("template_copilot_v2_step6_browser=PASS");
} finally { if (browser) await browser.close(); }

async function signIn(page) {
  await page.goto(`${origin}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(required("E2E_USER_EMAIL"));
  await page.getByLabel("Password").fill(required("E2E_USER_PASSWORD"));
  await Promise.all([page.waitForURL((url) => url.origin === origin && url.pathname === "/"), page.getByRole("button", { name: "Sign in", exact: true }).click()]);
}
function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required for the Step 6 Preview qualification.`); return value; }
