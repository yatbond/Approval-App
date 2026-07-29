# Phase 2: embedded Template Copilot

## Trust model

The model is an interpreter and draft generator, not an authority.

## Copilot v2 Step 1: field ledger foundation

`TEMPLATE_COPILOT_V2=true` is a server-only gate for the v2 field ledger.
With the flag off, all existing Copilot routes and schema-version-1 sessions
continue to use the v1 ten-section flow unchanged.

V2 stores a JSONB-compatible `schemaVersion: 2` ledger with stable field IDs,
bounded canonical values and evidence, status (`candidate`, `committed`,
`unknown`, `not_applicable`, `unresolved`, or `conflicting`), human
confirmation metadata, coded applicability/blocking, and pinned dependency and
question-library metadata. The v2 mutation adapter derives its actor from the
authenticated server context, validates a bounded operation before calling the
existing service-only revision/idempotency RPC, and returns server-derived gaps
and readiness. Model output can create neither a committed fact nor a readiness
state.

The Step 1 migration `20260726163240_template_copilot_v2_ledger.sql` adds a
service-role-only v2 start RPC, a locked fact-mutation RPC, a locked legacy
upgrade RPC, idempotency receipts, and append-only audit events. Each audit
event records the server-derived actor, operation, fact ID, command hash,
before/after revision, outcome, and bounded result detail. The database lock
and expected-revision comparison prevent a server's pre-validation read from
overwriting a concurrent edit. Reusing an idempotency key with a different
canonical command hash is rejected.

V2 receipts and audit events are intentionally immutable retention evidence:
there are no application-role update/delete grants, immutable-row triggers
reject changes, and restrictive foreign keys prevent a session or profile from
being silently deleted underneath its audit trail. Any future retention or
deletion workflow must be an explicitly reviewed migration with equivalent
audit preservation.

The v2 fact route accepts only a fact ID, expected revision, idempotency key,
and an operation-specific bounded payload. It never accepts a whole ledger,
an actor, a confirmation timestamp, readiness, or audit data. The server loads
the current owner-scoped session, derives actor and clock, validates the typed
value, and returns only the RPC's persisted result. `human_commit` and
`resolve_conflict` are distinct operations; neither a candidate nor an unknown
can overwrite a committed, human-confirmed N/A, or conflicting fact.

Draft, publication, and activation readiness are pure ledger-derived results.
Candidates, unknowns, unresolved facts, conflicts, unmet dependencies, and
compiler errors are returned as coded gaps. Activation additionally requires a
later lifecycle action to prove the exact revision was published; an interview
can never make a template activation-ready by itself.

V1 remains a distinct parser and is read-only to v2 code. An upgrade starts
with a deterministic preview that maps each v1 section summary to candidate
facts (or unresolved facts), including its legacy source references. A caller
must approve the exact preview hash before a v2 ledger is created, and that
operation creates candidates only—never committed executable facts. There is no
v2-to-v1 conversion and no silent reinterpretation.

The preview hash covers the source session ID and revision, business/department
scope, locale, sanitized-document identity (ID/name/SHA-256), target library
version, mappings, and unresolved IDs. Approval is itself a revisioned,
idempotent server mutation. A changed source or preview hash is rejected rather
than converted.

## Copilot v2 Step 2: deterministic atomic interview controller

Each v2 ledger pins `questionLibraryVersion`; Step 2 resolves that version only
from a server-owned, immutable question library. The current `v2.0` library
contains several stable questions for a workflow fact when the fact needs
several decisions. For example, workflow scope asks what is included and then
what is excluded; a stage asks for the step, how its person is chosen, and only
then the appropriate email, role, or request-field detail. An answer is one
bounded atomic decision, never a broad fact overwrite. The deterministic
assembler produces a review-only, provenance-preserving broad-fact candidate;
it cannot mark that fact committed or create an executable workflow.

Primary prompts use ordinary language and ask one thing only. Examples are
separate labelled metadata, so they are helpful without being recorded as
evidence. The library separately asks whether a route changes, which request
detail decides it, how it is compared, the value, the matching action, and the
non-matching action. It likewise separates response time, reminder time, and
what happens after no response; notification event, recipient, and channel;
and the owning department, reviewer, and policy/rule.

