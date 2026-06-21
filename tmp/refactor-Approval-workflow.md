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

## Step 4 - User Directory Boundary

Status: complete.

Plan:
- Extract user-directory and default role-assignment construction from `approval-workspace.tsx`.
- Add focused tests for role precedence, graph-derived roles, and default business/department assignment.
- Keep Admin and workflow page props using the same `UserDirectoryEntry` contract from the new library.
- Verify with typecheck, full tests, lint, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/user-directory.ts` for user directory collection and default role assignment.
- Added `src/lib/user-directory.test.mjs` for focused coverage.
- Rewired `approval-workspace.tsx` to import the extracted helpers and type.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/user-directory.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 79/79.
- `npm run lint`: passed.
- `npm run build`: passed. Webpack emitted a non-fatal cache warning after successful build completion.
- Live Workflow preview: passed, no browser console errors.
- Live Admin preview: passed, no browser console errors.
- Final autoreview: passed with no actionable Step 4 findings.

## Step 5 - Workflow Document Utilities

Status: complete.

Plan:
- Extract document format labels, accepted upload extensions, parser field-source mapping, and attachment-record construction from `approval-workspace.tsx`.
- Add focused tests for document format behavior and deterministic attachment creation.
- Keep the page component using the same helpers through a small import boundary.
- Verify with typecheck, full tests, lint, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-documents.ts` for document format and attachment helpers.
- Added `src/lib/workflow-documents.test.mjs` for focused coverage.
- Rewired `approval-workspace.tsx` to import the document helpers.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-documents.test.mjs`: passed, 5/5.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 84/84.
- `npm run lint`: passed.
- `npm run build`: passed. Webpack emitted a non-fatal cache warning after successful build completion.
- Live Workflow preview: passed, no browser console errors.
- Live Upload preview: passed, no browser console errors.
- Live Admin preview: passed, no browser console errors.
- Final autoreview: passed with no actionable Step 5 findings.

## Step 6 - Workflow Condition Context Boundary

Status: complete.

Plan:
- Extract condition upstream/downstream context and workflow node labels from `approval-workspace.tsx`.
- Add focused tests for upstream approver discovery, downstream outcome mapping, numeric field filtering/deduplication, and node-kind labels.
- Keep the condition editor and canvas controls using the same helper API through imports.
- Verify with typecheck, full tests, lint, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-condition-context.ts` for condition context and workflow node labels.
- Added `src/lib/workflow-condition-context.test.mjs` for focused coverage.
- Rewired `approval-workspace.tsx` to import the condition context helpers.
- Reworked workspace boot so the first render is deterministic and local saved state loads after mount instead of reading `localStorage` during initial state setup.
- Removed the root `src/app/loading.tsx` route-level streaming fallback because the local preview received the completed workspace HTML hidden behind the fallback but did not swap it in. Component-level loading remains for the workflow canvas.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-condition-context.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm test -- --runInBand`: passed, 88/88.
- `npm run lint`: passed.
- `npm run build`: passed.
- Live Workflow preview after production build: passed, no browser console errors; canvas, Template Builder, Condition, and Return/Reject controls visible.
- Final autoreview: passed with no actionable Step 6 findings. Noted residual gap: no automated browser/hydration regression test for the boot path, covered by live preview for this step.

## Step 7 - Workspace Boot And Sync Boundary

Status: complete.

Plan:
- Extract deterministic workspace bootstrap helpers from the page component.
- Move local-storage boot, remote workspace load, autosave, escalation ticking, selected ids, and persistence helpers behind a dedicated client hook.
- Keep `approval-workspace.tsx` focused on UI orchestration and task/workflow actions.
- Verify with targeted bootstrap tests, typecheck, lint, full tests, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-bootstrap.ts` for seeded workspace snapshots, task personalization, initial selected task resolution, remote-load eligibility, and safe snapshot patching.
- Added `src/lib/workspace-bootstrap.test.mjs` for deterministic boot and patch behavior.
- Added `src/app/use-approval-workspace-state.ts` to own local/Supabase workspace synchronization and persistence helpers.
- Rewired `src/app/approval-workspace.tsx` to consume the new hook instead of hosting boot/sync effects inline.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workspace-bootstrap.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow preview before full build: passed, no browser console errors; canvas, Template Builder, Condition, and saved-status UI visible.
- `npm test -- --runInBand`: passed, 92/92.
- `npm run build`: passed.
- Live Workflow preview after production build: passed, no browser console errors; canvas, Template Builder, Condition, and saved-status UI visible.
- Final autoreview: passed with no actionable Step 7 findings. Noted residual gap: no hook-level timing test around `useApprovalWorkspaceState` with mocked local storage and Supabase load/autosave timing.

