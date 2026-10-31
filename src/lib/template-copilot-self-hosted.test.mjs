import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const moduleUrl = new URL("./template-copilot-ai.ts", import.meta.url).href;

function resolveWith(env) {
  const script = [
    ...Object.entries(env).map(([key, value]) =>
      value === undefined
        ? `delete process.env.${key};`
        : `process.env.${key} = ${JSON.stringify(value)};`,
    ),
    `const { getTemplateCopilotAiRoutingMetadata } = await import(${JSON.stringify(moduleUrl)});`,
    "try { console.log(JSON.stringify(getTemplateCopilotAiRoutingMetadata())); }",
    "catch (error) { console.log(JSON.stringify({ error: error.message })); }",
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
  return { stdout: result.stdout, parsed: JSON.parse(result.stdout) };
}

const fakeKey = "self-hosted-test-key-must-not-appear";
const baseEnv = {
  TEMPLATE_COPILOT_PROVIDER: "self_hosted",
  TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL: "https://model.example.test/v1",
  TEMPLATE_COPILOT_SELF_HOSTED_API_KEY: fakeKey,
  TEMPLATE_COPILOT_MODEL: "qwen3.8-flash-next-iq3_s",
  TEMPLATE_COPILOT_SELF_HOSTED_ACCESS_CLIENT_ID: undefined,
  TEMPLATE_COPILOT_SELF_HOSTED_ACCESS_CLIENT_SECRET: undefined,
  VERCEL_ENV: "production",
};

test("a keyed HTTPS self-hosted server resolves without exposing its key", () => {
  const { stdout, parsed } = resolveWith(baseEnv);
  assert.deepEqual(parsed, {
    model: "qwen3.8-flash-next-iq3_s",
    providerCode: "self_hosted",
    privacyMode: "standard",
    routingProfile: null,
  });
  assert.doesNotMatch(stdout, new RegExp(fakeKey));
});

test("self-hosted configuration fails closed", () => {
  const errorFor = (overrides) => resolveWith({ ...baseEnv, ...overrides }).parsed.error;
  assert.match(errorFor({ TEMPLATE_COPILOT_SELF_HOSTED_API_KEY: undefined }), /API_KEY/);
  assert.match(errorFor({ TEMPLATE_COPILOT_MODEL: undefined }), /TEMPLATE_COPILOT_MODEL/);
  assert.match(errorFor({ TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL: "not a url" }), /absolute URL/);
  // Plain HTTP is only for a local (non-Vercel) run.
  assert.match(
    errorFor({ TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL: "http://192.168.1.207:8080/v1" }),
    /https on Vercel/,
  );
  assert.equal(
    errorFor({
      TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL: "http://192.168.1.207:8080/v1",
      VERCEL_ENV: undefined,
    }),
    undefined,
  );
  assert.match(
    errorFor({ TEMPLATE_COPILOT_SELF_HOSTED_ACCESS_CLIENT_ID: "id-only" }),
    /both/,
  );
});

test("self-hosted chat requests mirror the token cap, sample at temperature 0 and turn thinking off", async () => {
  const { selfHostedChatFetch } = await import("./template-copilot-self-hosted-fetch.ts");
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: init?.body });
    return new Response("{}");
  };
  try {
    await selfHostedChatFetch("https://model.example.test/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "m", max_completion_tokens: 3072 }),
    });
    await selfHostedChatFetch("https://model.example.test/v1/models", { method: "GET" });
  } finally {
    globalThis.fetch = original;
  }
  assert.deepEqual(JSON.parse(seen[0].body), {
    model: "m",
    max_completion_tokens: 3072,
    max_tokens: 3072,
    temperature: 0,
    chat_template_kwargs: { enable_thinking: false },
  });
  assert.equal(seen[1].body, undefined);
});
