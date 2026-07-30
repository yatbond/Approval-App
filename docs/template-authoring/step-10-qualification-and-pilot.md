# Template Copilot v2 Step 10 qualification and pilot

## Automated release gate

Step 10 uses a pinned, model-output-fixture qualification rather than an LLM
as the release judge. The core gate is:

- 24 representative workflow archetypes;
- English, Traditional Chinese, and Simplified Chinese for every archetype;
- three repetitions per language;
- exactly 216 conversations.

Run the deterministic gate with:

```text
npm run test:template-copilot-v2-step10
```

The runner drives the production deterministic question controller, fact
transitions, evidence adapter, candidate projection and confirmation, conflict
resolution, source-template import, compiler, definition validator, and route
simulator. It records the actual pinned question IDs, revisions, candidate and
conflict history, intermediate and final readiness, compiler and validation
results, route output, and privacy-minimized synthetic provider-boundary
metadata. Prompt and candidate-schema pins are imported from the same
production extraction contract; they are not duplicated report literals.

The matrix includes all three authoring modes; complete, uncertain,
conflicting, fragmented, typo-heavy, mixed-language, and correction-heavy
answers; ambiguous forms of “everyone,” “one week,” and “over one million”;
and success, outage, timeout, malformed-output, and privacy-route-rejection
provider fixtures. Provider failures and privacy rejection leave the
authoritative ledger hash unchanged. Describe mode then enters the real
deterministic Guided controller, while other modes retain their normal
non-provider behavior. Model output never commits a fact or claims readiness.

The matrix checks the localized question, help control, interaction labels,
and mode-switch labels exposed by the production controller. Dark/light
contrast and keyboard/browser behavior are not inferred from these data
contracts; those require the authorized browser qualification described
below.

The 216 executable cases use only combinations the current deterministic
compiler can represent without changing meaning. Two separate negative
fixtures exercise requirements that are not yet safely executable:

- an in-app/native form without typed form-field definitions is blocked with
  `form_fields_required`; and
- a condition targeting one member of a simultaneous approval group is
  blocked with `condition_targets_parallel_member`.

These are safe rejections, not claims that the unsupported combinations were
successfully compiled.

The production telemetry contract rejects raw-answer, message, prompt,
transcript, document, excerpt, email, name, and other free-text payload keys.
When `TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED=true`, real server routes record
only HMAC-pseudonymous session/actor identifiers, stable codes, counts,
timings, and bounded provider metadata. Freshly applied commands emit events;
exact command replays do not emit a second event. A deterministic event
identifier provides a second deduplication boundary. The private database table
has no browser or direct service-role table grants; narrow service-only RPCs
write, perform an independent active-Admin check for reads, and delete expired
rows after 30 days. Expired rows are excluded at read time even if physical
cleanup is temporarily unavailable. Telemetry is evidence only and is never
read as workflow state.

`TEMPLATE_COPILOT_TELEMETRY_HMAC_SECRET` must be a separately managed
server-only secret of at least 32 characters. It must not be a public Supabase
key, model key, employee identifier, or a value sent to the browser. The Admin
Copilot operational-telemetry panel shows only the minimized operational
events and aggregates; it never shows the pseudonyms or uses telemetry as a
transcript.

## Automated gate result

On 30 July 2026 the local deterministic gate passed:

- 216 of 216 conversations compiled, validated, and simulated;
- zero critical hallucinations;
- zero silent overwrites;
- zero false-complete results;
- every invalid-actor schema attempt was rejected without changing the
  authoritative in-memory ledger (this is not an RLS authorization test);
- zero cross-language route-equivalence failures;
- high- and low-amount route oracles passed, including matched and fallback
  branches and the fallback terminal route;
- native-form and conditional-plus-parallel negative fixtures failed closed
  with their expected production compiler blockers;
- every authoring mode, answer profile, ambiguity, and provider outcome
  produced actual durable state-transition evidence rather than a label;
- publication readiness was derived from committed facts and deterministic
  validation;
- activation remained not ready because no reviewed published revision was
  supplied.

This is deterministic pre-pilot evidence. It does **not** prove live model
suitability, a live ZDR route, authenticated Preview RLS/cross-user behavior,
or dark/light browser accessibility. It does not claim that the human pilot
has run, authorize Production rollout, or apply any migration.

When an isolated authenticated Preview and its test identities are separately
authorized, run the live security/browser bundle:

```text
npm run test:template-copilot-v2-step10:authorized-preview
```

The bundle deliberately remains separate because it needs live credentials,
an approved provider route, deployed code identity, a migrated isolated test
database, and controlled test users. Its preflight fails unless:

- the local model and deployed expected model pins are identical;
- both `TEMPLATE_COPILOT_PROVIDER=openrouter` and
  `E2E_EXPECTED_COPILOT_PROVIDER=openrouter`;
- both `TEMPLATE_COPILOT_OPENROUTER_ZDR=true` and
  `E2E_REQUIRE_COPILOT_ZDR=true`;
