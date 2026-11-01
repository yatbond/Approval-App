import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isAuthorizedCronRequest } from "./cron-auth.ts";

const [route, answerRoute, vercel, drain, serverData] = await Promise.all([
  readFile(new URL("../app/api/cron/approval-operations/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/template-authoring/copilot/sessions/[sessionId]/answers/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../../vercel.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("./template-copilot-v2-extraction-drain.ts", import.meta.url), "utf8"),
  readFile(new URL("./template-copilot-v2-server-data.ts", import.meta.url), "utf8"),
]);

test("the existing once-per-minute Vercel cron autonomously invokes the extraction drain", () => {
  assert.deepEqual(vercel.crons, [{
    path: "/api/cron/approval-operations",
    schedule: "* * * * *",
  }]);
  assert.match(route, /drainTemplateCopilotV2ExtractionJobs/);
  assert.match(route, /Promise\.all\(\[[\s\S]*runDurableApprovalOperations[\s\S]*drainTemplateCopilotV2ExtractionJobs\(\)/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.match(route, /export const maxDuration = 60/);
});

test("cron authorization fails closed before either scheduled worker can run", () => {
  const handler = route.indexOf("export async function GET");
  const auth = route.indexOf("if (!isAuthorizedCronRequest(request))", handler);
  const approval = route.indexOf("runDurableApprovalOperations", handler);
  const extraction = route.indexOf("drainTemplateCopilotV2ExtractionJobs()", handler);
  assert.ok(auth >= 0 && auth < approval && auth < extraction);
  assert.equal(isAuthorizedCronRequest(new Request("https://example.test/api/cron/approval-operations"), "0123456789abcdef"), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://example.test/api/cron/approval-operations", {
    headers: { authorization: "Bearer wrong-wrong-wrong" },
  }), "0123456789abcdef"), false);
  assert.equal(isAuthorizedCronRequest(new Request("https://example.test/api/cron/approval-operations", {
    headers: { authorization: "Bearer 0123456789abcdef" },
  }), "0123456789abcdef"), true);
  assert.equal(isAuthorizedCronRequest(new Request("https://example.test/api/cron/approval-operations", {
    headers: { authorization: "Bearer short" },
  }), "short"), false);
});

test("manual answer commit remains independent from post-response interruption and scheduled recovery", () => {
  const mutation = answerRoute.indexOf("const result = await applyTemplateCopilotV2AtomicAnswer");
  const enqueue = answerRoute.indexOf("enqueueExtractionJob: candidateCreationEnabled", mutation);
  const after = answerRoute.indexOf("after(async () =>", enqueue);
  const response = answerRoute.indexOf("return templateAuthoringRpcResponse", after);
  assert.ok(mutation >= 0 && mutation < enqueue && enqueue < after && after < response);
  assert.match(drain, /dequeue_template_copilot_v2_answer_extraction_jobs/);
  assert.match(drain, /jobId: job\.jobId/);
  assert.doesNotMatch(drain, /safeApprovalLog|console\.(?:info|error|warn)/);
});

test("scheduled dequeue configuration is fixed server-side and cannot be supplied by a browser", () => {
  assert.match(drain, /const defaultBatchSize = 4/);
  assert.match(drain, /const maximumBatchSize = 8/);
  assert.match(drain, /const defaultConcurrency = 2/);
  assert.match(drain, /const maximumConcurrency = 4/);
  assert.match(drain, /const defaultTimeBudgetMs = 25_000/);
  assert.match(drain, /const maximumTimeBudgetMs = 30_000/);
  assert.match(drain, /p_lease_seconds: leaseSeconds/);
  assert.doesNotMatch(route, /request\.json|searchParams/);
});

test("service-role candidate persistence proves the opaque owner binding before receipt access", () => {
  const start = serverData.indexOf("export async function applyTemplateCopilotV2CandidateExtraction");
  const end = serverData.indexOf("\n}\n\ntype TemplateCopilotV2ExtractionJobDependencies", start);
  const candidatePersistence = serverData.slice(start, end);
  const ownerRead = candidatePersistence.indexOf("loadV2StoredSession(session, sessionId, actor.id)");
  const receiptRead = candidatePersistence.indexOf("loadV2Receipt(session, sessionId");
  assert.ok(ownerRead >= 0 && ownerRead < receiptRead);
  assert.match(serverData, /if \(ownerId\) query = query\.eq\("owner_id", ownerId\)/);
});