The controller is pure and deterministic: it validates the pinned library,
rejects duplicate IDs/priorities, unknown references, self-dependencies, and
cycles, then selects the applicable pending atomic decision using its unique
priority. It returns its rationale and stable blocked/complete gaps alongside
the next localized prompt. Locale changes prompt text only; the chosen question
and ordering come solely from the ledger and pinned library version. Refreshing
a v2 session recomputes the same controller state from its persisted ledger.

Applicability has three states: applicable, pending, and proven inapplicable.
An unanswered deciding question is pending, never N/A. A question is excluded
only after its deciding answer proves it does not apply; no fresh session can
hide notifications because visibility or another earlier answer is unresolved.
The answer endpoint accepts only a revision, retry key, and answer text. It
loads the authoritative session, derives the single next decision itself, and
appends exactly that decision through a service-role-only locked RPC. The RPC
rejects any accompanying change to broad facts, scope, extracts, or earlier
atomic answers. Stale revisions and retry-key/hash mismatches are rejected;
matching retries return the original persisted result before a newer interview
state is read.

The Step 2 migration `20260727190000_template_copilot_v2_atomic_decisions.sql`
adds that append-only decision RPC. Rollback is feature-flag-first: set
`TEMPLATE_COPILOT_V2=false` to stop new v2 sessions while preserving existing
pinned v2 records and receipts. Do not delete the migration or audit evidence;
a later reviewed migration is required for any data-retention change.

Choice questions expose server-owned option IDs (for example `yes`, `no`,
`fixed_email`, and `directory_role`) and store the canonical option ID with a
safe translated display value. Free prose is rejected for a choice; it cannot
accidentally mean “no” and hide a later question. Repeating fields,
attachments, stages, conditions, and notifications use bounded server-created
instance IDs and explicit “another?” decisions. The caps are 20, 20, 20, 10,
and 20 respectively. On an uncertain network result, the browser preserves the
exact retry key, revision, question ID, and answer, reconciles the authoritative
session on stale/ambiguous results, and will not apply that answer to a new
question.

- A deterministic ten-section ledger decides which question is next.
- Critical sections cannot be completed as unknown.
- Only an explicit confirmation moves a session to `ready`.
- The Copilot can create an editable draft. It cannot publish or activate.
- The generated dossier and executable definition must pass strict schemas,
  coded workflow validation, and active-directory identity checks.
- The same review and publication commands used by humans remain mandatory.

Sessions and messages are owner-scoped under RLS. Writes use service-only RPCs,
revision checks, advisory locks, and client-message replay keys. Every model
provider key stays server-side.

## Copilot v2 Step 3: source-backed typed extraction review

Step 3 has three independent, **server-only** rollout gates. They default to
`false` in `.env.example` and must be enabled in this order:

1. `TEMPLATE_COPILOT_V2=true` enables the governed v2 interview.
2. `TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW=true` permits bounded provider
   extraction for observation and qualification. Shadow extraction alone cannot
   write review candidates.
3. `TEMPLATE_COPILOT_V2_CANDIDATE_CREATION=true` permits candidate creation,
   but only while the shadow gate remains true and after the qualification
   evidence has been reviewed.

For an immediate candidate-write kill switch, set
`TEMPLATE_COPILOT_V2_CANDIDATE_CREATION=false`; the manual v2 interview stays
available, the scheduled consumer returns `disabled`, and durable queued jobs
remain preserved for a reviewed resumption or repair. Set
`TEMPLATE_COPILOT_V2_EXTRACTION_SHADOW=false` to stop provider extraction calls
as well. Set `TEMPLATE_COPILOT_V2=false` to stop new v2 interviews. None of
these variables is `NEXT_PUBLIC_*`, and browser state can never enable a server
write path.

