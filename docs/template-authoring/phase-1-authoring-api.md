# Phase 1: server-authoritative template authoring

## Outcome

The application now has a versioned REST/OpenAPI authoring surface backed by
service-only PostgreSQL RPC commands.

- Families group immutable published versions and one open editable draft.
- Every mutation requires an idempotency key.
- Draft replacement requires `expectedRevision`.
- Database row and advisory locks serialize competing commands.
- Browser roles have RLS-filtered reads and no table or RPC mutation grant.
- Publication requires a separate review decision and creates an inactive
  immutable `workflow_template_versions` row.
- Activation remains an explicit human operation outside the authoring agent.
- Copilot-originated drafts keep their authoring IDs and subsequent visual
  builder changes are queued through the authoritative draft API.

The OpenAPI 3.1 contract is available at `/api/template-authoring/openapi.json`.
External agents must use an approved delegated-auth gateway; no service-role
credential is distributed to agents.

## Release order

1. Apply `20260725144317_template_authoring_foundation.sql`.
2. Run the database lifecycle and RLS scripts on an isolated Supabase branch.
3. Deploy application code.
4. Confirm `/api/template-authoring/context` and
   `/api/template-authoring/openapi.json`.
5. Enable external agent access only after delegated-auth policy, rate limits,
   audit export, and corporate data-processing review are approved.

## Evidence gate

- Contract, validation, simulation, diff, and static authorization tests pass.
- PostgreSQL parses both migrations.
- Live isolated-branch lifecycle and RLS scripts pass.
- Concurrent commands produce one applied revision and one stale revision.
- Supabase security advisor reports no new template-authoring findings.
- Supabase performance advisor reports no actionable new template-authoring
  findings.
