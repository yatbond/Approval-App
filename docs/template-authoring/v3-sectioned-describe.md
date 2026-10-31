# Template Copilot: sectioned Describe on the v3 reader

The sectioned Describe replaces "type everything in one box" with nine labelled
boxes read by the v3 quote-first reader. A person always reviews and confirms
every fact before a draft is created. Nothing is persisted by the reader.

## Flow

1. `POST /api/template-authoring/copilot/sessions` starts a Guided session as
   before.
2. `POST …/sessions/{id}/describe-v3` takes `{ locale, sections: [{ slot, text }] }`
   (slots: `identity_scope`, `initiators_fields`, `attachments`,
   `stages_participants`, `conditions_exceptions`, `collaboration_corrections`,
   `timing_escalation`, `visibility_notifications`, `governance`). It runs the
   five fixed v3 batches (one retry per failed batch, never for configuration or
   privacy failures), assembles the review and returns a **proposal**:
   every value is marked `source` (quoted from the text) or `suggested`
   (a deterministic default such as a field's input type or the order of steps).
   It returns 503 `describe_unavailable` when the model cannot be reached; the
   caller falls back to the Guided questions.
3. The person edits the proposal. Each fact is committed with the existing
   `…/facts` command (`human_commit`; `mark_not_applicable` for the three
   optional facts when empty), in the order in
   `templateCopilotV3CommitOrder`.
4. `…/create-draft` marks the completed interview `ready`
   (`mark_template_copilot_v2_session_ready`) and creates the draft.

## What is held for a person

- **Conditional routing rules**: shown with the reader's checked reading
  ("Use this rule"); never executable on their own.
- **Conditional documents**: kept as optional (the workflow engine has no
  "only when" documents).
- **In-app (native) forms**: the draft compiler cannot create a form without
  field definitions; design them in the visual builder afterwards.
- **A requester's own submission** is not a step; a submission by someone else
  cannot be compiled automatically and is held.

## Switches

| Name | Where | Meaning |
|---|---|---|
| `TEMPLATE_COPILOT_V3_DESCRIBE=true` | server | enables the `describe-v3` route |
| `NEXT_PUBLIC_TEMPLATE_COPILOT_V3_DESCRIBE=true` | build time | shows the sectioned screen instead of the classic Copilot |
| `TEMPLATE_COPILOT_PROVIDER=self_hosted` + `…_SELF_HOSTED_BASE_URL/_API_KEY`, `TEMPLATE_COPILOT_MODEL` | server | home model behind a Cloudflare Tunnel |

The route gives each model call its own 45 s window and the request 300 s; one
batch can take about 20 s on a self-hosted model.

## Database

Two corrective migrations were needed (found by running the flow end to end):

- `20260731000000_fix_template_copilot_v2_fact_dependents_ambiguity.sql`: the
  dependents helper reused a variable name as a column alias, so every fact
  mutation failed.
- `20260731000100_template_copilot_v2_mark_ready.sql`: a v2 interview never
  became `ready`, so create-draft always refused.

The migrations in this repository cannot build a database from nothing (the
base schema was created by hand in the live project). To test locally, `scripts/setup-local-copilot-test-db.mjs` does this in one
command (needs `SUPABASE_DB_PASSWORD` and a folder where `supabase link` was
run; it only reads the live structure). By hand it is:

```
supabase db dump --linked --schema public,private -f baseline.sql   # read-only
# new local project: baseline.sql as the first migration, then every
# migration after 20260721084727, then `supabase start --workdir …`
```

## Simulated users

`scripts/template-copilot-v3-simulation/` runs 50 generated workflows
(English, Traditional and Simplified Chinese; parallel approvals, tiered
amounts, conditional documents, native forms, distractor sentences, long lists)
through the real routes as a signed-in user, scores the reader's proposal
against the answer key, applies the corrections a careful person would, creates
the draft and checks the stored draft.

```
node scripts/template-copilot-v3-simulation/run.mjs --start 0 --count 50 --label name
node scripts/template-copilot-v3-simulation/report.mjs output/template-copilot-v3-simulation/name/results.json
```

It refuses to run unless Supabase is local. Do not edit `src/` while a run is in
progress: the dev server recompiles and in-flight requests can fail.

## Results of the first full simulation (local database, home model)

Fifty generated workflows, read with the self-hosted Qwen model at
temperature 0, corrected by the specification, confirmed fact by fact and
created as drafts:

- 50 of 50 drafts were created and matched the author's intent.
- Before any correction the reader had right: fields 99.7%, documents 100%,
  stages 99.5%, notifications 100%, scalars 98%; amount-based routing rules only
  31% (they are held and offered as "Use this rule"). Mean corrections per
  workflow: 0.8; reading time median 62 s, p95 70 s.
- The earlier run (36 of 50) is explained by a checker that only knew the English
  word "parallel", two requests that failed while source files were being
  edited mid-run, and the model sampling at its default temperature 1.0 instead
  of 0 (now set by the self-hosted provider).
- A browser run (Playwright) of the nine-box screen in English and Traditional
  Chinese confirmed the full path with no browser errors.

## Local test environment notes

- The Next dev server on the Google-Drive/NAS share sometimes misses the nested
  `sessions/[sessionId]/…` routes at start-up (they answer 404 HTML). Touching
  the route files (`find … -name route.ts -exec touch {} \;`) registers them.
- The page shows built-in demo data first and swaps in the database data a
  moment later; wait for the swap before typing (the browser script does).
- The screen lists only business units whose ids are database UUIDs, the same
  rule as the classic Copilot.

## Database checks that were run on the local test database

- `scripts/test-template-copilot-db.sql`, `test-template-authoring-db.sql`,
  `test-template-authoring-rls.sql`, `test-template-copilot-v2-telemetry-db.sql`
  and `npm run test:db:template-copilot-v2-reviewed-library` all pass.
- The v3 PostgreSQL parity test needs one exact pinned image
  (`RUN_TEMPLATE_COPILOT_V3_POSTGRES_PARITY=1`) and was not run here.
- The 50-workflow run exercises sessions, fact mutations, readiness and draft
  creation against this database.
- Nothing in this document has been applied to the live Supabase project.
