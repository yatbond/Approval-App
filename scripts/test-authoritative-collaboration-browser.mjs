import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const appUrl = requiredEnv("APP_URL").replace(/\/$/, "");
const supabaseUrl = requiredEnv("LOCAL_SUPABASE_URL");
const serviceKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const password = `Phase5-${randomUUID()}-Aa1!`;
const runId = randomUUID().slice(0, 8);
const service = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const requester = await createIdentity("requester", "originator");
const owner = await createIdentity("owner", "approver");
const contributor = await createIdentity("contributor", "participant");
const templateVersionId = await createTemplate();
const browser = await chromium.launch({ headless: true });

try {
  const requesterContext = await browser.newContext();
  const ownerContext = await browser.newContext();
  const contributorContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  const ownerPage = await ownerContext.newPage();
  const contributorPage = await contributorContext.newPage();
  await Promise.all([
    signIn(requesterPage, requester.email),
    signIn(ownerPage, owner.email),
    signIn(contributorPage, contributor.email),
  ]);

  const submission = await requesterPage.evaluate(
    async ({ templateVersionId, runId }) => {
      const response = await fetch("/api/approval-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateVersionId,
          title: `Three user collaboration ${runId}`,
          idempotencyKey: `phase5-browser-submit-${runId}`,
        }),
      });
      return { status: response.status, body: await response.json() };
    },
    { templateVersionId, runId },
  );
  assert.equal(submission.status, 201);
  const requestNo = submission.body.request.requestNo;

  await ownerPage.goto(
    `${appUrl}/?tab=queue&request=${encodeURIComponent(requestNo)}`,
    { waitUntil: "domcontentloaded" },
  );
  await ownerPage
    .getByText(`Three user collaboration ${runId}`, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });

  const requested = await ownerPage.evaluate(
    async ({ requestNo, contributorId, runId }) => {
      const detail = await fetch(
        `/api/approval-requests/${encodeURIComponent(requestNo)}`,
        { cache: "no-store" },
      ).then((response) => response.json());
      const response = await fetch(
        `/api/approval-requests/${encodeURIComponent(requestNo)}/collaboration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "request_contributor",
            expectedVersion: detail.request.version,
            idempotencyKey: `phase5-browser-request-${runId}`,
            targetProfileId: contributorId,
            requestNote: "Provide independent browser evidence.",
            blocksApproval: true,
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
    { requestNo, contributorId: contributor.id, runId },
  );
  assert.equal(requested.status, 200);
  const collaborationRequestId =
    requested.body.request.task.collaborationRequests[0].id;

  await contributorPage.goto(
    `${appUrl}/?tab=tracking&request=${encodeURIComponent(requestNo)}`,
    { waitUntil: "domcontentloaded" },
  );
  await contributorPage
    .getByText(`Three user collaboration ${runId}`, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  await contributorPage
    .getByText("Provide independent browser evidence.", { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });

  const contributed = await contributorPage.evaluate(
    async ({ requestNo, collaborationRequestId, contributorId, runId }) => {
      const detail = await fetch(
        `/api/approval-requests/${encodeURIComponent(requestNo)}`,
        { cache: "no-store" },
      ).then((response) => response.json());
      const response = await fetch(
        `/api/approval-requests/${encodeURIComponent(requestNo)}/collaboration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_contribution",
            expectedVersion: detail.request.version,
            idempotencyKey: `phase5-browser-contribute-${runId}`,
            collaborationRequestId,
            attachment: {
              key: `phase5-browser-${runId}`,
              fileName: "browser-evidence.txt",
              documentType: "Contributor upload",
              format: "ad_hoc",
              storagePath: `${contributorId}/phase5/browser-evidence.txt`,
            },
            extractedFields: { evidence: "three authenticated contexts" },
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    },
    { requestNo, collaborationRequestId, contributorId: contributor.id, runId },
  );
  assert.equal(contributed.status, 200);
  assert.equal(
    contributed.body.request.task.collaborationRequests[0].status,
    "submitted",
  );

  await ownerPage.reload({ waitUntil: "domcontentloaded" });
  const approvalResponse = ownerPage.waitForResponse(
    (response) =>
      response.url().includes(`/api/approval-requests/${requestNo}/actions`) &&
      response.request().method() === "POST",
  );
  await ownerPage.getByRole("button", { name: "Approve", exact: true }).click();
  assert.equal((await approvalResponse).status(), 200);

  const requesterResult = await requesterPage.evaluate(async (requestNo) => {
    const response = await fetch(
      `/api/approval-requests/${encodeURIComponent(requestNo)}`,
      { cache: "no-store" },
    );
    return { status: response.status, body: await response.json() };
  }, requestNo);
  assert.equal(requesterResult.status, 200);
  assert.equal(requesterResult.body.request.task.status, "approved");
  assert.equal(requesterResult.body.request.version, 3);

  await Promise.all([
    requesterContext.close(),
    ownerContext.close(),
    contributorContext.close(),
  ]);
  console.log("Three-user authoritative collaboration browser suite passed.");
} finally {
  await browser.close();
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
  const email = `phase5-browser-${label}-${runId}@example.com`;
  const name = `Phase 5 browser ${label}`;
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
  const businessName = `Phase 5 Browser Business ${runId}`;
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
  const templateKey = `phase5-browser-${runId}`;
  const snapshot = {
    id: templateKey,
    name: "Three user collaboration workflow",
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
          assigneeName: owner.name,
          assigneeEmail: owner.email,
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
