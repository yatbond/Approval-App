import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const previewShareUrl = requiredEnvironment("E2E_PREVIEW_SHARE_URL");
const supabaseUrl = requiredEnvironment("E2E_SUPABASE_URL");
const serviceRoleKey = requiredEnvironment("E2E_SUPABASE_SERVICE_KEY");
const previewOrigin = new URL(previewShareUrl).origin;
const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const email = `codex-template-copilot-${runId}@example.com`;
const password = `Preview-${randomBytes(18).toString("base64url")}!9a`;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let createdUserId = "";
let browser;

try {
  const { data: created, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Codex Preview Tester" },
    });
  if (createError || !created.user) {
    throw new Error(`Could not create the isolated test user: ${createError?.message}`);
  }
  createdUserId = created.user.id;
  await ensureProfile(createdUserId, email);

  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });

  await page.goto(previewShareUrl, { waitUntil: "networkidle" });
  await page.goto(`${previewOrigin}/login`, { waitUntil: "networkidle" });
  assert(
    (await page.locator("body").innerText()).trim().length > 0,
    "Login page is blank.",
  );
  assert(
    (await page.locator("[data-nextjs-dialog]").count()) === 0,
    "Next.js error overlay is visible on the login page.",
  );
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForURL((url) => url.origin === previewOrigin && url.pathname === "/", {
      timeout: 30_000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("link", { name: "Workflow", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const authoringContext = await page.evaluate(async () => {
    const response = await fetch("/api/template-authoring/context", {
      cache: "no-store",
    });
    return { status: response.status, body: await response.json() };
  });
  assert(authoringContext.status === 200, "Authenticated authoring context failed.");
  assert(
    authoringContext.body?.actor?.mode === "employee_proposal",
    "Test employee received an unexpected authoring mode.",
  );
  assert(
    authoringContext.body?.actor?.canPublish === false,
    "Test employee unexpectedly received publication authority.",
  );

  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  assert(
    (await page.getByLabel("Business").locator("option").count()) > 0,
    "No active business is available to the Copilot.",
  );
  assert(
    (await page.getByLabel("Department").locator("option").count()) > 0,
    "No active department is available to the Copilot.",
  );

  const startResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/api/template-authoring/copilot/sessions"),
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Start guided interview" }).click();
  const startResponse = await startResponsePromise;
  const startBody = await startResponse.json();
  assert(
    startResponse.status() === 201,
    `Copilot session creation returned ${startResponse.status()} (${
      startBody?.error?.code || "unknown"
    }: ${startBody?.error?.message || "no message"}).`,
  );
  assert(startBody.outcome === "applied", "Copilot session creation was not applied.");
  assert(startBody.sessionId, "Copilot session did not return an identifier.");

  const answer =
    "This is synthetic Preview data. Create a Purchase Requisition Approval workflow for employees requesting purchases. Procurement Operations owns the process. Use the selected business and department scope.";
  await page.getByLabel("Your workflow requirement answer").fill(answer);
  const turnResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(
        `/api/template-authoring/copilot/sessions/${startBody.sessionId}/messages`,
      ),
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Send answer" }).click();
  const turnResponse = await turnResponsePromise;
  const turnBody = await turnResponse.json();
  assert(turnResponse.status() === 200, `Copilot turn returned ${turnResponse.status()}.`);
  assert(turnBody.outcome === "applied", "Copilot turn was not applied.");
  assert(Number(turnBody.revision) === 2, "Copilot revision did not advance.");
  await page.getByText("You", { exact: true }).waitFor({ state: "visible" });
  assert(
    (await page.getByText(/Requirements 1\//).count()) === 1,
    "The visible requirements checklist did not record the first answer.",
  );

  const { data: storedSession, error: sessionError } = await service
    .from("template_copilot_sessions")
    .select("id,owner_id,revision,status,model")
    .eq("id", startBody.sessionId)
    .single();
  if (sessionError) throw sessionError;
  assert(storedSession.owner_id === createdUserId, "Stored session owner is incorrect.");
  assert(Number(storedSession.revision) === 2, "Stored session revision is incorrect.");
  assert(
    storedSession.model === "qwen/qwen3.5-flash-02-23",
    `Unexpected Copilot model: ${storedSession.model}`,
  );

  const { count: messageCount, error: messageError } = await service
    .from("template_copilot_messages")
    .select("id", { count: "exact", head: true })
    .eq("session_id", startBody.sessionId);
  if (messageError) throw messageError;
  assert(messageCount === 3, "Copilot did not persist the expected message ledger.");

  const artifactDirectory = await mkdtemp(join(tmpdir(), "approval-copilot-e2e-"));
  const screenshotPath = join(artifactDirectory, "authenticated-copilot.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert(
    (await page.locator("[data-nextjs-dialog]").count()) === 0,
    "Next.js error overlay appeared in the authenticated workflow.",
  );
  assert(
    browserErrors.length === 0,
    `Browser errors detected: ${browserErrors.join(" | ")}`,
  );

  console.log("template_copilot_preview_e2e=PASS");
  console.log(`deployment_origin=${previewOrigin}`);
  console.log("authenticated_context=PASS");
  console.log("openrouter_turn=PASS");
  console.log("owner_scoped_persistence=PASS");
  console.log(`screenshot=${screenshotPath}`);
} finally {
  if (browser) await browser.close();
  if (createdUserId) {
    const { error } = await service.auth.admin.deleteUser(createdUserId);
    if (error) {
      console.warn(`test_user_cleanup=FAILED (${error.message})`);
    } else {
      console.log("test_user_cleanup=PASS");
    }
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function ensureProfile(userId, userEmail) {
  let profileExists = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await service
      .from("profiles")
      .select("id,is_active")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      profileExists = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const profile = {
    id: userId,
    email: userEmail,
    full_name: "Codex Preview Tester",
    role: "participant",
    is_admin: false,
    is_active: true,
  };
  const { error } = profileExists
    ? await service.from("profiles").update(profile).eq("id", userId)
    : await service.from("profiles").insert(profile);
  if (error) throw error;
}

async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