## Step 8 - Task Display Helper Boundary

Status: complete.

Plan:
- Extract task path-state and access-role display helpers from the page component.
- Add focused tests for path state priority, state labels, and visible participant role labels.
- Keep queue/tracking/workflow UI rendering unchanged while importing the pure helpers.
- Verify with targeted tests, typecheck, lint, full tests, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/task-display.ts` for workflow path node state, state labels, and task access role labels.
- Added `src/lib/task-display.test.mjs` for focused coverage.
- Rewired `src/app/approval-workspace.tsx` to import the task display helpers.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-display.test.mjs src/lib/workspace-bootstrap.test.mjs`: passed, 7/7.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow preview before full build: passed, no browser console errors; canvas, condition UI, and path-state labels visible.
- `npm test -- --runInBand`: passed, 95/95.
- `npm run build`: passed.
- Live Workflow preview after production build: passed, no browser console errors; canvas, condition UI, and path-state labels visible.
- Final autoreview: passed with no actionable Step 8 findings. Noted residual gap: no UI-level regression test for tracking path badges and the "Your role" label.

## Step 9 - Queue And Tracking View Boundary

Status: complete.

Plan:
- Move queue, tracking, workflow-path summary, audit list, status badge, and user datalist rendering out of `approval-workspace.tsx`.
- Keep action handlers and workspace state in the main component.
- Share task template lookup through `src/lib/task-display.ts`.
- Verify with targeted helper tests, typecheck, lint, live Queue and Tracking previews, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/app/task-views.tsx` for Queue and Tracking presentation components.
- Moved action button configuration and status badge rendering into the task views module.
- Extended `src/lib/task-display.ts` with `findTemplateForTask` so page logic and Tracking view share the same template lookup.
- Removed duplicated queue/tracking/path/audit rendering from `approval-workspace.tsx`.
- Autoreview found the first extracted `StatusBadge` collapsed distinct status colors/icons. Restored the exact pre-extraction badge branches for overdue, escalated, returned, reassigned, delegated, cancelled, approved, and pending.

Verification:
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-display.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Queue preview before full build: passed, no browser console errors; queue, decision actions, and audit trail visible.
- Live Tracking preview before full build: passed, no browser console errors; tracked requests, role label, workflow path, and document section visible.
- `npm test -- --runInBand`: passed, 96/96.
- `npm run build`: passed.
- Live Queue preview after production build: passed, no browser console errors; queue, decision actions, and audit trail visible.
- Live Tracking preview after production build: passed, no browser console errors; tracked requests, role label, workflow path, and document section visible.
- Autoreview: P2 status badge behavior drift found and fixed.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-display.test.mjs`: passed, 4/4 after fix.
- `npx tsc --noEmit`: passed after fix.
- `npm run lint`: passed after fix.
- Live Queue and Tracking previews after fix: passed, no browser console errors; pending badges and moved views visible.
- `npm test -- --runInBand`: passed, 96/96 after fix.
- `npm run build`: passed after fix.
- Final live Queue and Tracking previews after production build: passed, no browser console errors.
- Final autoreview: P2 status badge behavior drift was fixed; no remaining actionable Step 9 findings.

## Step 10 - Upload View Boundary

Status: complete.

