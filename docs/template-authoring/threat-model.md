# Template authoring threat model

## Assets

- draft and published workflow definitions;
- participant and corporate directory data;
- uploaded requirements documents and attachment samples;
- audit events, publication reviews, and change reasons;
- model prompts, tool calls, and model/provider credentials.

## Trust boundaries

The browser, external agents, model output, MCP clients, and uploaded documents
are untrusted. Next.js route handlers authenticate the user and call
server-authoritative Supabase RPCs. PostgreSQL validates actor, scope, revision,
idempotency, transition, and audit fields inside one transaction.

Service-role credentials remain server-only. Browser roles receive read access
only where RLS permits it and do not receive direct mutation grants for
authoring tables.

## Required controls

| Threat | Control |
| --- | --- |
| Model invents an approver | Directory resolution and unresolved-participant validation |
| User forges actor or publish state | Strict public schemas; actor and state derived on server |
| Stale tab overwrites a colleague | Expected revision, row lock, and 409 canonical response |
| Retried request creates duplicates | Actor-scoped idempotency receipt and payload hash |
| Direct Data API bypass | Revoke browser mutation grants; RPC-only writes |
| Prompt injection in a document | Treat document text as data; fixed system policy; allowlisted tools |
| Model publishes without consent | No publish/activate model tool; human publish-review workflow |
| Stale playback is treated as deployable | Drafts record the exact Copilot session and source revision; edited or mismatched definitions fail activation readiness |
| A client preserves or forges Copilot lineage after editing | General draft mutations strip lineage, and activation compares the exact dossier and definition with the server-owned artifact frozen during Copilot draft linking |
| Browser activates a different version | Server derives actor and family from the immutable version ID, checks the exact version number under lock, and requires publisher membership |
| Administrator activates without delegated publisher authority | Activation requires an explicit active publisher membership for the exact family; administrator status is not an override |
| Publisher access requires an undocumented database edit | IT uses the authenticated Activation publisher panel; the service-only grant/revoke command resolves an active directory profile, is idempotent, and writes an audit event |
| Activation retry toggles twice or hides history | Actor-scoped idempotency receipt, sibling update, selected-version update, and activation audit event share one transaction |
| Concurrent activation of two sibling versions deadlocks | Every activation locks the family first and only then the selected version, giving all sibling commands one lock order |
| Stale whole-workspace save reverses activation | Governed authoring rows are immutable to the legacy save path; only the exact activation command can update the active marker |
| Unreviewed or archived authoring version is activated | Activation requires an active family plus a published draft and matching published review request at the same revision |
| Published runtime version differs from the reviewed draft | Activation compares the immutable snapshot, graph, documents, languages, name, business, and department with the normalized reviewed draft projection |
| Null runtime scope bypasses an equality check | Exact activation comparisons use null-safe `IS DISTINCT FROM` and reject any null or drifted projection value |
| Compiler silently broadens visibility or notification recipients | Unrepresentable semantics create deterministic blocking questions; the draft scaffold hides fields/documents and sends no notifications until a human resolves them |
| Compiler combines prose into a nonexistent directory role | Directory-role initiation compiles only from an explicit lossless `roles:Role A|Role B` mapping; prose remains a publication blocker with no executable role |
| Condition targets one member of a simultaneous group | The compiler rejects it as a publication blocker instead of gating or rerouting the whole group |
| Cross-department data access | Scope memberships plus RLS and server authorization |
| Sensitive attachment leakage | Private storage, signed retrieval, type/size limits, scanning, expiry |
| Malicious file parser payload | Bounded upload, safe parser isolation, no executable content |
| Audit tampering | Append-only server-authored events in the same transaction |
| Excessive model cost or loops | Per-user quotas, bounded messages, bounded tool steps and timeouts |
| Provider outage | Draft ledger persists independently; retry without losing confirmed answers |
| Hallucinated capability | Machine capability matrix and coded definition validation |
| Qualification telemetry becomes a shadow transcript or state store | One strict metadata-only schema rejects raw text and direct identifiers; real routes derive events server-side; compiler and readiness never read telemetry |
| Telemetry is read by a non-Admin or retained indefinitely | The store is in the unexposed private schema with forced RLS and no table grants; the service-only list RPC independently verifies an active Admin and excludes expired rows; the scheduler physically purges rows after the pinned 30-day period |
| A retry inflates telemetry or changes workflow authority | Only freshly applied commands emit events; event IDs are deterministically HMAC-bound to the session, event type, and command key; identical duplicate inserts are no-ops, conflicting replays are rejected, and telemetry is never an input to ledger, readiness, publication, or activation |
| A pseudonym is reversed through a dictionary attack | Actor and session identifiers use a separate server-only HMAC secret of at least 32 characters; the Admin UI does not display the pseudonyms |
| Model/provider privacy route drifts during pilot | The deterministic fixture proves only that privacy rejection leaves authoritative state unchanged and enters Guided fallback. The separately authorized live Preview gate pins OpenRouter in both invoking and deployed expectations, executes a live ZDR smoke, and verifies deployed provider, model, and ZDR capability headers from the production resolver; any mismatch triggers the pilot stop gate |
| Pilot result is declared without representative evidence | Deterministic evaluator requires exactly nine pseudonymous participants, three per language, and both standardized and departmental tasks |

## Logging rules

Log correlation ID, authenticated actor ID, command name, draft/family ID,
revision, idempotency outcome, validation summary, latency, and provider usage.
Do not log raw attachment content, message bodies, extracted personal data,
tokens, cookies, service keys, or full model prompts.

## Publication rule

An accepted draft is not a published workflow. Publication requires an
authorized human review of the dossier, executable definition, diff, validation
errors and warnings, simulation evidence, policy references, unresolved
questions, and change reason. Activation remains a separate human action
against one exact immutable published version. Interview completion,
draft-readiness, publication-readiness, and activation-readiness are not
interchangeable states.
