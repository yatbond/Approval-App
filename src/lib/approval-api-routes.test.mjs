import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("every personalized approval route authenticates and returns no-store responses", () => {
  const routes = [
    "../app/api/me/route.ts",
    "../app/api/directory/route.ts",
    "../app/api/approval-requests/route.ts",
    "../app/api/approval-requests/[requestNo]/route.ts",
    "../app/api/approval-requests/[requestNo]/actions/route.ts",
  ];
  for (const route of routes) {
    const source = read(route);
    assert.match(source, /createApprovalServerContext\(request\)/, route);
    assert.match(source, /approval(?:Error|Json)\(/, route);
  }
  const server = read("./approval-server.ts");
  assert.match(server, /Cache-Control": "private, no-store, max-age=0"/);
  assert.match(server, /createSupabaseJsonResponse/);
});

test("runtime action and submission routes expose only intended methods", () => {
  const collection = read("../app/api/approval-requests/route.ts");
  const detail = read("../app/api/approval-requests/[requestNo]/route.ts");
  const actions = read("../app/api/approval-requests/[requestNo]/actions/route.ts");
  assert.match(collection, /export async function GET/);
  assert.match(collection, /export async function POST/);
  assert.match(detail, /export async function GET/);
  assert.doesNotMatch(detail, /export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.match(actions, /export async function POST/);
  assert.doesNotMatch(actions, /export async function (?:GET|PUT|PATCH|DELETE)/);
});

test("action route maps stable 400, 403, 404, 409, 422, 429, and 503 outcomes", () => {
  const actions = read("../app/api/approval-requests/[requestNo]/actions/route.ts");
  const commandData = read("./approval-server-data.ts");
  for (const status of [400, 403, 404, 409, 422, 429, 503]) {
    assert.match(actions, new RegExp(`\\b${status}\\b`), String(status));
  }
  for (const code of [
    "invalid_request",
    "forbidden",
    "request_not_found",
    "stale_version",
    "idempotency_conflict",
    "already_decided",
    "invalid_target",
    "rate_limited",
    "dependency_unavailable",
  ]) {
    assert.match(`${actions}\n${commandData}`, new RegExp(code), code);
  }
});
