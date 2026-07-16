import { chromium } from "@playwright/test";

const appUrl = process.env.APP_URL || "http://localhost:3000";
const email = process.env.E2E_EMAIL || "";
const password = process.env.E2E_PASSWORD || "";
const headless = process.env.E2E_HEADLESS !== "false";
const browserChannel = process.env.E2E_BROWSER_CHANNEL || "chrome";

const requests = [
  {
    kind: "sequential",
    id: process.env.E2E_SEQUENTIAL_REQUEST || "",
    expectedText: ["Path and history", "Receipt reviewer", "Finance approval", "Merchant"],
  },
  {
    kind: "parallel",
    id: process.env.E2E_PARALLEL_REQUEST || "",
    expectedText: ["Path and history", "Parallel", "QS review", "Commercial review", "Final approval", "Total Outstanding"],
  },
  {
    kind: "conditional",
    id: process.env.E2E_CONDITIONAL_REQUEST || "",
    expectedText: ["Path and history", "Amount routing", "Executive approval", "Total Outstanding"],
  },
].filter((request) => request.id);

if (!email || !password) {
  throw new Error("E2E_EMAIL and E2E_PASSWORD are required for the authenticated regression suite.");
}

const browser = await chromium.launch({
  ...(browserChannel ? { channel: browserChannel } : {}),
  headless,
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await signIn(page);
  await verifyPrimaryNavigation(page);
  await verifyWorkflowLibrary(page);
  await verifyFormsWorkspace(page);
  await verifyQueueDecisionControls(page);

  for (const request of requests) {
    await verifyTrackedRequest(page, request);
  }

  if (process.env.E2E_TEST_EMAIL_TO) {
    await verifyEmailDelivery(page, process.env.E2E_TEST_EMAIL_TO);
  }

  console.log(
    `Regression suite passed (${requests.length} tracked workflow fixture(s) checked).`,
  );
} finally {
  await browser.close();
}

async function signIn(page) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await expectText(page, "Inbox");
}

async function verifyPrimaryNavigation(page) {
  for (const label of ["Inbox", "Tracking", "Drafts", "Workflow", "Forms", "Admin"]) {
    const link = page.getByRole("link", { name: label, exact: true });
    if ((await link.count()) !== 1) {
      throw new Error(`Expected one ${label} navigation link.`);
    }
  }
}

async function verifyWorkflowLibrary(page) {
  await page.goto(`${appUrl}/?tab=workflow`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expectText(page, "Workflow library");
  await expectText(page, "Available");
  await expectText(page, "Archived");
}

async function verifyFormsWorkspace(page) {
  await page.goto(`${appUrl}/?tab=forms`, { waitUntil: "networkidle" });
  await expectText(page, "Build reusable forms");
  for (const label of ["Builder", "Layout", "Library"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.count()) !== 1) {
      throw new Error(`Expected one ${label} Forms workspace tab.`);
    }
  }
  await page.getByRole("button", { name: "Library", exact: true }).click();
  await expectText(page, "Form library");
  await expectText(page, "Available");
  await expectText(page, "Archived");
}

async function verifyQueueDecisionControls(page) {
  await page.goto(`${appUrl}/?tab=queue`, { waitUntil: "networkidle" });
  await expectText(page, "Inbox");

  const rejectButton = page.getByRole("button", { name: "Reject", exact: true });
  if ((await rejectButton.count()) > 0) {
    await expectText(page, "Return to...");
    await expectText(page, "Reject + note");
  }
}

async function verifyTrackedRequest(page, request) {
  await page.goto(
    `${appUrl}/?tab=tracking&request=${encodeURIComponent(request.id)}`,
    { waitUntil: "networkidle" },
  );
  await expectText(page, request.id, 20_000);
  await expectText(page, "Approved");

  const showHandoff = page.getByRole("switch", {
    name: "Show handoff and visibility",
    exact: true,
  });
  if ((await showHandoff.count()) === 1) {
    await showHandoff.click();
  }

  for (const text of request.expectedText) {
    await expectText(page, text);
  }

  console.log(`${request.kind} workflow passed: ${request.id}`);
}

async function verifyEmailDelivery(page, recipientEmail) {
  const result = await page.evaluate(async (to) => {
    const response = await fetch("/api/email/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to }),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  }, recipientEmail);

  if (!result.ok || result.body?.failed > 0 || result.body?.error) {
    throw new Error(
      `Email regression failed (${result.status}): ${JSON.stringify(result.body)}`,
    );
  }
}

async function expectText(page, text, timeout = 10_000) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
}