In candidate-creation mode, a text answer, its canonical transcript messages,
and an owner/session/message-bound extraction job are written by one locked
database transaction. The private job references the existing user-message row
instead of storing another copy of the raw answer. The HTTP response returns
the already-authoritative manual answer without waiting for the provider. A
bounded post-response worker claims the job with a lease, validates extraction,
and checkpoints the complete candidate array plus a deterministic hash before
attempting the candidate-ledger mutation. The post-response callback is only a
latency optimization: the existing once-per-minute protected Vercel Cron route
also invokes a service-only due-job consumer, so a terminated callback or lost
client response cannot permanently strand pending work. The dequeue RPC uses
`FOR UPDATE SKIP LOCKED`, leases only pending, due retry, or expired-processing
rows, and returns only opaque job, owner, session, and lease identifiers. The
owner-bound claim then resolves the private transcript; raw answers are never
returned by dequeue or written to worker logs.

Each scheduled invocation requests four jobs (the database hard cap is eight),
uses at most two processors concurrently, starts no new work after a 25-second
budget, and gives each job a 60-second recoverable lease. Provider retries are
not eligible before `next_attempt_at`. An exact answer replay or a later cron
invocation can resume a pending, retryable, failed, or expired-lease job.
Repeated claims with the same lease and repeated candidate writes with the
job-derived idempotency key are safe. A provider failure changes only retry
metadata; a later session revision
marks an uncommitted job superseded and can never be overwritten.
The job table
has RLS enabled, no browser policy, no direct service-role table rights, and
service-only owner-checking RPCs.

The provider is a quote labeler, never evidence authority. It may propose an
allow-listed fact only with a complete, fact-typed value and a fact-specific
quote tree that mirrors every primitive value leaf exactly. The provider never
receives or returns JSON Pointer paths, message IDs, offsets, or normalization
rules. The server alone walks the paired value/quote tree, derives durable JSON
Pointer paths, message identity, Unicode code-point offsets, and any allowed
normalization rule from the owner-scoped message. It then checks complete leaf
coverage, typed value shape, fact/value-type coupling, fact-aware normalized
equality, no overlapping claims, and bounded fields before a candidate can be
persisted. Provider schema conformance does not bypass these server checks.

Candidates are advisory. An ambiguous candidate has no confirmation action and
requires human clarification. A candidate whose fact has changed or has an
open conflict remains visible as evidence but cannot be confirmed. A candidate
that differs from a committed value, or from an earlier uncommitted candidate,
becomes a durable review conflict holding both alternatives and both evidence
chains. Only an authenticated human may keep the existing value, accept the
incoming typed value, or supply a separately validated human value; model
confidence never commits a fact.

Candidate IDs bind the fact, canonical typed value, and sorted full evidence
chain. Durable candidates, conflicts, and resolution/confirmation history
retain their immutable evidence snapshots. They are owner-scoped review data,
not executable workflow authority. The database applies every candidate,
confirmation, and conflict decision through a locked, revisioned,
idempotent service-role RPC with append-only audit evidence.

Run the keyless corpus with:

```powershell
npm run test:template-copilot-v2-step3-qualification
```

It uses only synthetic source fixtures and must never call a provider. Any live
shadow/provider qualification must use synthetic data with
`TEMPLATE_COPILOT_OPENROUTER_ZDR=true` (or an explicitly approved equivalent
retention boundary), and must verify strict structured-output support for the
selected model before corporate requirements are sent. A passing provider test
does not authorize candidate creation by itself.

Autonomous recovery additionally requires the existing production
`/api/cron/approval-operations` schedule, a random `CRON_SECRET` of at least 16
characters, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Vercel supplies
the secret as a bearer authorization header. Missing or weak secrets fail
closed before either scheduled worker runs. Do not expose either secret to the
browser, and do not apply the Step 3 migration or configure these variables as
part of a code-only review.

Rollback is flag-first and preserves the v2 ledger, evidence, receipts,
history, audits, and migrations. Do not delete or edit an applied migration to
roll back Step 3; any future retention/deletion change needs its own reviewed
migration with equivalent audit preservation.

### OpenAPI scope

