import assert from "node:assert/strict";
import test from "node:test";
import { assertTemplateCopilotV2Step10AuthorizedEnvironment } from "./template-copilot-v2-step10-authorized-gate.ts";

function validEnvironment() {
  return {
    OPENROUTER_API_KEY: "test-key",
    TEMPLATE_COPILOT_PROVIDER: "openrouter",
    TEMPLATE_COPILOT_MODEL: "qwen/qwen3.5-35b-a3b",
    TEMPLATE_COPILOT_OPENROUTER_ZDR: "true",
    TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED: "true",
    TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET: "x".repeat(32),
    E2E_REQUIRE_COPILOT_ZDR: "true",
    E2E_REQUIRE_COPILOT_TELEMETRY: "true",
    E2E_PREVIEW_SHARE_URL: "https://approval-preview.example.test",
    E2E_SUPABASE_URL: "https://project.supabase.co",
    E2E_SUPABASE_SERVICE_KEY: "service-key",
    E2E_USER_EMAIL: "first@example.test",
    E2E_USER_PASSWORD: "password",
    E2E_SECOND_USER_EMAIL: "second@example.test",
    E2E_SECOND_USER_PASSWORD: "password",
    E2E_CROSS_USER_SESSION_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    E2E_EXPECTED_COPILOT_MODEL: "qwen/qwen3.5-35b-a3b",
    E2E_EXPECTED_COPILOT_PROVIDER: "openrouter",
    E2E_EXPECTED_COMMIT: "a".repeat(40),
    LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: "local-service-key",
    LOCAL_POSTGRES_CONTAINER: "supabase_db_approval",
  };
}

test("the authorized gate requires ZDR and deployed Preview verification", () => {
  for (const variable of [
    "TEMPLATE_COPILOT_OPENROUTER_ZDR",
    "E2E_REQUIRE_COPILOT_ZDR",
    "TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED",
    "E2E_REQUIRE_COPILOT_TELEMETRY",
  ]) {
    const environment = validEnvironment();
    environment[variable] = "false";
    assert.throws(
      () => assertTemplateCopilotV2Step10AuthorizedEnvironment(environment),
      /requires/i,
      variable,
    );
  }
});

test("the authorized gate pins one model and a strong telemetry pseudonym secret", () => {
  const mismatch = validEnvironment();
  mismatch.E2E_EXPECTED_COPILOT_MODEL = "different/model";
  assert.throws(
    () => assertTemplateCopilotV2Step10AuthorizedEnvironment(mismatch),
    /identical/i,
  );
  const weak = validEnvironment();
  weak.TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET = "too-short";
  assert.throws(
    () => assertTemplateCopilotV2Step10AuthorizedEnvironment(weak),
    /at least 32/i,
  );
  const valid = assertTemplateCopilotV2Step10AuthorizedEnvironment(
    validEnvironment(),
  );
  assert.equal(valid.model, "qwen/qwen3.5-35b-a3b");
  assert.equal(valid.provider, "openrouter");
  assert.equal(valid.expectedCommit, "a".repeat(40));
  assert.equal(valid.previewOrigin, "https://approval-preview.example.test");
});

test("the authorized gate requires one canonical full Git revision", () => {
  for (const revision of ["abc123", "A".repeat(40), "a".repeat(39), "g".repeat(40)]) {
    const environment = validEnvironment();
    environment.E2E_EXPECTED_COMMIT = revision;
    assert.throws(
      () => assertTemplateCopilotV2Step10AuthorizedEnvironment(environment),
      /full lowercase Git commit revision/i,
      revision,
    );
  }
});

test("the authorized gate rejects a provider fallback even when ZDR is true", () => {
  for (const variable of [
    "TEMPLATE_COPILOT_PROVIDER",
    "E2E_EXPECTED_COPILOT_PROVIDER",
  ]) {
    const environment = validEnvironment();
    environment[variable] = "zai";
    assert.throws(
      () => assertTemplateCopilotV2Step10AuthorizedEnvironment(environment),
      /provider pins.*openrouter/i,
      variable,
    );
  }
});
