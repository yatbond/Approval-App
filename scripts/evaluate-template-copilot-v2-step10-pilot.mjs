import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateTemplateCopilotV2Pilot,
  parseTemplateCopilotV2PilotCsv,
} from "../src/lib/template-copilot-v2-step10-qualification.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputPath = path.resolve(
  process.argv[2] ||
    path.join(
      root,
      "docs",
      "template-authoring",
      "step-10-pilot-observation-template.csv",
    ),
);
const observations = parseTemplateCopilotV2PilotCsv(
  await fs.readFile(inputPath, "utf8"),
);
const result = evaluateTemplateCopilotV2Pilot(observations);
process.stdout.write(
  `${JSON.stringify({ inputPath, ...result }, null, 2)}\n`,
);
if (result.status !== "passed") process.exitCode = 1;
