// Builds the local Copilot test database: the live project's table structure
// (a read-only structure dump, never data) plus every migration after the last
// one the live project has, in a throw-away Supabase project run by Docker.
//
//   SUPABASE_DB_PASSWORD=... node scripts/setup-local-copilot-test-db.mjs [--dir <work dir>] [--after 20260721084727] [--no-start] [--linked-dir <folder where `supabase link` was run>]
//
// Why not just `supabase start`: the migrations in this repository cannot build
// a database from nothing (the base schema was created by hand in the live
// project), so the live structure is the baseline. Nothing here writes to the
// live project and nothing is applied to it.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const workDir = resolve(arg("dir", join("output", "local-copilot-test-db")));
const after = arg("after", "20260721084727");
const linkedDir = resolve(arg("linked-dir", "."));
const projectId = "approval_copilot_test";
const skipServices = "studio,imgproxy,vector,logflare,edge-runtime,realtime,storage-api,inbucket,mailpit,postgres-meta";

function run(args, options = {}) {
  // shell: true is needed for npx on Windows, so paths with spaces are quoted.
  const quoted = args.map((value) => (/\s/.test(value) ? `"${value}"` : value));
  const result = spawnSync("npx", ["supabase", ...quoted], { stdio: "inherit", shell: true, ...options });
  if (result.status !== 0) throw new Error(`supabase ${args[0]} failed (exit ${result.status}).`);
}

if (!process.env.SUPABASE_DB_PASSWORD) {
  throw new Error("Set SUPABASE_DB_PASSWORD (read-only structure dump of the linked project).");
}
if (!existsSync("supabase/config.toml")) throw new Error("Run from the repository root.");

rmSync(join(workDir, "supabase"), { recursive: true, force: true });
const migrations = join(workDir, "supabase", "migrations");
mkdirSync(migrations, { recursive: true });

console.log("1/3 dumping the live structure (no data)…");
run(["db", "dump", "--linked", "--workdir", linkedDir, "--schema", "public,private", "-f", join(migrations, "20000101000000_live_baseline.sql")]);

console.log(`2/3 copying every migration after ${after}…`);
const newer = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql") && name.split("_")[0] > after).sort();
for (const name of newer) copyFileSync(join("supabase", "migrations", name), join(migrations, name));
const config = readFileSync("supabase/config.toml", "utf8").replace(/^project_id = .*$/m, `project_id = "${projectId}"`);
writeFileSync(join(workDir, "supabase", "config.toml"), config);
console.log(`   baseline + ${newer.length} migrations (${newer[0]} … ${newer.at(-1)})`);

if (flag("no-start")) {
  console.log(`3/3 skipped (--no-start). Start with: npx supabase start --workdir "${workDir}" -x ${skipServices}`);
} else {
  console.log("3/3 starting the local database…");
  run(["start", "--workdir", workDir, "-x", skipServices]);
  console.log(`Ready. Container: supabase_db_${projectId}. Put the printed API URL and keys in .env.local.`);
}