`/api/template-authoring/openapi.json` currently documents the stable external
authoring and v1 Copilot contract. The v2 answer, special-decision, fact,
upgrade, extraction-candidate, and extraction-conflict routes are authenticated
internal application endpoints with a coupled, evolving v2 lifecycle and are
therefore intentionally excluded together. Publishing only the two Step 3
review POST routes would misrepresent that contract; add them only with the
complete v2 public surface, strict response/error schemas, and an explicit
versioned integration commitment.

## Step 5 authoritative workflow map

With `TEMPLATE_COPILOT_V2_STEP5_EDITING=true`, the Copilot shows an
authoritative, server-produced workflow map. It is a projection of the saved
v2 ledger and readiness calculation, not a browser-side workflow model. A
refresh therefore reproduces the same saved facts, provenance, conflicts,
stale correction trail, dependency impact, and readiness gaps.

The map is initially safe to release read-only. When editing is enabled, each
of the sixteen fact schemas has a purpose-built control: prose, policies,
initiator selection, request fields, document requirements, ordered or
parallel stages and participant resolution, If–then routing, rejection,
correction, timing and escalation, visibility, notifications, ownership,
governance, and retention. Normal users never enter a raw JSON value. The
editor validates its typed value before sending it; the revisioned server RPC
performs the authoritative fact-schema validation, owner check, transition,
audit, and dependency invalidation.

Changing a saved prerequisite intentionally reopens all direct and transitive
dependent facts while preserving their bounded stale-history evidence. The UI
states that impact before save. Candidate, conflict, unknown, and applicable
N/A paths use their existing restricted transitions; a client cannot convert
an N/A or unknown state into an executable fact without a valid human save.
An idempotency key and the last typed pending edit are kept only as a
best-effort session recovery aid. A lost response is safe to retry, while a
same-key or two-tab stale response reloads the server snapshot instead of
overwriting it.

The map labels, state messages, editor labels, help, and validation feedback
are localized for English, Traditional Chinese, and Simplified Chinese. Its
controls have visible labels, 40px touch targets, responsive wrapping,
long-content/CJK breaking, live error status, and edit-button focus
restoration after a save or cancellation.

Qualification has two layers. The deterministic offline contract exercises all
sixteen fact schemas and each saved, suggested, conflicting, unresolved,
unknown, and applicable N/A presentation in all three locales, including
typed-number preservation and blank optional-field removal. The authenticated
Preview gate (`npm run test:e2e:template-copilot-v2-step5`) then exercises real
keyboard open/cancel/focus restoration, responsive touch targets, light/dark
axe scans, and the authoritative live-status region. It requires the Step 5
flag and fact-delta migration to be enabled in Preview; it is not a substitute
for the offline deterministic contract.

The projection is also a historical record, not a summary that discards prior
evidence. Every invalidated value retains its typed display, original wording,
N/A reason where applicable, human confirmation, and bounded provenance/source
coordinates. Current and historical conflicts render both alternatives with
their separate evidence. The Preview qualification additionally exercises a
real structured save, local validation and live success/error status, committed
and N/A corrections, and a two-tab stale revision that reloads rather than
overwrites the authoritative session. A lost-response/remount command keeps the
same revision, idempotency key, operation, and typed value for safe retry.

Do not enable the Step 5 edit flag before the fact-delta migration and the
focused correction/race tests have passed. Flag rollback returns the map to
read-only and preserves all ledger data, audit evidence, and pending recovery
records.

## Requirements files

## Copilot v2 Step 6: interchangeable authoring modes

Step 6 adds three server-gated entry methods to the existing v2 ledger: **Guide
me step by step**, **Let me describe everything**, and **Start from a similar
template**. All three use the same fact ledger, candidate review, readiness,
validation, and compiler. Switching mode never creates a second interview and
does not clear committed facts, open conflicts, or unresolved requirements.

`TEMPLATE_COPILOT_V2_GUIDED`, `TEMPLATE_COPILOT_V2_DESCRIBE_EVERYTHING`, and
`TEMPLATE_COPILOT_V2_SIMILAR_TEMPLATE` are separate default-off server-only
flags. Disable a mode to stop new actions in that mode; existing sessions and
their frozen source snapshot remain readable. Guided gaps are the safe fallback
for a disabled or unavailable model-based describe action. Because every broad
intake returns to deterministic gaps, the Guided flag also gates creation of
new v2 interviews and new `/answers` mutations. Turning it off does not hide or
delete an existing interview.

