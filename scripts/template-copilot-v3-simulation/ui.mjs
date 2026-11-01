// Browser run of the sectioned Describe screen: a real browser signs in, opens
// the Copilot tab, types the nine sections of one generated workflow, reads the
// proposal, confirms and creates the draft. Screenshots go to the output folder.
//   node scripts/template-copilot-v3-simulation/ui.mjs [--id W01] [--label name]
// Needs the local Supabase and a dev server started WITH
// NEXT_PUBLIC_TEMPLATE_COPILOT_V3_DESCRIBE=true (see .env.local).
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { connectSimulatedUser } from "./api.mjs";
import { simulationWorkflows } from "./workflows.mjs";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const appUrl = arg("app", "http://localhost:3100");
const id = arg("id", "W01");
const label = arg("label", "ui");
const spec = simulationWorkflows.find((workflow) => workflow.id === id);
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const outDir = join("output", "template-copilot-v3-simulation", label);
mkdirSync(outDir, { recursive: true });

const user = await connectSimulatedUser({
  appUrl, supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, anonKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY, label: "ui",
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1500 } });
page.setDefaultTimeout(120_000);
const errors = [];
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("response", async (response) => {
  if (response.request().method() === "POST" && response.url().includes("/api/template-authoring/")) {
    const body = await response.text().catch(() => "");
    console.log(`[ui] ${response.status()} ${response.url().replace(appUrl, "")} ${response.status() >= 400 ? body.slice(0, 300) : ""}`);
    if (response.status() >= 400) console.log(`[ui]   request: ${(response.request().postData() || "").slice(0, 300)}`);
  }
});
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
const step = (message) => console.log(`[ui] ${message}`);

try {
  await page.goto(`${appUrl}/login`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  step(`signed in at ${page.url()}`);
  await page.goto(`${appUrl}/?tab=workflow`, { waitUntil: "load" });
  const copilotTab = page.getByRole("button", { name: /^copilot$/i }).first();
  await copilotTab.waitFor();
  await copilotTab.click();
  await shot("1-after-login");
  await page.getByText(/describe your workflow in sections|分段描述你的流程/i).first().waitFor({ timeout: 120_000 });
  step("sectioned Describe screen is showing");
  await shot("2-sections-empty");

  // The page shows built-in demo data first and swaps in the database data a
  // moment later, which clears anything typed. Wait for the real business unit.
  await page.waitForFunction(() => [...document.querySelectorAll("select option")].some((option) => option.textContent === "Simulation Unit"), null, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  if (spec.lang !== "en") await page.getByLabel(/language|語言|语言/i).selectOption(spec.lang);
  const labelFor = {
    identity_scope: /What is this workflow for|這個流程用於什麼|这个流程用于什么/, initiators_fields: /Who can start it|誰可以發起|谁可以发起/,
    attachments: /Which documents|需要哪些文件/, stages_participants: /Who approves|誰負責審批|谁负责审批/,
    conditions_exceptions: /Special rules|特別規則|特别规则/, collaboration_corrections: /Colleagues helping|同事協助|同事协助/,
    timing_escalation: /Deadlines|期限及升級|期限及升级/, visibility_notifications: /Who can see it|誰可以查看|谁可以查看/, governance: /Ownership|負責人、複核|负责人、复核/,
  };
  for (const [slot, text] of Object.entries(spec.sections)) await page.getByLabel(labelFor[slot]).fill(text);
  await shot("3-sections-filled");
  await page.getByRole("button", { name: /read my description|讀取我的描述|读取我的描述/i }).click();
  await Promise.race([
    page.getByText(/check what the copilot understood|檢查 Copilot 的理解|检查 Copilot 的理解/i).first().waitFor({ timeout: 240_000 }),
    page.getByRole("alert").filter({ hasText: /S/ }).first().waitFor({ timeout: 240_000 }).then(async () => { throw new Error(`screen showed an error: ${await page.getByRole("alert").filter({ hasText: /S/ }).first().innerText()}`); }),
  ]);
  step("proposal is showing");
  await shot("4-proposal");
  const fieldRows = await page.getByLabel(/^(label|名稱|名称)$/).count();
  step(`editable label inputs: ${fieldRows}`);

  await page.getByRole("button", { name: /confirm and create draft|確認並建立草稿|确认并创建草稿/i }).click();
  await page.getByText(/draft created|已建立草稿|已创建草稿/i).first().waitFor({ timeout: 240_000 });
  step("draft created");
  await shot("5-draft-created");
  await page.getByRole("button", { name: /open in the builder|在流程編輯器中開啟|在流程编辑器中打开/i }).click();
  await page.waitForTimeout(3000);
  await shot("6-builder");
  step(`opened in the builder; browser errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 8).join("\n"));
  console.log("UI RUN OK");
} catch (error) {
  await shot("failure").catch(() => {});
  console.log(`UI RUN FAILED: ${error instanceof Error ? error.message : error}`);
  if (errors.length) console.log(errors.slice(0, 8).join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
