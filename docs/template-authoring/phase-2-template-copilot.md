# Phase 2: embedded Template Copilot

## Trust model

The model is an interpreter and draft generator, not an authority.

- A deterministic ten-section ledger decides which question is next.
- Critical sections cannot be completed as unknown.
- Only an explicit confirmation moves a session to `ready`.
- The Copilot can create an editable draft. It cannot publish or activate.
- The generated dossier and executable definition must pass strict schemas,
  coded workflow validation, and active-directory identity checks.
- The same review and publication commands used by humans remain mandatory.

Sessions and messages are owner-scoped under RLS. Writes use service-only RPCs,
revision checks, advisory locks, and client-message replay keys. The OpenAI API
key stays server-side.

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

- Vercel AI Gateway: `AI_GATEWAY_API_KEY` or automatically provisioned
  `VERCEL_OIDC_TOKEN`; or
- direct provider fallback: `OPENAI_API_KEY`
- optional `TEMPLATE_COPILOT_MODEL`

AI Gateway is preferred when its key is configured, uses the OpenAI-compatible
Responses endpoint, and defaults to `openai/gpt-5.4`. Direct OpenAI follows the
app's existing model configuration. Model failures do not advance the ledger or
create a draft.

## Evaluation gate

- Deterministic completeness and confirmation tests.
- Prompt-injection wrapping and active-content rejection tests.
- Owner RLS, direct-write denial, replay, stale revision, and real concurrency.
- Authenticated route/static secret-boundary tests.
- Accessible labels, live region, keyboard send, error alert, and touch targets.
- End-to-end generation must create an editable authoring draft only.
