# Phase 0 baseline and hardening evidence

Date: 2026-07-19

Branch: `codex/server-authoritative-approvals`

Base commit: `28897e40280ddaeee4649558309a778d33a3bc9a`

Runtime: Node.js `v24.14.0`, npm `11.9.0`

## Baseline findings

The design and code review confirmed that the existing browser-owned workspace model is not a safe concurrency boundary. Runtime approval state, authorization, audit events, escalation, and notification delivery must move behind authenticated server commands before a production rollout to hundreds of concurrent users.

Phase 0 also found several independent reliability gaps and corrected them before the data-model migration:

- API responses created after Supabase session refreshes now copy response cookies back to the browser.
- Admin screens no longer present mock alerts, an inert delegation control, or silently truncated user and role lists as operational truth.
- A route error boundary now offers a retry and a targeted recovery-cache reset.
- Confirmation dialogs trap focus, support Escape, restore prior focus, and guard duplicate actions.
- File inputs reset after processing so the same file can be selected again.
- Local upload-draft serialization is debounced instead of rebuilding large payloads on every keystroke.
- CI now generates Next.js route types and runs TypeScript explicitly.
- The unit-test glob is recursive, and the supported Node.js runtime is declared.
- Development-auth browser fixtures cover the workspace, upload-draft, and operations APIs without production credentials.

## Verification evidence

| Gate | Result |
| --- | --- |
| `npm ci` | Passed; 408 packages installed before changes |
| `npm run typecheck` | Passed; Next.js route types generated and TypeScript clean |
| `npm run lint` | Passed |
| `npm test` | Passed; 782 tests, 0 failures |
| `npm run build` | Passed; Next.js 16.2.9 webpack production build |
| `npm run e2e:regression` | Passed against `http://localhost:3000` with the development-auth fixture |
| Browser/API server trace | Main workspace tabs and Admin returned 200 responses; `/api/workspace`, `/api/upload-drafts`, and `/api/operations` returned 200 |

## Dependency audit disposition

`npm audit` reports three unresolved findings:

- High: `xlsx` prototype pollution and regular-expression denial of service; npm has no fix for the installed package line. Phase 7 must replace or isolate this parser before production release.
- Moderate: the PostCSS version nested under Next.js is affected by an escaping advisory. npm proposes downgrading Next.js to 9.3.3, which is an invalid breaking change and is not applied. Phase 7 must reassess against a supported Next.js release or upstream fix.

These findings are recorded risks, not accepted production exceptions. Phase 7 and the final Phase 8 release gate remain blocked until they are resolved or an explicit, evidence-backed mitigation is approved.

## Phase 0 exit decision

All Phase 0 implementation and verification gates pass. The branch may proceed to Phase 1, but the application is not production-safe until the authoritative data model, transactional command path, server authorization, concurrency controls, and later release gates are complete.