Describe-everything accepts one bounded narrative (80,000 Unicode code points)
and reuses the source-backed extraction contract. Model output is candidate-only
and malformed/provider-failed output changes nothing; the response supplies the
same deterministic next guided question instead.

Similar-template selection is RLS-authorized on the server. The selected
published template version is copied into a version-identified, SHA-256-bound
snapshot before any candidates are projected. Later source edits, archival, or
deletion cannot change that snapshot. Imported values are reviewable candidates
with the source-version identity; they never auto-commit. The first follow-up
asks what differs, then the normal controller supplies stable unresolved gaps.

The migration `20260728113000_template_copilot_v2_authoring_modes.sql` stores
mode/snapshot state privately and locks it with the same session revision and
idempotency receipt as ledger writes. It grants no browser table access. Do not
enable a Step 6 flag until its migration and focused race/authorization tests
have passed. Rollback is flag-first and does not delete v2 facts, candidates,
conflicts, receipts, or snapshots.

The first release accepts text, Markdown, and PDF up to 5 MB, with at most five
files per interview.

- File type is checked from content as well as the declared name/type.
- NUL-containing executable disguises are rejected.
- PDFs containing JavaScript, launch actions, embedded files, or rich media are
  rejected.
- Raw files are not persisted in Copilot tables.
- Only bounded extracts, names, and SHA-256 hashes enter the ledger.
- Extracts are wrapped as untrusted data and cannot issue instructions.

Corporate deployment should put the upload route behind the organisation's
malware-scanning gateway before broadening accepted formats.

## Copilot v2 Step 7: structured workflow settings

Step 7 replaces free-form editing for document/form requirements, routing
conditions, and notifications with purpose-built cards. The persisted value is
the authority; localized preview sentences are generated from that value and
are never parsed back into a workflow.

The attachment/form card records a stable ID, plain name, file-versus-form
kind, requiredness, accepted formats, minimum and maximum quantity, file-size
limit, submission step, contributor policy, and confirmation policy. File
formats and a per-file limit of at most 25 MB are required for uploads and
forbidden for in-app forms. A request-submission item cannot use step-owner
confirmation because no workflow step owns that point in the process.

The condition card selects an existing request field, comparison, typed value,
currency or unit where the field requires one, matching route, otherwise route,
and deterministic sequence. Routes may target an existing workflow step, a
later named condition, completion, or correction. Duplicate IDs/sequences,
dangling or ambiguous field references, missing units/currencies, backward
condition links, equal outcomes, and cycles are rejected.

The notification card uses an allow-listed event and recipient group rather
than arbitrary addresses. It records immediate/before-due/after-due timing,
bounded hour offsets, company-default or explicit delivery, recipient-only or
participant visibility, and an existing workflow step where the event or
recipient requires one. Due-soon and overdue messages require a committed
default due time; a due-soon offset cannot exceed that due window. A
previous-step recipient is rejected when the selected step has no earlier
step.

The three server-only, default-off rollout switches are:

- `TEMPLATE_COPILOT_V2_ATTACHMENT_EDITOR`
- `TEMPLATE_COPILOT_V2_CONDITION_EDITOR`
- `TEMPLATE_COPILOT_V2_NOTIFICATION_EDITOR`

Each switch gates its UI control, authenticated map mutation, candidate
confirmation, and conflict resolution. Turning a switch off keeps saved
canonical values, evidence, previews, and exact idempotent replays available
read-only, but cannot promote a strict candidate into authority.
`TEMPLATE_COPILOT_V2_STEP5_EDITING` remains the parent map-editing gate.

The Step 7 migration
`20260728140000_template_copilot_v2_structured_editors.sql` extends the locked
RPC's private fact-value validator. It continues accepting legacy Step 5 shapes
so older sessions remain readable, while new Step 7 edits must pass the strict
TypeScript schema, owner-scoped prospective-ledger reference validation, and
the database's bounded structural validation. The authenticated fact command
is capped at 2 MB; the database permits up to 2,000 recursive JSON nodes while
retaining the earlier depth, per-string, per-array, per-object, and key limits.
Private validation functions are explicitly revoked from browser roles.

