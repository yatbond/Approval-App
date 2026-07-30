import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import signoffModule from "../src/lib/template-copilot-v2-step8-signoff.ts";

const { validateTemplateCopilotV2Step8Signoff } = signoffModule;
const input = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL("../docs/template-authoring/step-8-language-review-signoff.json", import.meta.url);

let payload;
try {
  payload = JSON.parse(await readFile(input, "utf8"));
} catch (error) {
  console.error("step8_signoff=INVALID");
  console.error(`step8_signoff_issue=${error instanceof Error ? error.message : "Unable to read the sign-off file."}`);
  process.exitCode = 1;
  process.exit();
}

const result = validateTemplateCopilotV2Step8Signoff(payload);
if (!result.valid) {
  console.error("step8_signoff=INVALID");
  for (const issue of result.issues) {
    console.error(`step8_signoff_issue=${issue.path || "<root>"}: ${issue.message}`);
  }
  process.exitCode = 1;
} else if (Object.values(result.signoff.locales).some((review) => review.decision === "rejected")) {
  console.error("step8_signoff=REJECTED");
  for (const [locale, review] of Object.entries(result.signoff.locales)) {
    console.error(`step8_signoff_locale=${locale}:${review.decision}`);
  }
  process.exitCode = 3;
} else if (!result.productionReady) {
  console.error("step8_signoff=PENDING");
  for (const [locale, review] of Object.entries(result.signoff.locales)) {
    console.error(`step8_signoff_locale=${locale}:${review.decision}`);
  }
  process.exitCode = 2;
} else {
  console.log("step8_signoff=APPROVED");
  for (const [locale, review] of Object.entries(result.signoff.locales)) {
    console.log(`step8_signoff_locale=${locale}:${review.decision}:${review.reviewerName}:${review.evidenceReference}`);
  }
}
