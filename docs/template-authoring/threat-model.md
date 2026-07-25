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
| Cross-department data access | Scope memberships plus RLS and server authorization |
| Sensitive attachment leakage | Private storage, signed retrieval, type/size limits, scanning, expiry |
| Malicious file parser payload | Bounded upload, safe parser isolation, no executable content |
| Audit tampering | Append-only server-authored events in the same transaction |
| Excessive model cost or loops | Per-user quotas, bounded messages, bounded tool steps and timeouts |
| Provider outage | Draft ledger persists independently; retry without losing confirmed answers |
| Hallucinated capability | Machine capability matrix and coded definition validation |

## Logging rules

Log correlation ID, authenticated actor ID, command name, draft/family ID,
revision, idempotency outcome, validation summary, latency, and provider usage.
Do not log raw attachment content, message bodies, extracted personal data,
tokens, cookies, service keys, or full model prompts.

## Publication rule

An accepted draft is not a published workflow. Publication requires an
authorized human review of the dossier, executable definition, diff, validation
errors and warnings, simulation evidence, policy references, unresolved
questions, and change reason. Activation remains a separate human action.