The production authoritative map calls the deterministic structured compiler
for committed Step 7 values and renders localized previews from the compiler
output. Candidate, conflict, and historical alternatives remain visibly
non-authoritative and are previewed without being compiled. Full draft,
publication, and activation lifecycle integration remains a Step 9 gate.

Do not enable a Step 7 switch before applying the migration in an isolated
environment and passing the schema, truth-table, reference, cycle, round-trip,
compiler-equivalence, accessibility, authenticated mutation, replay, and
stale-tab qualifications. Rollback is flag-first and never converts a stored
structure into prose.

## Step 8 language-review candidate

`questionLibraryVersion: v2.2` is the immutable Step 8 candidate and pins
`conceptLibraryVersion: concepts.v1.0`. ST completed the human language review
for English, Hong Kong Traditional Chinese, and Simplified Chinese. The
candidate remains rollout-disabled while accessibility qualification is
pending.
v2.1 remains the preferred version for new sessions until the reviewed
candidate passes the authorized authenticated Preview accessibility gate.
No generic role, model, automated test, or this document is accepted as human
approval evidence. The supplied ST workbook is the evidence for the completed
language review; it is bound by its exact SHA-256 digest.

**Human language review approved; accessibility qualification pending.**

| Locale | Concept review | Question review | Enabled for new `v2.2` sessions |
| --- | --- | --- | --- |
| English | Approved by ST | Approved by ST | No; Preview gate pending |
| Hong Kong Traditional Chinese | Approved by ST | Approved by ST | No; Preview gate pending |
| Simplified Chinese | Approved by ST | Approved by ST | No; Preview gate pending |

The concept candidate covers all 16 pilot fact topics. Every stable concept ID
and entry version has an internal technical name, a language-independent
semantic contract, a plain label, a short explanation, an example, and an
explicit statement of what the setting changes. Attachment help covers both
files and in-app forms. Stage help covers ordered steps and independent steps
that may occur at the same time. The 316 guided questions retain their
language-independent question IDs, decision IDs, applicability, answer schemas,
and canonical option IDs. The `v2.2` presentation copy replaces terms such as
“directory role” and “different route” with plain descriptions while leaving
`v2.0` and `v2.1` byte-for-byte unchanged.

The exact candidate fingerprints are:

- concept content: `fnv1a64:4a149e693daab18d`
- localized question content: `fnv1a64:df415823535ac40f`

Changing any candidate label, prompt, option, example, explanation, tip, or
workflow-effect statement invalidates its recorded fingerprint. Runtime model
translation is never permitted.

### Required accountable human review

Generate the UTF-8 Excel-compatible review package with:

`npm run review:template-copilot-v2-step8`

The output is
`docs/template-authoring/step-8-language-review.csv`. It contains 1,176 review
rows: every one of the 16 concepts and 316 questions in each of the three
locales, plus all 180 localized resolver-specific prompts that replace the
general prompt after a user selects fixed email, staff-directory role, or
request-field email. Reviewers must inspect meaning, natural language,
terminology, examples, option labels, every visible prompt variant, and
consistency with the language-independent semantic fields. Per-row reviewer
fields are available for corrections and exceptions; reviewers do not need to
repeat the same identity on every approved row. After inspecting every row for
one locale, record one locale-wide decision in
`docs/template-authoring/step-8-language-review-signoff.json`. Each locale
needs:

1. a named accountable reviewer with authority for that language and business
   workflow terminology;
2. an explicit approve or reject decision covering every row for the exact
   fingerprint;
3. an RFC 3339 review time and durable corporate evidence reference, such as a
   controlled ticket or signed review record; and
4. corrections returned as a new candidate followed by a regenerated
   fingerprint and a complete renewed review.

Validate the completed sign-off with:

`npm run review:validate-template-copilot-v2-step8`