Plan:
- Extract upload-tab derived state into a pure helper.
- Move Upload request/document/extraction UI out of `approval-workspace.tsx`.
- Preserve template fallback, upload document requirements, uploaded-document markers, and missing-required warnings.
- Verify with red/green helper tests, typecheck, lint, live Upload preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/upload-view-state.ts` for selected template, upload document requirements, uploaded document ids, and missing required documents.
- Added `src/lib/upload-view-state.test.mjs`; verified it failed before the helper existed, then passed after implementation.
- Added `src/app/upload-view.tsx` for the Upload tab presentation.
- Rewired `src/app/approval-workspace.tsx` to import `UploadView` and removed the local Upload view implementation.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/upload-view-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/upload-view-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Upload preview before full build: passed, no browser console errors; upload heading, template select, document requirements, choose-file control, and extraction placeholder visible.
- `npm test -- --runInBand`: passed, 99/99.
- `npm run build`: passed.
- Live Upload preview after production build: passed, no browser console errors; upload heading, template select, document requirements, choose-file control, and extraction placeholder visible.
- Final autoreview: passed with no actionable Step 10 findings. Noted residual gap: no UI-level upload interaction test for required-document cards, attached markers, missing-required warnings, and submit disabling.

## Step 11 - Admin View Boundary

Status: complete.

Plan:
- Extract Admin tab presentation and Admin-specific business-directory mutations out of `approval-workspace.tsx`.
- Add a pure helper for selected-business fallback and draft defaults.
- Preserve business, department, role assignment, notification, legacy department, and delegation rendering.
- Verify with red/green helper tests, typecheck, lint, live Admin preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/admin-view-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/admin-view-state.ts` for selected business fallback, selected id, draft name, and department list.
- Added `src/app/admin-view.tsx` for Admin tab presentation.
- Rewired `src/app/approval-workspace.tsx` to import `AdminView` and removed the local Admin view implementation.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/admin-view-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/admin-view-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Admin preview before full build: passed, no browser console errors; businesses, departments, role management, notifications, and delegation sections visible.
- `npm test -- --runInBand`: passed, 102/102.
- `npm run build`: passed.
- Live Admin preview after production build: passed, no browser console errors; businesses, departments, role management, notifications, and delegation sections visible.
- Final autoreview: passed with no actionable Step 11 findings. Noted residual gaps: no UI-level Admin edit-flow test and no rendered Admin tab regression test.

## Step 12 - Condition Routing State Boundary

Status: complete.

Plan:
- Extract condition-routing ordering, display names, nicknames, target filtering, and rule summary wording into a pure helper.
- Keep the existing Box Details UI in place while removing local derived-state logic from `approval-workspace.tsx`.
- Preserve condition case ordering, fallback labeling, approval-count wording, numeric rule wording, and available outcome targets.
- Verify with red/green helper tests, typecheck, lint, live Workflow condition preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/condition-routing-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/condition-routing-state.ts` for condition case ordering, display/nickname handling, summary wording, and available target filtering.
- Rewired `ConditionBoxDetails` in `src/app/approval-workspace.tsx` to use the extracted routing helper functions.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/condition-routing-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/condition-routing-state.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow condition preview before full build: passed, no browser console errors; selecting a condition node showed Box details, Condition rules, upstream approvals, downstream outcome boxes, parsed numeric values, and Add condition controls.
- `npm test -- --runInBand`: passed, 106/106.
- `npm run build`: passed.
- Live Workflow condition preview after production build: passed, no browser console errors; selecting a condition node showed Box details, Condition rules, upstream approvals, downstream outcome boxes, parsed numeric values, and Add condition controls.
- Autoreview: passed with no actionable Step 12 findings. Review noted residual pure-helper gaps for exact approval count, OR join, fallback, and no-rule summaries.
- Added those pure-helper cases after autoreview.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/condition-routing-state.test.mjs`: passed, 6/6 after added cases.
- `npx tsc --noEmit`: passed after added cases.
- `npm run lint`: passed after added cases.
- `npm test -- --runInBand`: passed, 108/108 after added cases.
- Final residual gap: no UI-level regression test confirming the rendered condition panel shows ordering, nicknames, summary text, and available outcome targets correctly.

## Step 13 - Condition Box Details Component Boundary

Status: complete.

