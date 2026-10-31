import { randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const previewShareUrl = requiredEnvironment("E2E_PREVIEW_SHARE_URL");
const supabaseUrl = requiredEnvironment("E2E_SUPABASE_URL");
const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_KEY?.trim() || "";
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY?.trim() || "";
const suppliedEmail = process.env.E2E_USER_EMAIL?.trim() || "";
const suppliedPassword = process.env.E2E_USER_PASSWORD?.trim() || "";
const expectedModel =
  process.env.E2E_EXPECTED_COPILOT_MODEL?.trim() || "qwen/qwen3.5-35b-a3b";
const expectedProvider =
  process.env.E2E_EXPECTED_COPILOT_PROVIDER?.trim() || "";
const requireZdr =
  process.env.E2E_REQUIRE_COPILOT_ZDR?.trim().toLowerCase() === "true";
const requireTelemetry =
  process.env.E2E_REQUIRE_COPILOT_TELEMETRY?.trim().toLowerCase() === "true";
const previewOrigin = new URL(previewShareUrl).origin;
const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const useSuppliedUser = Boolean(suppliedEmail && suppliedPassword);
const email = suppliedEmail || `codex-template-copilot-${runId}@mailinator.com`;
const password =
  suppliedPassword || `Preview-${randomBytes(18).toString("base64url")}!9a`;
const databaseKey = serviceRoleKey || publishableKey;
if (!databaseKey) {
  throw new Error(
    "E2E_SUPABASE_SERVICE_KEY or E2E_SUPABASE_PUBLISHABLE_KEY is required.",
  );
}
if (!serviceRoleKey && !useSuppliedUser) {
  throw new Error(
    "E2E_USER_EMAIL and E2E_USER_PASSWORD are required without a service-role key.",
  );
}
const database = createClient(supabaseUrl, databaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const serviceDatabase = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

let createdUserId = "";
let telemetryAdminUserId = "";
let telemetryBaselineEventIds = new Set();
let browser;

try {
  if (requireTelemetry) {
    assert(
      serviceDatabase,
      "Telemetry qualification requires E2E_SUPABASE_SERVICE_KEY.",
    );
    const telemetryAdminEmail =
      `codex-template-telemetry-admin-${runId}@mailinator.com`;
    const { data: telemetryAdmin, error: telemetryAdminError } =
      await serviceDatabase.auth.admin.createUser({
        email: telemetryAdminEmail,
        password: `Telemetry-${randomBytes(18).toString("base64url")}!7z`,
        email_confirm: true,
        user_metadata: { full_name: "Codex Telemetry Admin" },
      });
    if (telemetryAdminError || !telemetryAdmin.user) {
      throw new Error(
        `Could not create the isolated telemetry Admin: ${telemetryAdminError?.message}`,
      );
    }
    telemetryAdminUserId = telemetryAdmin.user.id;
    await ensureProfile({
      client: serviceDatabase,
      userId: telemetryAdminUserId,
      userEmail: telemetryAdminEmail,
      fullName: "Codex Telemetry Admin",
      role: "superuser",
      isAdmin: true,
    });
    telemetryBaselineEventIds = await listTelemetryEventIds(
      serviceDatabase,
      telemetryAdminUserId,
    );
  }

  if (useSuppliedUser) {
    const { data: signedIn, error: signInError } =
      await database.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.user) {
      throw new Error(`Could not sign in the supplied test user: ${signInError?.message}`);
    }
    createdUserId = signedIn.user.id;
  } else {
    const { data: created, error: createError } =
      await serviceDatabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Codex Preview Tester" },
    });
    if (createError || !created.user) {
      throw new Error(`Could not create the isolated test user: ${createError?.message}`);
    }
    createdUserId = created.user.id;
    await ensureProfile({
      client: serviceDatabase,
      userId: createdUserId,
      userEmail: email,
      fullName: "Codex Preview Tester",
      role: "participant",
      isAdmin: false,
    });
  }

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
  const copilotCapabilities = await page.evaluate(async () => {
    const response = await fetch("/api/template-authoring/copilot/sessions", {
      method: "HEAD",
      cache: "no-store",
    });
    return {
      status: response.status,
      schema: response.headers.get("x-template-copilot-schema-version"),
      zdr: response.headers.get("x-template-copilot-openrouter-zdr"),
      provider: response.headers.get("x-template-copilot-provider"),
      model: response.headers.get("x-template-copilot-model"),
      telemetry: response.headers.get("x-template-copilot-telemetry"),
    };
  });
  assert(copilotCapabilities.status === 200, "Copilot capability probe failed.");
  assert(
    copilotCapabilities.schema === "2",
    "The deployed Preview did not enable the governed Copilot v2 interview.",
  );
  if (requireZdr) {
    assert(
      expectedProvider === "openrouter",
      "ZDR qualification requires E2E_EXPECTED_COPILOT_PROVIDER=openrouter.",
    );
    assert(
      copilotCapabilities.provider === expectedProvider,
      "The deployed Preview is not using the expected Copilot provider.",
    );
    assert(
      copilotCapabilities.model === expectedModel,
      "The deployed Preview is not using the expected Copilot model.",
    );
    assert(
      copilotCapabilities.zdr === "required",
      "The deployed Preview does not require the approved OpenRouter ZDR route.",
    );
  }
  if (requireTelemetry) {
    assert(
      copilotCapabilities.telemetry === "enabled",
      "The deployed Preview does not enable privacy-minimized Copilot telemetry.",
    );
  }

  await page.getByRole("link", { name: "Workflow", exact: true }).click();
  await page.getByText("Template Copilot", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByLabel("Business").locator("option").first().waitFor({
    state: "attached",
    timeout: 30_000,
  });
  await page.getByLabel("Department").locator("option").first().waitFor({
    state: "attached",
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
  if (requireTelemetry) {
    await waitForAppliedSessionTelemetry({
      client: serviceDatabase,
      actorId: telemetryAdminUserId,
      baselineEventIds: telemetryBaselineEventIds,
    });
  }

  const answer =
    "This is synthetic Preview data. Create a Purchase Requisition Approval workflow for employees requesting purchases. Procurement Operations owns the process. Use the selected business and department scope.";
  await page.getByLabel("Your workflow requirement answer").fill(answer);
  const turnResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(
        `/api/template-authoring/copilot/sessions/${startBody.sessionId}/answers`,
      ),
    { timeout: 90_000 },
  );
  await page.getByRole("button", { name: "Send answer" }).click();
  const turnResponse = await turnResponsePromise;
  const turnBody = await turnResponse.json();
  assert(
    turnResponse.status() === 200,
    `Copilot turn returned ${turnResponse.status()} (${
      turnBody?.error?.code || "unknown"
    }: ${turnBody?.error?.message || "no message"}).`,
  );
  assert(turnBody.outcome === "applied", "Copilot turn was not applied.");
  assert(Number(turnBody.revision) === 2, "Copilot revision did not advance.");
  assert(
    turnBody.interview?.nextQuestion?.questionId,
    "Copilot turn did not return the next guided question.",
  );
  await page.getByText("You", { exact: true }).waitFor({ state: "visible" });
  const visibleNextQuestion = page.locator("#copilot-current-question");
  await visibleNextQuestion.waitFor({ state: "visible", timeout: 30_000 });
  assert(
    (await visibleNextQuestion.innerText()).trim() ===
      turnBody.interview.nextQuestion.prompt,
    "The visible guided question did not advance after the saved first answer.",
  );

  const { data: storedSession, error: sessionError } = await database
    .from("template_copilot_sessions")
    .select("id,owner_id,revision,status")
    .eq("id", startBody.sessionId)
    .single();
  if (sessionError) throw sessionError;
  assert(storedSession.owner_id === createdUserId, "Stored session owner is incorrect.");
  assert(Number(storedSession.revision) === 2, "Stored session revision is incorrect.");

  const { count: messageCount, error: messageError } = await database
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
  console.log("copilot_v2_turn=PASS");
  console.log("owner_scoped_persistence=PASS");
  if (requireTelemetry) {
    console.log("preview_route_telemetry_admin_read=PASS");
  }
  console.log(`screenshot=${screenshotPath}`);
} finally {
  if (browser) await browser.close();
  if (createdUserId && !useSuppliedUser) {
    const { error } = await serviceDatabase.auth.admin.deleteUser(createdUserId);
    if (error) {
      console.warn(`test_user_cleanup=FAILED (${error.message})`);
    } else {
      console.log("test_user_cleanup=PASS");
    }
  }
  if (telemetryAdminUserId && serviceDatabase) {
    const { error } =
      await serviceDatabase.auth.admin.deleteUser(telemetryAdminUserId);
    if (error) {
      console.warn(`telemetry_admin_cleanup=FAILED (${error.message})`);
    } else {
      console.log("telemetry_admin_cleanup=PASS");
    }
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function ensureProfile({
  client,
  userId,
  userEmail,
  fullName,
  role,
  isAdmin,
}) {
  let profileExists = false;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await client
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
    full_name: fullName,
    role,
    is_admin: isAdmin,
    is_active: true,
  };
  const { error } = profileExists
    ? await client.from("profiles").update(profile).eq("id", userId)
    : await client.from("profiles").insert(profile);
  if (error) throw error;
}

async function listTelemetryEventIds(client, actorId) {
  const { data, error } = await client.rpc(
    "list_template_copilot_v2_telemetry_for_admin",
    {
      p_actor_id: actorId,
      p_limit: 200,
      p_before: null,
    },
  );
  if (error) throw error;
  return new Set((Array.isArray(data) ? data : []).map((event) => event.event_id));
}

async function waitForAppliedSessionTelemetry({
  client,
  actorId,
  baselineEventIds,
}) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await client.rpc(
      "list_template_copilot_v2_telemetry_for_admin",
      {
        p_actor_id: actorId,
        p_limit: 200,
        p_before: null,
      },
    );
    if (error) throw error;
    const appliedEvent = (Array.isArray(data) ? data : []).find(
      (event) =>
        !baselineEventIds.has(event.event_id) &&
        event.event_type === "question_selected" &&
        event.outcome_code === "session_applied" &&
        Number(event.counts?.session_starts) === 1,
    );
    if (appliedEvent) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    "The authenticated Preview session route did not create an Admin-readable telemetry event.",
  );
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
