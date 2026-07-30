const requiredAuthorizedPreviewVariables = [
  "OPENROUTER_API_KEY",
  "TEMPLATE_COPILOT_PROVIDER",
  "TEMPLATE_COPILOT_MODEL",
  "TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET",
  "E2E_PREVIEW_SHARE_URL",
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_SERVICE_KEY",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
  "E2E_SECOND_USER_EMAIL",
  "E2E_SECOND_USER_PASSWORD",
  "E2E_CROSS_USER_SESSION_ID",
  "E2E_EXPECTED_COPILOT_MODEL",
  "E2E_EXPECTED_COPILOT_PROVIDER",
  "E2E_EXPECTED_COMMIT",
  "LOCAL_SUPABASE_URL",
  "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
  "LOCAL_POSTGRES_CONTAINER",
] as const;

export function assertTemplateCopilotV2Step10AuthorizedEnvironment(
  env: NodeJS.ProcessEnv,
) {
  const missing = requiredAuthorizedPreviewVariables.filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length) {
    throw new Error(
      `Step 10 authorized qualification is missing: ${missing.join(", ")}.`,
    );
  }
  if (env.TEMPLATE_COPILOT_OPENROUTER_ZDR?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Step 10 authorized qualification requires TEMPLATE_COPILOT_OPENROUTER_ZDR=true.",
    );
  }
  if (env.E2E_REQUIRE_COPILOT_ZDR?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Step 10 authorized qualification requires E2E_REQUIRE_COPILOT_ZDR=true so the deployed Preview is checked.",
    );
  }
  if (env.TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Step 10 authorized qualification requires TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED=true.",
    );
  }
  if (env.E2E_REQUIRE_COPILOT_TELEMETRY?.trim().toLowerCase() !== "true") {
    throw new Error(
      "Step 10 authorized qualification requires E2E_REQUIRE_COPILOT_TELEMETRY=true so the deployed Preview is checked.",
    );
  }
  if ((env.TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET?.trim().length || 0) < 32) {
    throw new Error(
      "TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET must contain at least 32 characters.",
    );
  }
  if (
    env.TEMPLATE_COPILOT_MODEL?.trim() !==
    env.E2E_EXPECTED_COPILOT_MODEL?.trim()
  ) {
    throw new Error(
      "The live provider model and deployed Preview expected model must be identical.",
    );
  }
  if (
    env.TEMPLATE_COPILOT_PROVIDER?.trim() !== "openrouter" ||
    env.E2E_EXPECTED_COPILOT_PROVIDER?.trim() !== "openrouter"
  ) {
    throw new Error(
      "Step 10 authorized qualification requires both the live and deployed expected provider pins to be openrouter.",
    );
  }
  const expectedCommit = env.E2E_EXPECTED_COMMIT?.trim() || "";
  if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
    throw new Error(
      "Step 10 authorized qualification requires one full lowercase Git commit revision.",
    );
  }
  const preview = new URL(env.E2E_PREVIEW_SHARE_URL || "");
  if (preview.protocol !== "https:") {
    throw new Error("The authorized Preview URL must use HTTPS.");
  }
  return Object.freeze({
    model: env.TEMPLATE_COPILOT_MODEL?.trim() || "",
    provider: "openrouter" as const,
    expectedCommit,
    previewOrigin: preview.origin,
    postgresContainer: env.LOCAL_POSTGRES_CONTAINER?.trim() || "",
  });
}