Plan:
- Move the condition Box Details drawer UI out of `approval-workspace.tsx`.
- Keep workflow/canvas state and handlers in `WorkflowView`, passing them into the extracted component.
- Preserve condition rule editing, fallback routes, outcome selection, numeric rules, approval count rules, and available target selection.
- Verify with typecheck, lint, live Workflow condition preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/app/condition-box-details.tsx` for the condition drawer UI.
- Rewired `src/app/approval-workspace.tsx` to import `ConditionBoxDetails`.
- Kept the pure condition routing helpers from Step 12 shared by the extracted component.

Verification:
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow condition preview before full build: passed, no browser console errors; selecting a condition node showed the extracted Box Details condition controls.
- `npm test -- --runInBand`: passed, 108/108.
- `npm run build`: passed.
- Live Workflow condition preview after production build: passed, no browser console errors; selecting a condition node showed the extracted Box Details condition controls.
- Final autoreview: passed with no actionable Step 13 findings. Noted residual gaps: no UI-level condition drawer edit-flow tests for fallback routes, outcome checkboxes, numeric rules, approval-count rules, pick-on-canvas state, or target-node updates.

## Step 14 - Workflow Template Library Boundary

Status: complete.

Plan:
- Extract the Workflow tab Template Library pane out of `approval-workspace.tsx`.
- Add a pure helper for template card counts, active selection, and business/department labels.
- Preserve template selection, builder loading, delete actions, and selected-card highlighting.
- Verify with red/green helper tests, typecheck, lint, live Template Library preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-library-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-template-library-state.ts` for library card state.
- Added `src/app/workflow-template-library.tsx` for the Template Library pane.
- Rewired `src/app/approval-workspace.tsx` to render `WorkflowTemplateLibrary`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-library-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-library-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Template Library preview before full build: passed, no browser console errors; template cards, business/department labels, counts, Load, and Delete controls visible.
- `npm test -- --runInBand`: passed, 111/111.
- `npm run build`: passed.
- Live Template Library preview after production build: passed, no browser console errors; template cards, business/department labels, counts, Load, and Delete controls visible.
- Final autoreview: passed with no actionable Step 14 findings. Noted residual gaps: no rendered UI interaction tests for selecting a template card, Load, Delete, or empty-library state.

## Step 15 - Workflow Template Builder Boundary

Status: complete.

Plan:
- Extract the Workflow tab Template Builder pane out of `approval-workspace.tsx`.
- Add a pure helper for selected business fallback, department options, and business-change department defaults.
- Preserve template name, business, department, create-template behavior, and department select/text input behavior.
- Verify with red/green helper tests, typecheck, lint, live Template Builder preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-builder-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-template-builder-state.ts` for builder business and department state.
- Added `src/app/workflow-template-builder.tsx` for the Template Builder pane.
- Rewired `src/app/approval-workspace.tsx` to render `WorkflowTemplateBuilder`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-builder-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-builder-state.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Template Builder preview before full build: passed, no browser console errors; template name, business, department, and Create template controls visible.
- `npm test -- --runInBand`: passed, 115/115.
- `npm run build`: passed.
- Live Template Builder preview after production build: passed, no browser console errors; template name, business, department, and Create template controls visible.
- Final autoreview: passed with no actionable Step 15 findings. Noted residual gaps: no rendered UI interaction tests for editing template name/business/department, department reset on business change, Create Template payload, or free-text department path.

## Step 16 - Workflow Runtime Panel Boundary

Status: complete.

Plan:
- Extract the Workflow canvas runtime status, validation, route simulation, and runner controls out of `approval-workspace.tsx`.
- Add a pure helper for runtime task fallback, runtime status text, and runner action disabled/title state.
- Preserve runtime task selection, undo/redo/reset controls, validation issue display, route simulation summary, runner action buttons, and missing-document approval blocking.
- Verify with red/green helper tests, typecheck, lint, live Workflow canvas preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-runtime-panel-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-runtime-panel-state.ts` for runtime task fallback, status label, and runner action state.
- Added `src/app/workflow-runtime-panel.tsx` for the runtime/validation/runner UI.
- Rewired `src/app/approval-workspace.tsx` to render `WorkflowRuntimePanel`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-runtime-panel-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-runtime-panel-state.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow canvas runtime preview before full build: passed, no browser console errors; runtime status, undo/redo/reset, validation, route simulation, and workflow runner sections visible.
- `npm test -- --runInBand`: passed, 119/119.
- `npm run build`: passed.
- Live Workflow canvas runtime preview after production build: passed, no browser console errors; runtime status, undo/redo/reset, validation, route simulation, and workflow runner sections visible.
- Final autoreview: passed with no actionable Step 16 findings. Noted residual gaps: no rendered UI interaction tests for runtime task selection, runner button callbacks, validation issue truncation/warning summary, or disabled approve state with missing current-node documents.

