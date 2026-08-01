import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  resolveTemplateCopilotOpenRouterRouting,
  templateCopilotOpenRouterQualificationRoutingProfile,
  templateCopilotOpenRouterRoutingProfileEnvironmentVariable,
  TemplateCopilotOpenRouterRoutingProfileError,
} from "./template-copilot-openrouter-routing.ts";

test("default OpenRouter routing remains unchanged and keeps ZDR independent", () => {
  assert.deepEqual(
    resolveTemplateCopilotOpenRouterRouting({
      rawProfile: undefined,
      requireZdr: false,
      vercelEnvironment: "preview",
    }),
    {
      profile: null,
      provider: { require_parameters: true },
    },
  );
  assert.deepEqual(
    resolveTemplateCopilotOpenRouterRouting({
      rawProfile: "",
      requireZdr: true,
      vercelEnvironment: "preview",
    }),
    {
      profile: null,
      provider: { require_parameters: true, zdr: true },
    },
  );
});

test("qualification throughput profile is exact, single-attempt, and credential-free", () => {
  assert.equal(
    templateCopilotOpenRouterRoutingProfileEnvironmentVariable,
    "TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE",
  );
  assert.equal(
    templateCopilotOpenRouterQualificationRoutingProfile,
    "qualification_throughput_single_attempt_v1",
  );
  assert.deepEqual(
    resolveTemplateCopilotOpenRouterRouting({
      rawProfile: templateCopilotOpenRouterQualificationRoutingProfile,
      requireZdr: true,
      vercelEnvironment: "preview",
    }),
    {
      profile: "qualification_throughput_single_attempt_v1",
      provider: {
        require_parameters: true,
        zdr: true,
        sort: "throughput",
        ignore: ["akashml"],
        allow_fallbacks: false,
      },
    },
  );
  assert.deepEqual(
    resolveTemplateCopilotOpenRouterRouting({
      rawProfile: templateCopilotOpenRouterQualificationRoutingProfile,
      requireZdr: false,
      vercelEnvironment: "preview",
    }).provider,
    {
      require_parameters: true,
      sort: "throughput",
      ignore: ["akashml"],
      allow_fallbacks: false,
    },
  );
});

test("unknown profiles and Production qualification routing fail closed", () => {
  assert.throws(
    () =>
      resolveTemplateCopilotOpenRouterRouting({
        rawProfile: "qualification_throughput_single_attempt_v2",
        requireZdr: true,
        vercelEnvironment: "preview",
      }),
    (error) => {
      assert.ok(error instanceof TemplateCopilotOpenRouterRoutingProfileError);
      assert.match(error.message, /must be/);
      return true;
    },
  );
  assert.throws(
    () =>
      resolveTemplateCopilotOpenRouterRouting({
        rawProfile: templateCopilotOpenRouterQualificationRoutingProfile,
        requireZdr: true,
        vercelEnvironment: "production",
      }),
    (error) => {
      assert.ok(error instanceof TemplateCopilotOpenRouterRoutingProfileError);
      assert.match(error.message, /forbidden in Production/);
      return true;
    },
  );
});

test("AI routing metadata exposes the selected profile without credentials", () => {
  const moduleUrl = new URL("./template-copilot-ai.ts", import.meta.url).href;
  const fakeCredential = "qualification-test-credential-must-not-appear";
  const script = [
    'process.env.TEMPLATE_COPILOT_PROVIDER = "openrouter";',
    `process.env.OPENROUTER_API_KEY = ${JSON.stringify(fakeCredential)};`,
    'process.env.TEMPLATE_COPILOT_OPENROUTER_ZDR = "true";',
    `process.env.TEMPLATE_COPILOT_OPENROUTER_ROUTING_PROFILE = ${JSON.stringify(templateCopilotOpenRouterQualificationRoutingProfile)};`,
    'process.env.VERCEL_ENV = "preview";',
    "delete process.env.TEMPLATE_COPILOT_MODEL;",
    `const { getTemplateCopilotAiRoutingMetadata } = await import(${JSON.stringify(moduleUrl)});`,
    "console.log(JSON.stringify(getTemplateCopilotAiRoutingMetadata()));",
  ].join("\n");
  const result = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      script,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    model: "qwen/qwen3.5-flash-02-23",
    providerCode: "openrouter",
    privacyMode: "zdr",
    routingProfile: "qualification_throughput_single_attempt_v1",
  });
  assert.doesNotMatch(result.stdout, new RegExp(fakeCredential));
});
