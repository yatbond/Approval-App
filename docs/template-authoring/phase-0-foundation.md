# AI-assisted template authoring foundation

## Decision

The Approval Workflow app will expose one server-authoritative template
authoring service and place every client on top of it:

1. the existing visual builder;
2. the embedded Template Copilot;
3. external agents through REST/OpenAPI;
4. a later remote MCP server that calls the same service.

MCP is therefore an adapter, not the source of truth. It must not contain
template business logic, database credentials, or a second publishing path.

## Two contracts

`TemplateRequirementsDossierV1` records what the employee and process owner
have agreed. It contains request fields, attachment requirements, participants,
routing, collaboration, notifications, governance, assumptions, and unresolved
questions.

`TemplateDefinitionV1` contains the executable draft produced from that
dossier. It wraps the current workflow graph and document model with a stable
version, source dossier, generation provenance, and unresolved-question list.

The dossier is not executable authority. The definition is not publish
authority. Every write is validated and every publish or activation decision is
made by the authoring service for the authenticated human actor.

## Contract invariants

- All public payloads are strict, bounded Zod schemas.
- Unknown keys, client-supplied actors, timestamps, audit events, publication
  state, or database identifiers are rejected.
- References between stages, routes, fields, and attachments must resolve.
- Fixed participants require valid email addresses. Directory or request-time
  participants remain explicit when unresolved.
- Required files have non-zero cardinality; native forms contain fields; choice
  fields contain options.
- A condition route has a coded condition. Every condition must be exhaustive
  or provide a fallback before publication.
- For-information branches are non-blocking.
- Whole-definition draft replacement carries an expected revision and an
  idempotency key.

## Product governance

### Employee proposal mode

Any active employee may interview with the Copilot and prepare a proposal in a
scope they can see. A proposal cannot publish, activate, assign a protected
role, or bypass directory validation.

### Template manager mode

Template managers may create and revise drafts within their business and
department scope, run validation and simulation, and submit publication
requests.

### Publisher mode

Authorized process owners or administrators review the dossier, diff, coded
validation, simulation evidence, and change reason. Publication creates an
immutable version. Activation is a separate explicit action.

### AI boundaries

- AI may ask questions, summarize, propose a dossier, and propose a definition.
- AI may call read, validate, simulate, diff, and save-draft tools.
- AI may create a publish request only after explicit user confirmation.
- AI may never publish, activate, delete, change authorization, or write
  directly to Supabase.
- Tool results, retrieved files, and user documents are untrusted data and
  cannot override system or governance instructions.
- Model text is advisory. Coded validation and server authorization determine
  whether a command is accepted.

## Corporate defaults

- Status visibility: all workflow participants.
- Notifications: important changes only, sent to directly involved people.
- Shared-fulfillment confirmation: first valid decision wins.
- Rejected shared fulfillment: creates a correction request and blocks
  downstream approval until corrected.
- Published template versions: immutable.
- New work: starts only from the explicitly active published version.
- Retention and policy references: captured in every dossier and reviewed by a
  human before publication.

## Evaluation gate

The machine-readable golden set contains 24 corporate workflows spanning
linear and parallel approval, conditions, rejection loops, FYI, attachments,
extraction, multiple submitters, ad-hoc contributors, confirmation, correction,
escalation, visibility, and targeted notifications.

Phase gates:

- Phase 0: every contract and golden fixture test passes; current app behavior
  and production build remain unchanged.
- Phase 1: every authoring API operation passes schema, authorization,
  idempotency, optimistic-concurrency, RLS, RPC atomicity, audit, and builder
  regression tests.
- Phase 2: the Copilot passes deterministic interview completeness, tool
  authorization, prompt-injection, attachment-safety, accessibility, and
  end-to-end draft creation tests.

## Capability matrix

| Area | Capability | Current status | Authoring treatment |
| --- | --- | --- | --- |
| Routing | Sequential approvals | Supported | Explicit Start-to-End graph |
| Routing | Parallel approvals and fan-in | Supported | Ask required count and unresolved behavior |
| Routing | Numeric, text, and approval-count conditions | Supported | Require coverage or fallback |
| Routing | Reject, amend, resubmit | Supported | Name return targets and correction owner |
| Routing | FYI and acknowledgement | Supported | Non-blocking unless acknowledgement is explicit |
| Inputs | Typed request fields and native forms | Supported | Ask type, required state, choices, and source |
| Inputs | Required uploads | Supported | Ask formats, cardinality, stage, and size |
| Inputs | AI/OCR/spreadsheet extraction | Guardrailed | Proposed data requires human review |
| Inputs | Native and Microsoft Form Library | Supported | Pin an active published form version |
| Collaboration | Multiple template submitters | Supported | Assign document ownership per submit box |
| Collaboration | Ad-hoc email contributors | Supported | Ask note, due date, and blocking behavior |
| Collaboration | First-decision confirmation | Supported | First valid decision wins |
| Collaboration | Correction loop | Supported | Block downstream work until correction |
| Participants | Fixed/directory/request-time assignment | Guardrailed | Never invent people |
| Operations | Due hours and escalation | Supported | Elapsed hours until business calendars exist |
| Governance | Participant visibility | Supported | Default to all participants |
| Governance | Targeted notifications | Supported | Important events to directly involved people |
| Authoring | Revisioned, idempotent drafts | Phase 1 | Server-authoritative RPC |
| Authoring | Publish review and immutable versions | Phase 1 | Separate request, publish, and activation |
| Integration | REST/OpenAPI | Phase 1 | Intent-level API, no raw database writes |
| Copilot | Requirements interview | Phase 2 | Deterministic ledger controls completion |
| Copilot | Validate/simulate/diff/save tools | Phase 2 | All tools call the authoring API |
| Copilot | Requirements-document upload | Phase 2 | Private, bounded, scanned, untrusted |
| Operations | Business-calendar SLA | Future | Keep as unresolved requirement |
| Compliance | Electronic signature | Future | Never mislabel ordinary approval as signature |