## Step 17 - Workflow Canvas Toolbar Boundary

Status: complete.

Plan:
- Extract the Workflow canvas title, add-box buttons, connect-from prompt, and condition outcome prompt out of `approval-workspace.tsx`.
- Add a pure helper for connect/outcome prompt text.
- Preserve add-box button behavior, connect cancel behavior, outcome-pick done behavior, and prompt visibility.
- Verify with red/green helper tests, typecheck, lint, live Workflow canvas preview, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-toolbar-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-canvas-toolbar-state.ts` for connect/outcome prompt text.
- Added `src/app/workflow-canvas-toolbar.tsx` for the canvas toolbar and prompt UI.
- Rewired `src/app/approval-workspace.tsx` to render `WorkflowCanvasToolbar`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-toolbar-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-toolbar-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live Workflow canvas toolbar preview before full build: passed, no browser console errors; canvas title, add-box buttons, and runtime panel remained visible.
- `npm test -- --runInBand`: passed, 122/122.
- `npm run build`: passed.
- Live Workflow canvas toolbar preview after production build: passed, no browser console errors; canvas title, add-box buttons, and runtime panel remained visible.
- Final autoreview: passed with no actionable Step 17 findings. Noted residual gaps: no rendered UI interaction tests for toolbar title/buttons, add-box callback payloads, connect cancel, outcome Done, or simultaneous prompt visibility.

## Step 18 - Workflow Edge Details Boundary

Status: complete.

Plan:
- Extract the selected workflow branch/edge details editor out of `approval-workspace.tsx`.
- Add a pure helper for edge detail defaults: rule field, rule operator, rule value, rule builder visibility, for-information note, and blocking toggle state.
- Preserve branch type, branch label, condition rule builder, blocking toggle, and for-information branch behavior.
- Verify with red/green helper tests, typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-edge-details-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-edge-details-state.ts` for edge detail derived UI state.
- Added `src/app/workflow-edge-details.tsx` for the selected branch editor.
- Rewired `src/app/approval-workspace.tsx` to render `WorkflowEdgeDetails`.
- Reduced `src/app/approval-workspace.tsx` from 2000 lines to 1899 lines.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-edge-details-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-edge-details-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live browser smoke before full build: server reachable; fresh Chrome session redirected `http://localhost:3000/?tab=workflow` to `/login` with no console errors. Authenticated workflow edge-panel selection was blocked because no reusable test credentials or browser session cookie were available, and no live Supabase user was created for this refactor smoke test.
- `npm test -- --runInBand`: passed, 125/125.
- `npm run build`: passed.
- Post-build route smoke: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate.
- Final autoreview: passed with no actionable Step 18 findings. Noted residual gap: authenticated browser selection of an edge was not exercised because no test credentials or reusable session cookie were available in the clean automation browser.

## Step 19 - Workspace Shell Boundary

Status: complete.

