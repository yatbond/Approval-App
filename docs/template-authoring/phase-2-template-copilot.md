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

## Requirements files

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
