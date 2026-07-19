import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const runId = randomUUID().slice(0, 8);
const email = `phase7-a11y-${runId}@example.com`;
const password = `Phase7-${randomUUID()}-Aa1!`;
const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const { data: created, error: createError } = await service.auth.admin.createUser({
  email, password, email_confirm: true, user_metadata: { full_name: "Phase 7 Accessibility" },
});
assert.ifError(createError);
const { error: profileError } = await service.from("profiles").upsert({
  id: created.user.id, email, full_name: "Phase 7 Accessibility",
  role: "admin", is_admin: true, is_active: true,
});
assert.ifError(profileError);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto(`${appUrl}/login`, { waitUntil: "networkidle" });
  await assertAxe(page, "login");
  await page.keyboard.press("Tab");
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), "BODY");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "Inbox" }).waitFor({ timeout: 20_000 });
  await assertAxe(page, "desktop inbox");

  const notificationTrigger = page.getByRole("button", { name: /Open notifications/ });
  await notificationTrigger.focus();
  await page.keyboard.press("Enter");
  const notificationDialog = page.getByRole("dialog", { name: "Notifications" });
  await notificationDialog.waitFor();
  assert.equal(await notificationDialog.evaluate((node) => node.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await notificationDialog.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Open notifications"));
  assert.equal(await notificationTrigger.evaluate((node) => node === document.activeElement), true);

  const signOut = page.getByRole("button", { name: "Sign out" });
  await signOut.click();
  const confirmation = page.getByRole("dialog");
  await confirmation.waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Cancel");
  assert.equal(await confirmation.getByRole("button", { name: "Cancel" }).evaluate((node) => node === document.activeElement), true);
  await page.keyboard.press("Escape");
  await confirmation.waitFor({ state: "hidden" });
  assert.equal(await signOut.evaluate((node) => node === document.activeElement), true);

  await page.goto(`${appUrl}/?tab=admin`, { waitUntil: "networkidle" });
  await page.getByText("System health", { exact: true }).waitFor({ timeout: 20_000 });
  await assertAxe(page, "admin health dashboard");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appUrl}/?tab=workflow`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Canvas (desktop only)" }).waitFor({ timeout: 20_000 });
  const mobile = await page.evaluate(() => {
    const interactive = Array.from(document.querySelectorAll("button, a[href], input, select, textarea"))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height, label: node.getAttribute("aria-label") || node.textContent?.trim() || node.tagName };
      });
    return {
      horizontalOverflow: document.documentElement.scrollWidth - window.innerWidth,
      undersized: interactive.filter((item) => item.width < 24 || item.height < 24),
    };
  });
  assert.ok(mobile.horizontalOverflow <= 1, `mobile page overflows by ${mobile.horizontalOverflow}px`);
  assert.deepEqual(mobile.undersized, []);
  await assertAxe(page, "mobile workflow");
  assert.deepEqual(consoleErrors, []);

  console.log(JSON.stringify({
    outcome: "passed",
    axePages: ["login", "desktop inbox", "admin health dashboard", "mobile workflow"],
    keyboard: ["page tab order", "notification focus and Escape", "confirmation focus trap and Escape"],
    mobile: { viewport: "390x844", horizontalOverflow: mobile.horizontalOverflow, minimumTouchTarget: 24 },
    consoleErrors: 0,
  }));
} finally {
  await context.close();
  await browser.close();
}

async function assertAxe(targetPage, label) {
  const results = await new AxeBuilder({ page: targetPage }).analyze();
  const blocking = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact));
  const evidence = blocking.map((violation) => ({
    id: violation.id,
    nodes: violation.nodes.length,
    samples: violation.nodes.slice(0, 5).map((node) => ({ target: node.target, html: node.html })),
  }));
  assert.deepEqual(evidence, [], `${label} has blocking axe violations`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