Plan:
- Extract the sidebar, top header, navigation tabs, notification badge, signed-in user display, sync status label, logout link, and New request link out of `approval-workspace.tsx`.
- Add a pure helper for shell unread count and sync status label.
- Preserve tab URLs, active-tab highlighting, sidebar collapse behavior, notification counts, and workspace sync copy.
- Verify with red/green helper tests, typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-shell-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workspace-shell-state.ts` for shell unread-count and sync-label state.
- Added `src/app/workspace-shell.tsx` for app chrome/navigation.
- Rewired `src/app/approval-workspace.tsx` to render the active view as `WorkspaceShell` children.
- Reduced `src/app/approval-workspace.tsx` from 1899 lines to 1802 lines.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workspace-shell-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workspace-shell-state.test.mjs`: passed, 2/2.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated shell interaction was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 127/127.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 19 findings. Noted residual gap: no rendered UI interaction test for tab navigation or sidebar collapse.

## Step 20 - Task Action Preflight Boundary

Status: complete.

Plan:
- Extract the task action preflight decisions out of `ApprovalWorkspaceBody.recordAction`.
- Add a pure helper for reassign/delegate target-email blocking and approval missing-document error messaging.
- Preserve silent blocking for reassign/delegate without a target email and visible error messaging for missing required approval documents.
- Verify with red/green helper tests, typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/task-action-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/task-action-state.ts` for task action preflight state.
- Rewired `recordAction` in `src/app/approval-workspace.tsx` to use `getTaskActionPreflightState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-action-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-action-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=queue` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated queue action interaction was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 130/130.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 20 findings. Added separate plain `approve` missing-document assertion after reviewer noted it as coverage depth.
- Final focused recheck after coverage addition: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-action-state.test.mjs` passed, 3/3.

## Step 21 - Workspace Template Record Boundary

Status: complete.

Plan:
- Extract template record create/update/delete list mutation and selected-template fallback state out of `ApprovalWorkspaceBody`.
- Add a pure helper for created template prepending/selection, updated template replacement, and selected-template fallback after deletion.
- Preserve persistence payloads, selected-template updates, and list ordering.
- Verify with red/green helper tests, typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-template-record-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workspace-template-record-state.ts` for template record mutation state.
- Rewired `createTemplateRecord`, `updateTemplateRecord`, and `deleteTemplateRecord` in `src/app/approval-workspace.tsx` to use the helper.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workspace-template-record-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workspace-template-record-state.test.mjs`: passed, 4/4.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated template create/update/delete interaction was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 134/134.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 21 findings.

## Step 22 - Workflow Canvas Selection Boundary

Status: complete.

Plan:
- Extract selected node, selected edge, connect-from node, and active condition outcome target derivation out of `WorkflowView`.
- Add a pure helper for canvas selection state.
- Preserve selected item lookup, missing-id null behavior, and condition outcome target highlighting.
- Verify with red/green helper tests, typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-selection-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-canvas-selection-state.ts` for selected graph item and active outcome target state.
- Rewired `WorkflowView` in `src/app/approval-workspace.tsx` to use `getWorkflowCanvasSelectionState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-selection-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-selection-state.test.mjs`: passed, 3/3.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated canvas selection interaction was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 137/137.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 22 findings. Reviewer noted its fork hit an unrelated generated `.next/types/validator.ts` missing `./routes.js` typecheck artifact, while this turn's fresh `npx tsc --noEmit` and `npm run build` both passed.

## Step 23 - Workflow Canvas Instance Key Boundary

Status: complete.

Plan:
- Extract the React Flow canvas instance key serialization out of `WorkflowView`.
- Add a pure helper for workflow id, reset nonce, graph node/edge identity, and runtime task identity.
- Preserve the same remount key inputs while isolating the serialization logic.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-instance-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-canvas-instance-state.ts` for canvas instance key derivation.
- Rewired `WorkflowView` in `src/app/approval-workspace.tsx` to call `getWorkflowCanvasInstanceKey`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-instance-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-instance-state.test.mjs`: passed, 2/2.
- Initial `npx tsc --noEmit` failed on generated `.next/types/validator.ts` importing missing `./routes.js`; root cause was incomplete generated Next route types after prior builds, not Step 23 source files. Local Next 16 CLI docs recommend `next typegen && tsc --noEmit` for route type generation before type-checking.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated canvas remount behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 139/139.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 23 findings. Noted residual gap: authenticated canvas remount behavior was not exercised in browser automation.
