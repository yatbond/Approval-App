import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const password = `Phase3-${randomUUID()}-Aa1!`;
const runId = randomUUID().slice(0, 8);
const service = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const requester = await createIdentity("requester", "originator");
const actor = await createIdentity("actor", "approver");
const templateVersionId = await createTemplate();
const browser = await chromium.launch({ headless: true });

try {
  const requesterContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  await signIn(requesterPage, requester.email);
  const submission = await requesterPage.evaluate(
    async ({ templateVersionId, runId }) => {
      const response = await fetch("/api/approval-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateVersionId,
          title: `Two browser approval ${runId}`,
          idempotencyKey: `two-browser-submit-${runId}`,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { templateVersionId, runId },
  );
  assert.equal(submission.status, 201);
  const requestNo = submission.body.request.requestNo;
  await requesterContext.close();

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await Promise.all([signIn(pageA, actor.email), signIn(pageB, actor.email)]);
  await Promise.all([
    openRequest(pageA, requestNo),
    openRequest(pageB, requestNo),
  ]);

  await pageB.route("**/api/approval-requests**", async (route) => {
    if (route.request().method() === "GET") {
      await route.abort();
    } else {
      await route.continue();
    }
  });

  const actionA = pageA.waitForResponse(
    (response) =>
      response.url().includes(`/api/approval-requests/${requestNo}/actions`) &&
      response.request().method() === "POST",
  );
  await pageA.getByRole("button", { name: "Approve", exact: true }).click();
  assert.equal((await actionA).status(), 200);

  const actionB = pageB.waitForResponse(
    (response) =>
      response.url().includes(`/api/approval-requests/${requestNo}/actions`) &&
      response.request().method() === "POST",
  );
  await pageB.getByRole("button", { name: "Approve", exact: true }).click();
  assert.equal((await actionB).status(), 409);

  const staleSnapshotSave = await pageB.evaluate(
    async ({ requestNo, requester, actor }) => {
      const staleTask = {
        id: requestNo,
        stateVersion: 0,
        title: "Stale browser task",
        workflow: "Two browser workflow",
        requester: requester.name,
        requesterEmail: requester.email,
        department: "Finance",
        status: "pending",
        due: "Tomorrow",
        value: "",
        currentStep: "Approval",
        currentOwner: actor.email,
        participants: [requester.email, actor.email],
        lastAction: "Stale local copy",
        extractedFields: {},
        auditTrail: [],
      };
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: {
            approvalTasks: [staleTask],
            businessDirectory: [],
            workflowTemplates: [],
            formLibrary: [],
            userRoleAssignments: [],
            adminAuditEvents: [],
            selectedTemplateId: "",
          },
        }),
      });
      return response.status;
    },
    { requestNo, requester, actor },
  );
  assert.equal(staleSnapshotSave, 200);

  await pageB.unroute("**/api/approval-requests**");
  const refreshed = pageB.waitForResponse(
    (response) =>
      response.url().includes("/api/approval-requests?view=tracking") &&
      response.status() === 200,
  );
  await pageB.evaluate(() => window.dispatchEvent(new Event("focus")));
  await refreshed;

  const canonical = await pageB.evaluate(async (requestNo) => {
    const response = await fetch(
      `/api/approval-requests/${encodeURIComponent(requestNo)}`,
      { cache: "no-store" },
    );
    return response.json();
  }, requestNo);
  assert.equal(canonical.request.version, 1);
  assert.equal(canonical.request.task.status, "approved");

  const { data: requestRow, error: requestError } = await service
    .from("approval_requests")
    .select("id,state_version,status")
    .eq("request_no", requestNo)
    .single();
  assert.ifError(requestError);
  assert.equal(requestRow.state_version, 1);
  assert.equal(requestRow.status, "approved");
  const { count: eventCount, error: eventError } = await service
    .from("approval_request_events")
    .select("id", { count: "exact", head: true })
    .eq("approval_request_id", requestRow.id)
    .eq("action", "approved");
  assert.ifError(eventError);
  assert.equal(eventCount, 1);

  await Promise.all([contextA.close(), contextB.close()]);
  console.log("Two-browser authoritative reconciliation suite passed.");
} finally {
  await browser.close();
}

async function openRequest(page, requestNo) {
  await page.goto(`${appUrl}/?tab=queue&request=${encodeURIComponent(requestNo)}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByText(`Two browser approval ${runId}`, { exact: false }).first().waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Approve", exact: true }).waitFor({
    state: "visible",
    timeout: 20_000,
  });
}

async function signIn(page, email) {
  await page.goto(`${appUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), {
      timeout: 20_000,
    }),
    page.getByRole("button", { name: "Sign in", exact: true }).click(),
  ]);
}

async function createIdentity(label, role) {
  const email = `phase3-${label}-${runId}@example.com`;
  const name = `Phase 3 ${label}`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  assert.ifError(error);
  const { error: profileError } = await service.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: name,
    role,
    is_admin: false,
    is_active: true,
  });
  assert.ifError(profileError);
  return { id: data.user.id, email, name };
}

async function createTemplate() {
  const businessName = `Phase 3 Business ${runId}`;
  const { data: business, error: businessError } = await service
    .from("business_units")
    .insert({ name: businessName, is_active: true })
    .select("id")
    .single();
  assert.ifError(businessError);
  const { data: department, error: departmentError } = await service
    .from("business_departments")
    .insert({ business_unit_id: business.id, name: "Finance", is_active: true })
    .select("id")
    .single();
  assert.ifError(departmentError);
  const templateKey = `phase3-two-browser-${runId}`;
  const snapshot = {
    id: templateKey,
    name: "Two browser workflow",
    business: businessName,
    department: "Finance",
    documentTypes: [],
    documents: [],
    languages: ["English"],
    fields: [],
    steps: [],
    graph: {
      nodes: [
        { id: "start", kind: "start", label: "Submit", x: 0, y: 0 },
        {
          id: "approval-1",
          kind: "approval",
          label: "Approval",
          x: 150,
          y: 0,
          assigneeName: actor.name,
          assigneeEmail: actor.email,
          dueInHours: 24,
        },
        { id: "end", kind: "end", label: "Complete", x: 300, y: 0 },
      ],
      edges: [
        {
          id: "start-approval",
          sourceId: "start",
          targetId: "approval-1",
          branchType: "main",
          label: "Submit",
        },
        {
          id: "approval-end",
          sourceId: "approval-1",
          targetId: "end",
          branchType: "approved",
          label: "Approved",
        },
      ],
    },
  };
  const { data, error } = await service
    .from("workflow_template_versions")
    .insert({
      template_key: templateKey,
      version_number: 1,
      name: snapshot.name,
      business_unit_id: business.id,
      department_id: department.id,
      graph: snapshot.graph,
      document_requirements: [],
      supported_languages: ["en"],
      template_snapshot: snapshot,
      created_by: requester.id,
      is_active: true,
      is_active_version: true,
    })
    .select("id")
    .single();
  assert.ifError(error);
  return data.id;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
