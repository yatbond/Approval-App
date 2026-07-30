import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const previewShareUrl = requiredEnvironment("E2E_PREVIEW_SHARE_URL");
const previewOrigin = new URL(previewShareUrl).origin;
const userEmail = requiredEnvironment("E2E_USER_EMAIL");
const userPassword = requiredEnvironment("E2E_USER_PASSWORD");
const expectedCommit = requiredEnvironment("E2E_EXPECTED_COMMIT");
const outputDirectory = resolve(
  process.env.DOSSIER_REVIEW_OUTPUT_DIR?.trim() ||
    "output/template-copilot-dossier-review",
);
const errors = [];
const observations = {};
const browser = await chromium.launch({ headless: true });

await mkdir(outputDirectory, { recursive: true });
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  observePage(page, errors);
  await signIn(page);

  const versionResponse = await context.request.get(
    `${previewOrigin}/api/version`,
  );
  const version = await versionResponse.json();
  observations.deployment = {
    status: versionResponse.status(),
    commit: version?.source?.revision || "",
    deploymentId: version?.deployment?.id || "",
  };
  if (
    versionResponse.status() !== 200 ||
    observations.deployment.commit !== expectedCommit
  ) {
    throw new Error(
      `Preview identity mismatch: ${JSON.stringify(observations.deployment)}`,
    );
  }

  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Start guided interview" }).click();
  await page.getByLabel("Your workflow requirement answer").waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await page.locator('input[type="file"]').setInputFiles({
    name: "browser-review-policy.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Corporate browser review evidence. A signed quotation is mandatory and records are retained for seven years.",
    ),
  });
  await page
    .getByText(/browser-review-policy\.txt was accepted/)
    .waitFor({ timeout: 30_000 });

  const answers = [
    "Call this Browser Dossier Review Qualification. It verifies a low-risk purchasing approval for the Procurement Operations department.",
    "Any department member may start it. Required fields are request title text, total amount currency, supplier name text, needed-by date, and cost centre text.",
    "Require one signed quotation PDF up to 20 MB and a native justification form with reason and alternatives considered.",
    "The requester submits, then the Department Head approves, then Finance Manager approves. The requester receives a non-blocking completion FYI.",
    "If total amount is at least HKD 50000, Finance Manager approval applies. A rejection returns to the requester for correction, then resumes the workflow.",
    "Allow ad-hoc contributors and contributor due dates. The assigned submitter confirms shared uploads using first-decision-wins.",
    "Department Head is due in 24 hours and Finance Manager in 48 hours. Escalate overdue work to the process owner.",
    "Participants can see status and history. Notify directly involved people on assignment, rejection, correction, and completion. Finance sees selected fields and the quotation only.",
    "The process owner and Template Manager review before publication. Apply policy PROC-001, retain records for 2555 days, and require a change reason.",
    "confirm",
  ];
  for (const answer of answers) {
    await answerCurrentQuestion(page, answer);
  }

  const generate = page.getByRole("button", {
    name: "Generate editable draft",
  });
  await generate.waitFor({ state: "visible", timeout: 30_000 });
  await generate.click();
  await page
    .getByRole("heading", { name: "Editable requirements dossier" })
    .waitFor({ state: "visible", timeout: 300_000 });

  const reviewSection = page
    .getByRole("heading", { name: "Editable requirements dossier" })
    .locator("..")
    .locator("..");
  observations.review = {
    citationHeading: await reviewSection
      .getByRole("heading", { name: /Source citations/ })
      .textContent(),
    documentCitationVisible: await reviewSection
      .getByText(/browser-review-policy\.txt/)
      .isVisible(),
    compiledCoverageVisible: await reviewSection
      .getByText("Compiled workflow coverage", { exact: true })
      .isVisible(),
  };
  if (!observations.review.documentCitationVisible) {
    throw new Error("The uploaded requirement document citation is missing.");
  }

  const reviewedTitle = `Reviewed Browser Workflow ${Date.now()}`;
  await page.getByLabel("Workflow title").fill(reviewedTitle);
  await page.getByLabel("Purpose and scope").fill(
    "Human-reviewed purpose and scope saved before structural workflow editing.",
  );
  await page.getByRole("button", { name: "Save dossier review" }).click();
  await page
    .getByText(
      "The reviewed dossier was saved as a new authoritative revision.",
      { exact: true },
    )
    .waitFor({ state: "visible", timeout: 30_000 });
  await page
    .getByRole("button", { name: "Continue to Builder & Canvas" })
    .click();
  await page
    .getByText(
      "Copilot draft created. Review the generated workflow before requesting publication.",
      { exact: true },
    )
    .waitFor({ state: "visible", timeout: 30_000 });

  observations.review.savedTitle = reviewedTitle;
  observations.review.canvasReached = true;
  observations.nextErrorOverlayCount = await page
    .locator("[data-nextjs-dialog]")
    .count();
  observations.errors = errors;
  observations.passed =
    observations.nextErrorOverlayCount === 0 && errors.length === 0;
  await page.screenshot({
    path: resolve(outputDirectory, "dossier-review-canvas.png"),
    fullPage: true,
  });
  if (!observations.passed) {
    throw new Error(`Browser errors: ${JSON.stringify(errors)}`);
  }
} finally {
  await browser.close();
  await writeFile(
    resolve(outputDirectory, "dossier-review-results.json"),
    `${JSON.stringify(observations, null, 2)}\n`,
    "utf8",
  );
}

console.log("dossier_review=PASS");
console.log(`deployment=${observations.deployment.deploymentId}`);
console.log(`citation_heading=${observations.review.citationHeading}`);

async function signIn(page) {
  await page.goto(previewShareUrl, { waitUntil: "domcontentloaded" });
  await page.goto(`${previewOrigin}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(userEmail);
  await page.getByLabel("Password").fill(userPassword);
  await Promise.all([
    page.waitForURL(
      (url) => url.origin === previewOrigin && url.pathname === "/",
      { timeout: 30_000 },
    ),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.getByRole("link", { name: "Workflow", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
}

async function answerCurrentQuestion(page, answer) {
  const textarea = page.getByLabel("Your workflow requirement answer");
  await textarea.waitFor({ state: "visible", timeout: 30_000 });
  await textarea.fill(answer);
  const messageCount = await page
    .locator('[aria-live="polite"] > div')
    .count();
  await page.getByRole("button", { name: "Send answer" }).click();
  await page
    .locator('[aria-live="polite"] > div')
    .nth(messageCount + 1)
    .waitFor({ state: "visible", timeout: 60_000 });
}

function observePage(page, browserErrors) {
  page.on("pageerror", (error) =>
    browserErrors.push({ type: "pageerror", message: error.message }),
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push({ type: "console", message: message.text() });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push({
        type: "http",
        status: response.status(),
        url: response.url().replace(/\?.*$/, ""),
      });
    }
  });
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
