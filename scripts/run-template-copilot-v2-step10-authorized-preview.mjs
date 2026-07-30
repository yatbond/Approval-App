import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { assertTemplateCopilotV2Step10AuthorizedEnvironment } from "../src/lib/template-copilot-v2-step10-authorized-gate.ts";

const gate = assertTemplateCopilotV2Step10AuthorizedEnvironment(process.env);
const npmEntrypoint = process.env.npm_execpath?.trim();
if (!npmEntrypoint) {
  throw new Error(
    "Run the authorized Preview qualification through its npm script so the npm entrypoint is pinned.",
  );
}

await run(process.execPath, [npmEntrypoint, "run", "test:template-copilot-v2-step10"]);
await run(process.execPath, ["scripts/test-openrouter-copilot-model.mjs"]);
await runSql("scripts/test-template-authoring-rls.sql");
await runSql("scripts/test-template-copilot-db.sql");
await runSql("scripts/test-template-copilot-v2-telemetry-db.sql");
await run(process.execPath, [npmEntrypoint, "run", "test:db:concurrency"]);
await run(process.execPath, [npmEntrypoint, "run", "test:e2e:template-copilot-preview"]);
await run(process.execPath, [npmEntrypoint, "run", "test:e2e:template-copilot-cross-user"]);
await run(process.execPath, [npmEntrypoint, "run", "test:e2e:template-copilot-v2-step8"]);
await run(process.execPath, [npmEntrypoint, "run", "test:e2e:template-copilot-qualification"]);

console.log("template_copilot_v2_step10_authorized_preview=PASS");
console.log(`model=${gate.model}`);
console.log(`provider=${gate.provider}`);
console.log(`preview_origin=${gate.previewOrigin}`);
console.log("zdr_required=PASS");
console.log("telemetry_enabled=PASS");
console.log("database_rls_and_concurrency=PASS");
console.log("three_locale_dark_light_keyboard_accessibility=PASS");

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }.`,
          ),
        );
      }
    });
  });
}

async function runSql(relativePath) {
  const path = resolve(relativePath);
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        gate.postgresContainer,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["pipe", "inherit", "inherit"],
        shell: false,
      },
    );
    const source = createReadStream(path);
    source.once("error", reject);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else {
        reject(
          new Error(
            `${relativePath} failed with ${
              signal ? `signal ${signal}` : `exit code ${code}`
            }.`,
          ),
        );
      }
    });
    source.pipe(child.stdin);
  });
}