- both `TEMPLATE_COPILOT_V2_TELEMETRY_ENABLED=true` and
  `E2E_REQUIRE_COPILOT_TELEMETRY=true`;
- the telemetry HMAC secret satisfies the minimum length;
- the HTTPS Preview, two test users, cross-user session, local Supabase, and
  local Postgres test container are explicitly configured.

It then runs the deterministic 216-case matrix, a live OpenRouter ZDR smoke,
the SQL authoring/Copilot RLS tests, a rollback-only telemetry RPC test
(idempotency, conflicting replay rejection, active-Admin authorization,
logical expiry, and physical purge), the database concurrency test,
authenticated Preview behavior, cross-user isolation, all three language
accessibility flows in light and dark mode with keyboard interaction, and the
live Copilot qualification suite. The authenticated capability probe confirms
that the deployed Preview—not merely the invoking shell—uses the pinned
OpenRouter provider/model, requires ZDR, and has privacy-minimized telemetry
enabled. The Preview flow then starts a real session and requires the resulting
`session_applied` event to be readable through the active-Admin RPC before it
can pass.

## Controlled nine-person pilot

The pilot is draft-only and uses nine employees:

| Language | People | Required mix |
|---|---:|---|
| English | 3 | new and experienced authors |
| Traditional Chinese | 3 | new and experienced authors |
| Simplified Chinese | 3 | new and experienced authors |

Each person completes:

1. the same standardized approval-template task in **Guide me step by step**
   mode; and
2. one real departmental workflow using approved non-sensitive pilot data.
   Across each language group, the three departmental tasks cover
   `describe_everything`, `similar_template`, and `guided`; the comprehensive
   initial-brief recall target is calculated only from
   `describe_everything`.

Use `step-10-pilot-observation-template.csv`. Replace each placeholder with a
one-way pseudonym. Do not enter employee names, email addresses, answers,
workflow descriptions, document text, or other corporate content in the CSV.
The saved Copilot transcript remains the authorized source for IT review.

IT reviewers use only these controlled tags:

- `unclear_wording`
- `jargon`
- `irrelevant_question`
- `repeated_question`
- `missed_fact`
- `wrong_extraction`
- `wrong_language`
- `misunderstood_default`
- `slow_response`

Evaluate a completed worksheet with:

```text
npm run evaluate:template-copilot-v2-step10-pilot -- path/to/completed.csv
```

Blank placeholders fail validation. Every experienced-author standardized
observation must contain its visual-builder baseline; a missing baseline
cannot pass through an empty comparison set. The CSV records the authoring
mode, and the evaluator rejects any standardized observation not recorded as
`guided`. Within every language group, the three departmental observations
must be exactly one `describe_everything`, one `similar_template`, and one
`guided`. It also requires the Describe observation in every language before
the initial-brief recall target can pass.

## Launch targets

The pilot passes only when all of these are true:

- exactly nine people and 18 observations, with three people per language and
  both tasks per person;
- zero unauthorized mutations or cross-user exposure;
- zero silent loss of a committed fact;
- zero automatic publication or activation;
- zero invented critical facts;
- 100% traceability from compiled behavior to committed facts;
- at least 90% unaided completion of the standardized task;
- every completed dossier contains all critical facts before publication
  review;
- guided new-user median standardized-task time is at most 15 minutes;
- experienced users are at least 30% faster than their equivalent
  visual-builder baseline;
- at least 95% of facts in a comprehensive initial brief are captured without
  being asked again;
- no critical accessibility failure.

The evaluator in
`src/lib/template-copilot-v2-step10-qualification.ts` implements these
criteria without model judgement.

## Immediate stop and rollback

Stop new v2 sessions immediately for any RLS bypass, cross-user or
cross-department transcript exposure, committed-fact loss, silent v1
reinterpretation, invented person/email/policy/amount/currency/attachment or
route, missing mandatory requirement reported complete, nondeterministic
compiler output, invalid publication, unapproved activation, non-approved
privacy routing, or critical accessibility blocker.

Disable `TEMPLATE_COPILOT_V2` to stop new sessions. Preserve existing v2
ledgers for read-only investigation or safe continuation after remediation.
Do not destructively convert them. Resume only after root-cause correction,
regression coverage, an independent GPT-5.6 Sol review, and a documented
recovery exercise.

## Human authorization still required

Before the pilot can begin, an authorized operator must separately approve:

- an isolated authenticated Preview deployment;
- any required migration application;
- the approved ZDR-capable provider/model route and retention terms;
- the nine pilot participants and departmental test data;
- IT reviewer access and the evidence-retention period.

The code currently pins the telemetry retention implementation to 30 days.
Changing that period requires an approved policy decision, migration/update,
privacy tests, and a fresh independent review; changing only this document is
not sufficient.

Publication and activation remain separate human-authorized lifecycle actions.
