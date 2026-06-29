import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const email = process.env.E2E_EMAIL || "";
const password = process.env.E2E_PASSWORD || "";
const uploadFile = process.env.E2E_UPLOAD_FILE || "";
const headless = process.env.E2E_HEADLESS !== "false";

const browser = await chromium.launch({
  channel: "chrome",
  headless,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  if (!email || !password) {
    await page.goto(`${appUrl}/?tab=drafts`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expectText(page, "Approval App");
    console.log("Drafts smoke auth gate passed. Set E2E_EMAIL and E2E_PASSWORD for authenticated flow.");
    process.exitCode = 0;
  } else {
    await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);

    await page.goto(`${appUrl}/?tab=upload`, { waitUntil: "networkidle" });
    await expectText(page, "Upload request documents");

    if (uploadFile) {
      const absoluteUploadPath = resolve(uploadFile);
      if (!existsSync(absoluteUploadPath)) {
        throw new Error(`E2E_UPLOAD_FILE does not exist: ${absoluteUploadPath}`);
      }
      await page.locator('input[type="file"]').first().setInputFiles(absoluteUploadPath);
      await expectText(page, "Attached files", 60_000);
    }

    await page.goto(`${appUrl}/?tab=drafts`, { waitUntil: "networkidle" });
    await expectText(page, "Request drafts");
    await expectText(page, "New request");
    console.log("Authenticated Drafts smoke passed.");
  }
} finally {
  await browser.close();
}

async function expectText(page, text, timeout = 10_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}
