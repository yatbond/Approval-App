# Approval Workflow Refactor Log

Started: 2026-06-21 07:11 HKT

Goal: Refactor the approval workflow architecture in small, verified commits. After each significant step: live-test the running app, run autoreview, and commit.

## Baseline

- Branch: `codex/approval-tracking`
- Repo: `\\DeeQnap264C\Public\My Drive\Ai Projects\2026-06-16 Approval Workflow`
- Main concern: `src/app/approval-workspace.tsx` is about 200 KB and mixes workspace shell, persistence sync, workflow canvas orchestration, condition editor, upload/request submission, queue/tracking/admin, and rendering.
- `npm test -- --runInBand`: previously passed 67/67 after the preview fix.
- `npm run build`: previously passed after the preview fix.
- `npm run lint`: failing before new refactor work:
  - `src/app/approval-workspace.tsx:741` synchronous `setRoleAssignments` in effect.
  - `src/app/approval-workspace.tsx:2897` synchronous undo/redo state resets in effect.
  - `src/lib/normalized-workspace-store.ts` has three `no-explicit-any` errors.

## Step 1 - Lint-Driven Architecture Cleanup

Status: complete.

Plan:
- Move role-assignment completion into state initialization/update flow instead of an effect that synchronously patches state after render.
- Move workflow undo/redo reset behavior behind a small state boundary or event-driven helper instead of direct synchronous effect setters.
- Replace `any` in normalized persistence with explicit Supabase-like result types.
- Verify with typecheck, test suite, lint, live browser preview, and autoreview.
- Commit only source/docs changes, excluding transient `.next-dev*.log` files.

Autoreview findings:
- P1: normalized save can drop requests whose template was deleted or missing. Track for Step 2 because it changes template/task deletion semantics.
- P2: late remote hydration can overwrite early local edits. Fixed in Step 1 with a dirty guard.
- P3: immediate snapshot builder loses explicit empty `selectedTemplateId`. Fixed in Step 1 with nullish patch handling.
- Follow-up autoreview: Admin business-directory edits still bypassed the dirty guard. Fixed in Step 1 by routing Admin changes through `updateBusinessDirectoryRecords`.
- Final autoreview:
  - P1: normalized business/department deletes and renames are not reconciled as inactive. Track for Step 2 with the existing normalized persistence work.
  - P2: workflow history should be keyed per workflow, not a single current slot. Fix in Step 1.
  - P2: template selection changes still bypass dirty tracking. Fix in Step 1.

Verification:
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 67/67.
- `npm run build`: passed.
- Live Workflow preview: passed, no browser console errors.
- Live Admin preview: passed, no browser console errors.
- Final autoreview: passed with no actionable Step 1 findings.

## Step 2 - Normalized Persistence Reconciliation

Status: complete.

Plan:
- Add store-level tests for normalized saves that remove or rename businesses/departments.
- Add a guard so approval requests cannot be silently skipped when their workflow template is missing from normalized tables.
- Avoid unsafe global inactive sweeps in the generic normalized workspace save; directory/template deletion reconciliation needs a future scoped admin/RPC path.
- Verify with targeted tests first, then full typecheck/lint/test/build, live browser preview, autoreview, and commit.

Implementation notes:
- Added store-level tests for inactive business/department reconciliation and unresolved request templates.
- Normalized template rows now distinguish active template-library versions from inactive archived versions used by historical requests.
- Generic normalized workspace saves do not deactivate absent businesses, departments, or templates because the current snapshot may be partial or stale.
- Requests are preflight-validated before any normalized write and now throw on missing template FK when no live or archived template row can be resolved.
- Archived template rows use the same template key as the request FK so historical request persistence is stable even when the snapshot id differs.

Autoreview findings addressed:
- P1: Missing-template failures previously happened after data-changing reconciliation. Fixed by preflight-validating request template references before any database mutation.
- P1/P2: Directory reconciliation previously deactivated rows globally during workspace saves. Fixed by removing generic inactive sweeps and testing that normal saves do not deactivate absent rows.
- P2: Archived template FK keys could diverge from approval request keys. Fixed with a shared task template key helper and regression coverage.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/normalized-workspace-store.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 71/71.
- `npm run lint`: passed.
- `npm run build`: passed.
- Live Workflow preview: passed, no browser console errors.
- Live Admin preview: passed, no browser console errors.
- Final autoreview: passed with no actionable Step 2 findings.

## Step 3 - Workflow History Boundary

Status: complete.

Plan:
- Extract workflow canvas undo/redo history from `approval-workspace.tsx` into a pure library.
- Add focused tests for per-workflow history isolation, redo clearing, stack limits, and undo/redo transitions.
- Keep the page component as a thin adapter around the pure history helpers.
- Verify with typecheck, full tests, lint, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-history.ts` for workflow history state, stack limits, record, undo, and redo helpers.
- Added `src/lib/workflow-history.test.mjs` for focused coverage.
- Rewired `approval-workspace.tsx` to use the history helpers instead of mutating undo/redo stacks inline.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-history.test.mjs src/lib/workflow-keyboard.test.mjs`: passed, 11/11.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 75/75.
- `npm run lint`: passed.
- `npm run build`: passed.
- Live Workflow preview: passed, no browser console errors.
- Live Admin preview: passed, no browser console errors.
- Final autoreview: passed with no actionable Step 3 findings.
