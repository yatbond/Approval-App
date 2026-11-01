// Writes a git-ignored file you can paste into Vercel (Project → Settings →
// Environment Variables → "Import .env") so the branch preview runs the v3
// sectioned Describe against the hosted TEST project and the home model.
//
//   node scripts/make-vercel-preview-env.mjs [--login you@example.com]
//
// It reads the secrets from the local git-ignored env files, never prints them,
// and (with --login) creates one sign-in for that address in the hosted TEST
// project only. It refuses to run if the env points at the live project.
// Pasting the result into Vercel is a step for the project owner: it contains
// the test project's service key and the model server's API key.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const liveRef = "wlbxrdmpwuupjyarjcxb";
const testRef = "uvgjjmuqcreultmqxdzq";
const parse = (file) => Object.fromEntries(
  readFileSync(file, "utf8").split("\n").filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const local = parse(".env.local");
if (!local.NEXT_PUBLIC_SUPABASE_URL?.includes(`${testRef}.supabase.co`) || local.NEXT_PUBLIC_SUPABASE_URL.includes(liveRef)) {
  throw new Error("Point .env.local at the hosted TEST project first; refusing to write settings for any other project.");
}
const need = (name) => {
  if (!local[name]) throw new Error(`.env.local is missing ${name}.`);
  return local[name];
};

const preview = {
  NEXT_PUBLIC_SUPABASE_URL: need("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: need("SUPABASE_SERVICE_ROLE_KEY"),
  TEMPLATE_COPILOT_V2: "true",
  TEMPLATE_COPILOT_V2_STEP4: "true",
  TEMPLATE_COPILOT_V2_STEP5_EDITING: "true",
  TEMPLATE_COPILOT_V2_GUIDED: "true",
  TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING: "true",
  TEMPLATE_COPILOT_V2_SIMILAR_TEMPLATE: "true",
  TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR: "true",
  TEMPLATE_COPILOT_V2_CONDITION_EDITOR: "true",
  TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR: "true",
  TEMPLATE_COPILOT_V3_DESCRIBE: "true",
  NEXT_PUBLIC_TEMPLATE_COPILOT_V3_DESCRIBE: "true",
  TEMPLATE_COPILOT_PROVIDER: "self_hosted",
  TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL: need("TEMPLATE_COPILOT_SELF_HOSTED_BASE_URL"),
  TEMPLATE_COPILOT_SELF_HOSTED_API_KEY: need("TEMPLATE_COPILOT_SELF_HOSTED_API_KEY"),
  TEMPLATE_COPILOT_MODEL: need("TEMPLATE_COPILOT_MODEL"),
};

const loginIndex = process.argv.indexOf("--login");
let loginNote = "";
if (loginIndex >= 0) {
  const email = process.argv[loginIndex + 1];
  const service = createClient(preview.NEXT_PUBLIC_SUPABASE_URL, preview.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = `Test-${randomBytes(9).toString("hex")}!a1`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Copilot test author" } });
  if (error || !data.user) throw new Error(`Could not create the test login: ${error?.message}`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data: found } = await service.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
    if (found) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const profile = { id: data.user.id, email, full_name: "Copilot test author", role: "superuser", is_admin: true, is_active: true };
  const { data: existing } = await service.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  const write = existing ? await service.from("profiles").update(profile).eq("id", data.user.id) : await service.from("profiles").insert(profile);
  if (write.error) throw new Error(`Could not create the test profile: ${write.error.message}`);
  const unit = await service.from("business_units").select("id").eq("is_active", true).limit(1).maybeSingle();
  if (!unit.data) {
    const created = await service.from("business_units").insert({ name: "Test Business", is_active: true }).select("id").single();
    if (created.error) throw new Error(`business unit: ${created.error.message}`);
    const dept = await service.from("business_departments").insert({ business_unit_id: created.data.id, name: "Test Department", is_active: true });
    if (dept.error) throw new Error(`department: ${dept.error.message}`);
  }
  loginNote = `# Sign in to the preview with: ${email}\n# Password: ${password}\n`;
}

mkdirSync("output", { recursive: true });
const body = [
  "# Vercel preview settings for branch codex/template-authoring-copilot (TEST project + home model).",
  "# Paste into Project → Settings → Environment Variables → Import .env, environment: Preview.",
  "# Limit each variable to the Git branch codex/template-authoring-copilot if you can, so other",
  "# previews keep using their own database. Delete this file after pasting; it holds secrets.",
  loginNote,
  ...Object.entries(preview).map(([name, value]) => `${name}=${value}`),
  "",
].join("\n");
writeFileSync("output/vercel-preview-v3.env", body);
console.log(`Wrote output/vercel-preview-v3.env with ${Object.keys(preview).length} variables${loginNote ? " and a test login" : ""}. Nothing was printed or sent.`);
