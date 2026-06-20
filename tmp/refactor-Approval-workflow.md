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