The validator binds all three decisions to the exact candidate commit recorded
in the sign-off manifest, the
1,176-row package, both exact content fingerprints, named reviewers,
timestamps, evidence references, and an explicit attestation that every row
for that locale was reviewed. It reports `PENDING` while decisions are
outstanding, `REJECTED` when any reviewer requires a revised candidate, and
`APPROVED` only when all three pass. It fails closed on placeholders, missing
evidence, false attestations, or candidate drift.

The ST evidence is now copied into the pinned concept and question review
manifests. The candidate locales remain disabled until the authenticated
Preview accessibility qualification passes. A locale becomes production-ready only
when the rollout switch, all concept approvals, and the complete question
approval are true together. Missing, pending, rejected, model-reviewed,
unnamed, untimestamped, or evidence-free content fails closed.

The native **What does this mean?** button opens a touch- and
keyboard-accessible region containing the plain explanation, question-specific
tip, example, and workflow effect. It uses `aria-expanded`, `aria-controls`, a
labelled region, minimum touch sizing, visible focus, CJK-safe wrapping, and no
hover-only interaction. The Admin page truthfully shows the candidate
fingerprints, approved language review, disabled rollout state, and named
review evidence.

If an enabled locale later loses approved content, the resolver may show only
the next approved locale in the pinned fallback order. It displays an explicit
notice and emits the bounded `template_copilot_help_fallback` telemetry event
with the concept ID, pinned library version, reason, requested locale, and
displayed locale. If no approved fallback exists, employees see an explicit
help-unavailable message; the app does not invent or translate content.

Question selection, applicability, readiness, stored answers, fact values, and
compilation remain language-independent. Deterministic tests compare all three
locales, mixed-script evidence, missing/unreviewed fallback, human-review
gating, jargon removal, form and simultaneous-stage semantics, and actual
pseudo-localized/long-CJK component layout. After real approval and an isolated
Preview deployment, run:

`npm run test:e2e:template-copilot-v2-step8`

That gate starts a genuine `v2.2` interview in all three approved locales,
checks the exact pins and absence of fallback, opens and closes help by
keyboard, renders stress content inside the real help component, scans light
and dark modes with axe, and checks mobile touch sizing and overflow. Promotion
is not authorized by this runbook. Rollback selects `v2.1` for new sessions;
the server must retain `v2.2` and `concepts.v1.0` for any sessions already
created after approval. Step 8 requires no database migration.

## Operations

Required server variables:

- OpenRouter: `TEMPLATE_COPILOT_PROVIDER=openrouter` and
  `OPENROUTER_API_KEY`; or
- direct Z.AI standard API: `ZAI_API_KEY` (defaults to `glm-5.2`); or
- Vercel AI Gateway: `AI_GATEWAY_API_KEY` or automatically provisioned
  `VERCEL_OIDC_TOKEN`; or
- direct provider fallback: `OPENAI_API_KEY`
- optional `TEMPLATE_COPILOT_MODEL`

OpenRouter is enabled only when explicitly selected. It uses
`https://openrouter.ai/api/v1`, defaults to `qwen/qwen3.5-flash-02-23`, sends a
strict JSON Schema, requires a provider endpoint that supports the supplied
parameters, and then validates the returned object locally. Set
`TEMPLATE_COPILOT_OPENROUTER_ZDR=true` to restrict calls to Zero Data Retention
endpoints. A production deployment fails closed when ZDR is off unless an
approved exception is explicitly recorded with
`TEMPLATE_COPILOT_ALLOW_NON_ZDR_PRODUCTION=true`.

Set `TEMPLATE_COPILOT_OPENROUTER_REASONING_EFFORT=none` for normal requirements
interviews and strict-schema draft generation unless qualification testing
shows that a higher effort is necessary. Supported values are `none`,
`minimal`, `low`, `medium`, and `high`; reasoning traces are excluded from the
response.

As of the Preview evaluation on 2026-07-26, OpenRouter advertised structured
output for `qwen/qwen3.5-flash-02-23`, but did not list a ZDR endpoint for that
exact model. It may therefore be used with synthetic Preview data, but not with
corporate workflow requirements until the provider retention policy is approved
or a ZDR-capable model is selected.

