import { chromium } from "@playwright/test";

const previewShareUrl = required("E2E_PREVIEW_SHARE_URL");
const previewOrigin = new URL(previewShareUrl).origin;
const email = required("E2E_SECOND_USER_EMAIL");
const password = required("E2E_SECOND_USER_PASSWORD");
const sessionId = required("E2E_CROSS_USER_SESSION_ID");

const browser = await launchBrowser();
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(previewShareUrl, { waitUntil: "domcontentloaded" });
  await page.goto(`${previewOrigin}/login`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL(
      (url) => url.origin === previewOrigin && url.pathname === "/",
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  const response = await context.request.get(
    `${previewOrigin}/api/template-authoring/copilot/sessions/${sessionId}`,
  );
  const body = await response.json().catch(() => ({}));
  const result = {
    id: "cross-user-isolation",
    passed: response.status() === 404,
    status: response.status(),
    errorCode: body?.error?.code || "",
  };
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} finally {
  await browser.close();
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