When `ZAI_API_KEY` is present, the Copilot uses Z.AI's standard international
OpenAI-compatible Chat Completions endpoint at
`https://api.z.ai/api/paas/v4` and defaults to `glm-5.2`. It requests JSON mode,
includes the relevant JSON Schema in the system instruction, parses the JSON,
and validates it locally with the same strict Zod contract used by the
authoritative API.

The GLM Coding Plan endpoint is intentionally not supported by the embedded
Copilot. Z.AI limits Coding Plan subscription benefits to officially supported
tools and prohibits shared subscriber access. Use a standard Z.AI API or
enterprise key for the multi-user application. Personal Coding Plan keys may be
used separately in supported tools such as OpenClaw or Hermes.

Without a direct Z.AI key, AI Gateway is preferred when its credential is
configured, uses the OpenAI-compatible Responses endpoint, and defaults to
`openai/gpt-5.4`. Direct OpenAI follows the app's existing model configuration.
Model failures do not advance the ledger or create a draft.

## Evaluation gate

- Deterministic completeness and confirmation tests.
- Prompt-injection wrapping and active-content rejection tests.
- Owner RLS, direct-write denial, replay, stale revision, and real concurrency.
- Authenticated route/static secret-boundary tests.
- Accessible labels, live region, keyboard send, error alert, and touch targets.
- End-to-end generation must create an editable authoring draft only.

## Deferred and not-applicable decisions

The ordinary answer endpoint accepts only a text answer or a declared choice.
`Not sure`, `Not applicable`, and reopening a prior special decision use the
separate revisioned special-decision endpoint. It is locked, idempotent, and
audited; it records an immutable transcript turn while changing only the
current ledger projection. A deferred answer blocks readiness and draft
creation. N/A is available only where the pinned question explicitly permits
it and requires a bounded reason. Reopening removes the server-computed reverse
closure of both prerequisite and applicability dependencies, so answers from a
former branch cannot survive a correction.

## Copilot v2 Step 4: guided answer aids without hidden answers

Step 4 introduced `questionLibraryVersion: v2.1`; current Step 8 sessions pin
`v2.2`, which inherits the same deterministic interaction contract. Neither
version alters a question ID, decision ID, validation rule, or mutation
endpoint. Existing `v2.0` sessions retain
their previous controls, so disabling the v2 rollout continues to render the
plain typed v1 flow without deleting v2 ledgers or prior answers.

`TEMPLATE_COPILOT_V2_STEP4` is an independent, server-only, default-off
switch. With it off, a persisted `v2.1` ledger remains fully answerable but
uses the conservative plain typed composer (an exact visible choice label is
still resolved to its server-owned option ID). Turning the switch back on
restores the same v2.1 aids without changing its ledger, answers, or version.
The original answer acknowledgement is a durable assistant transcript turn
written in the same transaction as the receipt identifiers. An exact retry
after a later reopen/re-answer reads that same-command transcript only after
the locked owner check confirms replay; it never reconstructs an acknowledgement
from a newer ledger value.

For applicable v2.1 and v2.2 questions, the controller may return optional suggestions,
an alternate example, a `Why are you asking?` help disclosure, and localized
labels in English, Traditional Chinese, and Simplified Chinese. Suggestions
only populate the editable local draft. Examples are visibly marked **Example
only — not a recommendation**, and viewing or rotating them calls no answer,
special-decision, extraction, or candidate API. Text answers always retain
free entry and `Something else` clears a suggested draft. Choice selection is
local until the user presses an explicit `Continue`; that is the only action
that creates the existing revisioned, idempotent answer command.

The browser never says an answer was saved while a request is pending. After
the answer RPC returns, the server derives the acknowledgement from the
returned authoritative ledger's canonical display value. Rejected, stale, and
ambiguous writes therefore retain the existing exact-key retry/reconciliation
behaviour and cannot create a false acknowledgement. Deferred and permitted
N/A decisions remain visible in the server-derived special review/readiness
state and final transcript playback.
