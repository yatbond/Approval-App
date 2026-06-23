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

## Step 24 - Approval Workspace Task State Boundary

Status: complete.

Plan:
- Extract actionable task, tracking task, selected task, selected task template, and missing current-node document derivation out of `ApprovalWorkspaceBody`.
- Add a pure orchestration helper over the existing approval visibility, task template lookup, and request-builder document checks.
- Preserve queue/tracking visibility, selected-task fallback order, template lookup, and current-node missing document behavior.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/approval-workspace-task-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/approval-workspace-task-state.ts` for workspace task state assembly.
- Rewired `ApprovalWorkspaceBody` in `src/app/approval-workspace.tsx` to use `getApprovalWorkspaceTaskState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/approval-workspace-task-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/approval-workspace-task-state.test.mjs`: passed, 2/2.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=queue` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated queue/tracking task selection behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 141/141.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 24 findings. Added selected tracking-only fallback assertion after reviewer noted it as coverage depth.
- Final focused recheck after coverage addition: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/approval-workspace-task-state.test.mjs` passed, 3/3.

## Step 25 - Task Document Attachment Boundary

Status: complete.

Plan:
- Extract the uploaded-document-to-task state transition out of `ApprovalWorkspaceBody.attachTaskDocument`.
- Add a pure helper for creating the attachment record, appending it to the task, adding the uploader as a participant, updating the last action, and appending the audit event.
- Preserve unresolved-template no-op behavior, storage/public URL propagation, workflow node attachment linking, and upload error handling in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/task-document-attachment-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/task-document-attachment-state.ts` for task document attachment state updates.
- Rewired `attachTaskDocument` in `src/app/approval-workspace.tsx` to use `attachDocumentToTaskState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-document-attachment-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/task-document-attachment-state.test.mjs`: passed, 2/2 after correcting the no-template fixture to avoid matching by workflow name fallback.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=queue` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated document attachment interaction was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 144/144.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 25 findings.

## Step 26 - Workflow Runner Action Actor Boundary

Status: complete.

Plan:
- Extract workflow runner simulation actor resolution out of `ApprovalWorkspaceBody.runWorkflowAction`.
- Preserve requester actor behavior for amend/cancel and current-owner/pending-owner/fallback behavior for normal workflow actions.
- Keep `applyTaskAction` inputs unchanged other than delegating the actor object construction.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-runner-action-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-runner-action-state.ts` for workflow runner action actor selection.
- Rewired `runWorkflowAction` in `src/app/approval-workspace.tsx` to call `getWorkflowRunnerActionActor`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-runner-action-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-runner-action-state.test.mjs`: passed, 2/2.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated workflow runner behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 146/146.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 26 findings.

## Step 27 - Workflow Canvas Delete State Boundary

Status: complete.

Plan:
- Extract selected canvas item deletion orchestration out of `WorkflowView`.
- Preserve non-start node deletion, start-node protection, edge deletion fallback, and selection/connect-source cleanup.
- Reuse the existing workflow graph deletion helpers from a pure state helper.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-delete-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-canvas-delete-state.ts` for selected canvas delete decisions.
- Rewired `deleteSelectedCanvasItem` in `src/app/approval-workspace.tsx` to call `getWorkflowCanvasDeleteState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-delete-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-delete-state.test.mjs`: passed, 3/3.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated canvas delete behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 149/149.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 27 findings.

## Step 28 - Workflow Document Field State Boundary

Status: complete.

Plan:
- Extract workflow document extraction-field add/update/remove mutations out of `WorkflowView`.
- Preserve field patching, default added field shape, document-format-to-source mapping, and field removal behavior.
- Keep template-level persistence and document summary rebuilding in `updateTemplateDocuments`.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-document-field-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-document-field-state.ts` for document field mutation helpers.
- Rewired `updateBoxDocumentField`, `addBoxDocumentField`, and `removeBoxDocumentField` in `src/app/approval-workspace.tsx` to call the helper.
- Initial typecheck found a widened `type: string` inference for the default field; fixed by adding explicit `WorkflowDocumentRequirement[]` helper return types.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-document-field-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-document-field-state.test.mjs`: passed, 3/3.
- First `npx next typegen && npx tsc --noEmit` failed because the new helper inferred the added field `type` property as `string`; explicit return types fixed the issue.
- `npx next typegen && npx tsc --noEmit`: passed after the return-type fix.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated box document field editing was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 152/152.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 28 findings.

## Step 29 - Workflow Condition Case State Boundary

Status: complete.

Plan:
- Extract add-condition and add-fallback condition case mutations out of `WorkflowView`.
- Preserve condition-only guards, upstream approval defaults, fallback duplicate guard, fallback case shape, and save labels.
- Keep condition context lookup and timestamp id generation at the component boundary.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-condition-case-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-condition-case-state.ts` for add-condition and add-fallback state helpers.
- Rewired `addConditionCaseToSelectedBox` and `addFallbackConditionCaseToSelectedBox` in `src/app/approval-workspace.tsx` to call the helper.
- Initial typecheck caught the moved guard no longer protecting `getConditionContext` from `null`; restored a selected-node guard before context lookup while leaving mutation logic delegated.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-condition-case-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-condition-case-state.test.mjs`: passed, 3/3.
- First `npx next typegen && npx tsc --noEmit` failed because `getConditionContext` still requires a non-null selected node; adding the guard fixed the issue.
- `npx next typegen && npx tsc --noEmit`: passed after the guard fix.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated condition-case editing was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 155/155.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 29 findings.

## Step 30 - Workflow Canvas Edit State Boundary

Status: complete.

Plan:
- Extract canvas node creation and node connection graph/selection transitions out of `WorkflowView`.
- Preserve owner-backed node defaults, blocking defaults, create-node selection, self-connect no-op, connection edge defaults, and post-connect selection cleanup.
- Reuse existing graph mutation helpers and node kind labels from a pure state helper.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-edit-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-canvas-edit-state.ts` for create-node and connect-node state helpers.
- Rewired `createCanvasNode` and `connectWorkflowNodes` in `src/app/approval-workspace.tsx` to call the helper.
- Removed now-unused `addWorkflowBranch` and `formatNodeKind` imports from the component.
- Initial focused test expected the new edge without `rule: undefined`; corrected the test to match existing `addWorkflowBranch` edge shape.
- Initial lint verification command had a malformed shell quote and exited immediately; reran the correct lint command successfully.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-edit-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-canvas-edit-state.test.mjs`: passed, 4/4.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed after rerunning with the corrected command.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated canvas create/connect behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 159/159.
- `npm run build`: exited 0 and generated the app successfully; webpack emitted a non-blocking cache warning for `.next/cache/webpack/server-production/1.pack`.
- Final autoreview: passed with no actionable Step 30 findings.

## Step 31 - Workflow Box Document State Boundary

Status: complete.

Plan:
- Extract add-document-to-selected-box state out of `WorkflowView`.
- Preserve document type trimming, default extraction field shape, document-format-to-source mapping, selected node linking, save label, and form reset defaults.
- Keep template persistence in `saveWorkflowTemplate` and leave the UI handler responsible only for applying helper output.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-box-document-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-box-document-state.ts` for add-box-document state and reset defaults.
- Rewired `addDocumentToSelectedBox` in `src/app/approval-workspace.tsx` to call `getWorkflowAddBoxDocumentState`.
- Removed now-unused `addWorkflowDocumentToNode` and `fieldSourceForDocumentFormat` imports from the component.
- Initial focused test expected no `documentId` on the generated field; corrected the test to reflect existing `addWorkflowDocumentToNode` enrichment.
- Initial autoreview found the component guard had been weakened from `selectedGraphNode` to `selectedNodeId`; restored the `selectedGraphNode` guard, then removed an overcorrection that would have rejected existing empty-label nodes.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-box-document-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-box-document-state.test.mjs`: passed, 3/3 after review fixes.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated box document add behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 162/162 after review fixes.
- `npm run build`: passed.
- Final autoreview: initial P2 behavior finding was fixed; final re-review had no code findings and only noted stale tracker counts, now corrected.

## Step 32 - Workflow Template Document State Boundary

Status: complete.

Plan:
- Extract template document summary rebuilding out of `WorkflowView.updateTemplateDocuments`.
- Preserve documentTypes derivation, document list replacement, flattened template fields, and save label.
- Keep persistence and updater execution in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-document-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-template-document-state.ts` for rebuilding the template document summary fields.
- Rewired `updateTemplateDocuments` in `src/app/approval-workspace.tsx` to call `getWorkflowTemplateDocumentState`.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-document-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-document-state.test.mjs`: passed, 2/2.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated document summary editing was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 164/164.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 32 findings.

## Step 33 - Workflow Template Load State Boundary

Status: complete.

Plan:
- Extract template-to-builder form loading state out of `WorkflowView`.
- Preserve template name loading, department loading, matching-business lookup, and current-business fallback when the template business is not in the editable directory.
- Keep React state setters in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-load-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-template-load-state.ts` for builder load state derivation.
- Rewired `loadTemplateIntoBuilder` in `src/app/approval-workspace.tsx` to call `getWorkflowTemplateLoadState`.
- Initial autoreview noted unmatched businesses previously skipped `setBusinessId`; added `shouldSetBusinessId` so the component preserves that setter behavior.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-load-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-load-state.test.mjs`: passed, 2/2 after review fix.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated template-loading behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 166/166 after review fix.
- `npm run build`: passed after review fix.
- Final autoreview: initial P3 setter behavior finding was fixed; final re-review passed with no actionable Step 33 findings.

## Step 34 - Workflow Template Save State Boundary

Status: complete.

Plan:
- Extract workflow template save/no-op/history decision logic out of `WorkflowView.saveWorkflowTemplate`.
- Preserve no-workflow guard in the component, JSON equality no-op behavior, history recording label/template, and update dispatch.
- Keep React state setters and `onUpdateTemplate` in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-save-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-template-save-state.ts` for save/no-op/history state derivation.
- Rewired `saveWorkflowTemplate` in `src/app/approval-workspace.tsx` to call `getWorkflowTemplateSaveState`.
- Avoided relying on React functional state setter execution for the no-op decision by previewing `didUpdate` before scheduling the history update.
- Removed the now-unused `recordWorkflowHistoryEdit` import from the component.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-save-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-save-state.test.mjs`: passed, 2/2.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated save/history behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 168/168.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 34 findings.

## Step 35 - Workflow History Action State Boundary

Status: complete.

Plan:
- Extract undo/redo workflow action decisions out of `WorkflowView`.
- Preserve no-workflow and empty-stack no-op behavior, history transitions, returned template application, and canvas reset signal.
- Keep React state setters, `onUpdateTemplate`, and reset implementation in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-history-action-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-history-action-state.ts` for undo/redo action state.
- Rewired `undoWorkflowChange` and `redoWorkflowChange` in `src/app/approval-workspace.tsx` to call the helper.
- Initial typecheck caught call-site property names using `workflowHistoryById`; corrected them to the helper's `historyById` parameter.
- Removed direct `undoWorkflowHistory` and `redoWorkflowHistory` imports from the component.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-history-action-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-history-action-state.test.mjs`: passed, 3/3.
- First `npx next typegen && npx tsc --noEmit` failed on the call-site property name mismatch; it passed after the fix.
- `npx next typegen && npx tsc --noEmit`: passed after the call-site fix.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated undo/redo behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 171/171.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 35 findings.

## Step 36 - Workflow Node Patch State Boundary

Status: complete.

Plan:
- Extract workflow node move and selected-node patch state out of `WorkflowView`.
- Preserve move label, selected-node update label, missing-selected-node no-op behavior, and graph node patching through the existing graph helper.
- Keep persistence through `saveWorkflowGraph` in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-node-patch-state.test.mjs`; verified it failed before the helper existed.
- Added `src/lib/workflow-node-patch-state.ts` for move-node and selected-node patch state.
- Rewired `moveWorkflowNode` and `updateSelectedNode` in `src/app/approval-workspace.tsx` to call the helper.
- Removed the now-unused `updateWorkflowGraphNode` import from the component.

Verification:
- Red step: `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-node-patch-state.test.mjs` failed with missing module before implementation.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-node-patch-state.test.mjs`: passed, 3/3.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated node move/edit behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 174/174.
- `npm run build`: passed.
- Final autoreview: passed with no actionable Step 36 findings.

## Step 37 - Workflow Condition Case Mutation State Boundary

Status: complete.

Plan:
- Extract selected condition case update, delete, and clicked outcome-target assignment logic out of `WorkflowView`.
- Preserve existing no-op guards, save labels, start/self target rejection, de-duped target assignment, and active outcome picker clearing when its case is deleted.
- Keep persistence through `saveWorkflowGraph` and local picker state in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Extended `src/lib/workflow-condition-case-state.test.mjs`; verified the focused test failed before the helper exports existed.
- Extended `src/lib/workflow-condition-case-state.ts` with `getWorkflowUpdateConditionCaseState`, `getWorkflowDeleteConditionCaseState`, and `getWorkflowAddOutcomeTargetState`.
- Rewired `src/app/approval-workspace.tsx` to call the helper functions instead of building condition graph mutations inline.
- Addressed autoreview's coverage recommendation by adding a test that deleting an inactive condition case preserves the active outcome picker id.
- Removed direct condition case graph mutation imports from the component.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-condition-case-state.test.mjs` failed with missing helper export before implementation.
- `node --experimental-strip-types --test src/lib/workflow-condition-case-state.test.mjs`: passed, 7/7.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated condition editing behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 178/178.
- `npm run build`: passed.
- Autoreview: passed with no Critical, Important, or Minor findings; one coverage recommendation was addressed before commit.

## Step 38 - Workflow Edge Update State Boundary

Status: complete.

Plan:
- Extract selected edge patching and selected edge rule update logic out of `WorkflowView`.
- Preserve no-selected-edge no-op behavior, branch update labels, for-information branch normalization, and rule field defaulting/preservation.
- Keep persistence through `saveWorkflowGraph` in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-edge-update-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workflow-edge-update-state.ts` with `getWorkflowUpdateSelectedEdgeState` and `getWorkflowUpdateSelectedEdgeRuleState`.
- Rewired `src/app/approval-workspace.tsx` so selected edge edits call the helper instead of mutating graph edges inline.
- Removed the direct `updateWorkflowGraphEdge` import from the component.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-edge-update-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workflow-edge-update-state.test.mjs`: passed, 4/4.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated edge editing behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 182/182.
- `npm run build`: passed.
- Autoreview: no Critical or Important findings; Minor finding noted that the new helper/test files were untracked before staging, which was addressed before commit.

## Step 39 - Workflow Canvas Reset State Boundary

Status: complete.

Plan:
- Extract canvas reset state derivation out of `WorkflowView`.
- Preserve clearing selected node, selected edge, connect source, condition outcome picker, and incrementing the canvas reset nonce.
- Keep the React functional nonce update so repeated resets queued before render still use the latest pending nonce.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-canvas-reset-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workflow-canvas-reset-state.ts` with `getWorkflowCanvasResetState`.
- Rewired `resetCanvasView` in `src/app/approval-workspace.tsx` to apply the helper-derived cleared state while using the helper inside the functional nonce setter.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-canvas-reset-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workflow-canvas-reset-state.test.mjs`: passed, 1/1.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated canvas reset behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 183/183.
- `npm run build`: passed.
- Autoreview: passed with no Critical, Important, or Minor findings; reviewer noted the new helper/test should be staged before commit, which was addressed.

## Step 40 - Workflow Document Requirement Update State Boundary

Status: complete.

Plan:
- Extract single document requirement patching out of `WorkflowView`.
- Preserve the existing document update behavior and save label.
- Keep generic document-list rebuild behavior in the same template document state helper.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Extended `src/lib/workflow-template-document-state.test.mjs`; verified the focused test failed before the helper export existed.
- Added `getWorkflowUpdateDocumentRequirementState` to `src/lib/workflow-template-document-state.ts`, delegating to the existing document requirement updater.
- Rewired `updateBoxDocumentRequirement` in `src/app/approval-workspace.tsx` to call the helper and removed the direct `updateWorkflowDocumentRequirement` component import.
- Cleaned up the helper patch type after autoreview so it does not add an unnecessary `DocumentFormat` overlay.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-template-document-state.test.mjs` failed with missing helper export before implementation.
- `node --experimental-strip-types --test src/lib/workflow-template-document-state.test.mjs`: passed, 3/3.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated document requirement editing behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 184/184.
- `npm run build`: passed.
- Autoreview: ready to merge with no Critical or Important findings; minor type-drift suggestion reviewed, and the redundant local type overlay was removed before final verification.

## Step 41 - Workflow Template Action State Boundary

Status: complete.

Plan:
- Extract create-template and publish-template action decisions out of `WorkflowView`.
- Preserve trimming and no-op guards for template name, selected business, and department, plus existing publish-version behavior.
- Keep `onCreateTemplate` side effects in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-template-action-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workflow-template-action-state.ts` with `getWorkflowCreateTemplateActionState` and `getWorkflowPublishTemplateActionState`.
- Rewired `createTemplate` and `publishSelectedTemplate` in `src/app/approval-workspace.tsx` to call the helper and removed direct component imports of `createWorkflowTemplateFromDraft` and `publishWorkflowTemplateVersion`.
- Addressed autoreview's missing coverage note by adding a blank-department no-op assertion.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-template-action-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workflow-template-action-state.test.mjs`: passed, 4/4.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated template create/publish behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 188/188.
- `npm run build`: passed.
- Autoreview: Critical staging issue and Minor missing-department test suggestion were addressed before final verification and commit.

## Step 42 - Workflow Fallback Condition Id State Boundary

Status: complete.

Plan:
- Move fallback condition case id default generation out of `WorkflowView` and into the condition case state helper.
- Preserve explicit fallback id support for tests/callers and existing one-fallback-only behavior.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Extended `src/lib/workflow-condition-case-state.test.mjs`; verified the focused test failed before the helper generated an id.
- Updated `getWorkflowAddFallbackConditionCaseState` in `src/lib/workflow-condition-case-state.ts` to make `fallbackCaseId` optional and generate `case-${Date.now()}-fallback` when omitted.
- Rewired `addFallbackConditionCaseToSelectedBox` in `src/app/approval-workspace.tsx` so the component no longer calls `Date.now()`.
- Applied autoreview's optional `??` polish so explicit caller-supplied ids are preserved.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workflow-condition-case-state.test.mjs` failed because no id was generated when `fallbackCaseId` was omitted.
- `node --experimental-strip-types --test src/lib/workflow-condition-case-state.test.mjs`: passed, 8/8.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated fallback condition editing behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 189/189.
- `npm run build`: passed.
- Autoreview: passed with no Critical, Important, or Minor findings; optional `??` recommendation was applied and reverified before commit.

## Step 43 - Workspace Admin Record State Boundary

Status: complete.

Plan:
- Extract role assignment and business directory record update transitions out of `ApprovalWorkspaceBody`.
- Preserve existing snapshot persistence payloads and keep persistence side effects in the component.
- Match the existing pure helper pattern used by `workspace-template-record-state`.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-admin-record-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workspace-admin-record-state.ts` with `getUpdatedRoleAssignmentRecordState` and `getUpdatedBusinessDirectoryRecordState`.
- Rewired `updateRoleAssignmentRecords` and `updateBusinessDirectoryRecords` in `src/app/approval-workspace.tsx` to call the helper before setting state and building the snapshot.
- Addressed autoreview's Important finding by changing the role assignment test fixture from stale `userEmail`/`userName` keys to the real persisted `email`/`name` shape.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workspace-admin-record-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workspace-admin-record-state.test.mjs`: passed, 2/2.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated admin record editing behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 191/191.
- `npm run build`: passed.
- Autoreview: Important test fixture issue was fixed and the full verification set was rerun before commit.

## Step 44 - Workspace Request Submission State Boundary

Status: complete.

Plan:
- Extract request submission decision and task creation state out of `ApprovalWorkspaceBody`.
- Preserve no-op preconditions, missing required upload message, successful task creation, selected task id, upload clearing, success message, and approval-task-only persistence payload.
- Keep React setters and `persistWorkspaceSnapshot` side effects in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-request-submission-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workspace-request-submission-state.ts` with `getWorkspaceRequestSubmissionState`.
- Rewired `submitParsedRequest` in `src/app/approval-workspace.tsx` to call the helper, apply returned state, and persist the returned task list.
- Removed direct component imports of `createApprovalTaskFromTemplate` and `getMissingRequiredSubmissionDocuments`.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workspace-request-submission-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workspace-request-submission-state.test.mjs`: passed, 3/3.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated request submission behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 194/194.
- `npm run build`: passed.
- Autoreview: passed with no Critical, Important, or Minor findings; procedural staging note was addressed before commit.

## Step 45 - Workspace Task Action State Boundary

Status: complete.

Plan:
- Extract manual queue task action and workflow runner task action transitions out of `ApprovalWorkspaceBody`.
- Preserve missing current-node document preflight, target-email blocking, action input clearing, selected task updates, and approval-task-only persistence payloads.
- Keep React setters and `persistWorkspaceSnapshot` side effects in the component.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-task-action-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workspace-task-action-state.ts` with `getWorkspaceRecordTaskActionState` and `getWorkspaceRunnerTaskActionState`.
- Rewired `recordAction` and `runWorkflowAction` in `src/app/approval-workspace.tsx` to call the helper, apply returned task state, and persist the returned task list.
- Removed direct component imports of `applyTaskAction`, task-action preflight, task-template lookup, and workflow-runner actor selection from the affected action paths.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workspace-task-action-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workspace-task-action-state.test.mjs`: passed, 3/3.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated task action behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 197/197.
- `npm run build`: passed. Webpack emitted a non-fatal cache `ENOENT` warning after the successful route summary.
- Autoreview: passed with no Critical, Important, or Minor findings.

## Step 46 - Workspace File API Boundary

Status: complete.

Plan:
- Extract upload and parse API request construction out of `ApprovalWorkspaceBody`.
- Centralize the parsed workspace file payload type so the page and upload view use the same contract.
- Preserve attachment metadata, upload error messages, parse language hint, and parse API error handling.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-file-api.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workspace-file-api.ts` with `uploadWorkspaceAttachmentFile`, `parseWorkspaceFile`, `defaultParseLanguageHint`, and `ParsedWorkspaceFilePayload`.
- Rewired `parseFile` and `attachTaskDocument` in `src/app/approval-workspace.tsx` to use the helper instead of constructing `FormData` and calling `fetch` inline.
- Updated `src/app/upload-view.tsx` and `src/app/approval-workspace.tsx` to use the shared parsed file payload type.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workspace-file-api.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workspace-file-api.test.mjs`: passed, 5/5.
- `npx next typegen && npx tsc --noEmit`: initially caught a too-loose parse payload type; after centralizing the stricter shared type, passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated upload and parse behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 202/202.
- `npm run build`: passed. Webpack emitted a non-fatal cache `ENOENT` warning after the successful route summary.
- Autoreview: passed with no Critical, Important, or Minor findings.

## Step 47 - Workspace Parse File State Boundary

Status: complete.

Plan:
- Extract parse-file UI state transitions and stored attachment record creation out of `ApprovalWorkspaceBody`.
- Preserve parse start reset behavior, upload attachment appending, parse success state, and existing parse/upload error handling.
- Keep async upload and parse API orchestration in the component for now.
- Verify with red/green helper tests, typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/lib/workspace-parse-file-state.test.mjs`; verified the focused test failed before the helper module existed.
- Added `src/lib/workspace-parse-file-state.ts` with `getWorkspaceParseFileStartState`, `getWorkspaceParseFileStoredAttachmentState`, and `getWorkspaceParseFileSuccessState`.
- Rewired `parseFile` in `src/app/approval-workspace.tsx` to apply returned helper state instead of directly resetting parse state, creating attachment records, and mapping parse payload fields.

Verification:
- Red step: `node --experimental-strip-types --test src/lib/workspace-parse-file-state.test.mjs` failed with missing module before implementation.
- `node --experimental-strip-types --test src/lib/workspace-parse-file-state.test.mjs`: passed, 4/4.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated parse/upload behavior was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 206/206.
- `npm run build`: passed. Webpack emitted a non-fatal cache `ENOENT` warning after the successful route summary.
- Autoreview: passed with no Critical, Important, or Minor findings.

## Step 48 - Workflow View Component Boundary

Status: complete.

Plan:
- Move the workflow editor component out of `src/app/approval-workspace.tsx` into its own app component module.
- Keep the workspace shell responsible for workspace tabs, request upload, queue, tracking, admin, and persistence wiring.
- Keep the workflow editor responsible for canvas, template builder/library, runtime panel, condition details, and workflow-local state.
- Verify with typegen/typecheck, lint, live route smoke, full tests, build, autoreview, and commit.

Implementation notes:
- Added `src/app/workflow-view.tsx` and moved `WorkflowView`, `WorkflowCanvas`, workflow editor tabs, and workflow-editor-only imports into it.
- Replaced the local `WorkflowView` definition in `src/app/approval-workspace.tsx` with an import from `@/app/workflow-view`.
- Trimmed workflow-editor-only imports from `src/app/approval-workspace.tsx`.
- Reduced `src/app/approval-workspace.tsx` from 1,753 lines to 478 lines; `src/app/workflow-view.tsx` is 1,285 lines after the split.
- This was a mechanical component boundary move with no intended behavior change, so no new unit behavior test was added for the move itself.

Verification:
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed after removing stale imports from the shell file.
- Live route smoke before full build: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate. Authenticated workflow editor rendering was not exercised because no test credentials or reusable clean-browser Supabase session cookie were available.
- `npm test -- --runInBand`: passed, 206/206.
- `npm run build`: passed. Webpack emitted a non-fatal cache `ENOENT` warning after the successful route summary.
- Autoreview: passed with no Critical, Important, or Minor findings.

## Step 49 - Durable Admin Soft-Deactivation

Status: complete.

Plan:
- Add an explicit admin deactivation mutation path for businesses, departments, and workflow templates.
- Preserve the existing safeguard that general workspace saves do not infer deletes from missing rows.
- Keep Supabase access least-privilege by using `UPDATE is_active=false`, not table DELETE grants.
- Remove stale DELETE policies from the local baseline and live Supabase project.
- Verify with red/green focused tests, live Supabase policy/grant checks, typegen/typecheck, lint, full tests, build, live route smoke, autoreview, and commit.

Implementation notes:
- Added `deactivateWorkspaceAdminRecord` to the normalized workspace store for business, department, and template soft-deactivation.
- Added `deactivateRemoteWorkspaceAdminRecord` and `PATCH /api/workspace` support for authenticated admin deactivation commands.
- Wired Admin business/department delete and Template Library delete to the dedicated deactivation path.
- Count-checked primary deactivation updates so stale, missing, or RLS-denied targets fail instead of being deleted locally only.
- Blocked admin deletes while workspace sync mode is still `loading` so deletes do not bypass remote deactivation during startup.
- Restored workflow template version numbers from normalized rows so template deactivation targets the correct version.
- Added `supabase/migrations/20260621083108_drop_unused_delete_policies.sql` and removed stale DELETE policies from the baseline schema.
- Applied `drop_unused_delete_policies` to live Supabase project `wlbxrdmpwuupjyarjcxb`.

Verification:
- Red step: focused normalized store tests failed before `deactivateWorkspaceAdminRecord` existed.
- Red step: focused workspace sync tests failed before `deactivateRemoteWorkspaceAdminRecord` existed.
- Red step: restored-template-version test failed before normalized template mapper carried `version_number`.
- Red step: zero-row business, department, and template deactivation tests failed before update-count checks were added.
- Red step: loading-mode admin delete guard tests failed before the sync-mode guard helper was added.
- Live Supabase policy check: no DELETE policies remain for `business_units`, `business_departments`, or `workflow_template_versions`.
- Live Supabase grant check: no DELETE grants remain for `anon` or `authenticated` on those tables.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 218/218.
- `npm run build`: passed.
- Live route smoke: `http://localhost:3000/?tab=workflow` returned `307` to `/login`, matching the unauthenticated auth gate.
- `git diff --check`: passed with CRLF warnings only.
- Autoreview found two Important issues: zero-row Supabase updates could look successful, and admin deletes could bypass remote deactivation while sync mode was `loading`. Both were fixed and covered by regression tests.
- Final status: committed as `bc17f22 feat: add durable admin soft deactivation`.

## Step 50 - Workflow Editor Tab Order

Status: complete.

Plan:
- Put Template Builder before Canvas in the workflow editor tab order.
- Open the workflow editor on Template Builder by default, because template metadata is the first setup step.
- Keep Canvas and Template Library behavior unchanged.
- Verify with a focused tab-state regression test, typegen/typecheck, lint, full tests, build, live route smoke, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-editor-tabs-state.ts` to centralize workflow editor tab order and the default tab.
- Added `src/lib/workflow-editor-tabs-state.test.mjs` to pin Template Builder, Canvas, Template Library order and the Template Builder default.
- Rewired `src/app/workflow-view.tsx` to use the shared tab-state helper instead of local inline tab metadata.

Verification:
- Red step: focused tab-state test failed before `workflow-editor-tabs-state.ts` existed.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-editor-tabs-state.test.mjs`: passed, 2/2.
- `git diff --check`: passed with CRLF warnings only.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 220/220.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- Live route smoke: `http://localhost:3000/?tab=workflow&step17postbuild=1782010244765` returned `307` to `/login`, matching the unauthenticated auth gate.
- Browser MCP visual preview was not completed because the browser tool could not attach to an active in-app tab or create a managed preview tab.
- Autoreview: passed with no actionable findings.

## Step 51 - Canvas Publish Action Placement

Status: complete.

Plan:
- Remove the publish action from the workflow editor tab row.
- Place the publish action at the bottom of the Canvas panel so users finish editing before publishing.
- Shorten the visible button label from `Publish version` to `Publish`.
- Verify with red/green focused tests, typegen/typecheck, lint, full tests, build, live browser preview, autoreview, and commit.

Implementation notes:
- Added `src/lib/workflow-publish-action-state.ts` to centralize the canvas publish action label, title, and placement intent.
- Added `src/lib/workflow-publish-action-state.test.mjs` to pin the button label to `Publish` and the placement to `canvas-footer`.
- Extended `src/lib/workflow-editor-tabs-state.test.mjs` so `Publish` cannot be reintroduced as an editor tab.
- Rewired `src/app/workflow-view.tsx` so the tab row contains only Template Builder, Canvas, and Template Library, while the Publish button renders below the Canvas.

Verification:
- Red step: focused publish-action test failed before `workflow-publish-action-state.ts` existed.
- Red step: focused publish-action test failed when the expected label changed from `Publish version` to `Publish`.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-publish-action-state.test.mjs`: passed, 1/1.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-editor-tabs-state.test.mjs`: passed, 3/3.
- `git diff --check`: passed with CRLF warnings only.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 222/222.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- Live browser preview: passed; tab row showed Template Builder, Canvas, Template Library; Canvas footer showed `Publish`; no `Publish version` button remained; no console errors.
- Autoreview: passed with no actionable findings.

## Step 52 - Template Library Load and Canvas Copy Workflow

Status: complete.

Plan:
- Fix Template Library `Load` so it selects the loaded template and opens the Canvas, not only the builder metadata.
- Add a Canvas control that copies another template's workflow structure into the current template while preserving the current template identity.
- Keep the current template's id, name, business, department, version, and draft/published state when copying from another template.
- Verify with red/green focused tests, typegen/typecheck, lint, full tests, build, live browser preview, autoreview, and commit.

Root cause:
- `loadTemplateIntoBuilder` only applied template name, business, and department to the builder fields. It did not call `setSelectedTemplateId`, so the Canvas continued to render the previously selected workflow.

Implementation notes:
- Extended `getWorkflowTemplateLoadState` to return the loaded template id, Canvas target tab, and canvas-reset intent.
- Added `src/lib/workflow-template-copy-state.ts` for copying graph, documents, fields, languages, document types, and legacy steps from a source template into the current template.
- Added a Canvas `Copy workflow from template` selector and `Copy into canvas` action.
- Rewired Template Library `Load` through the load state so it selects the loaded template, switches to Canvas, and resets transient canvas selection.

Verification:
- Red step: focused load-state tests failed before the helper returned selected template id, Canvas tab, and reset intent.
- Red step: focused copy-state test failed before `workflow-template-copy-state.ts` existed.
- `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/workflow-template-load-state.test.mjs src/lib/workflow-template-copy-state.test.mjs`: passed, 4/4.
- `npx next typegen && npx tsc --noEmit`: passed.
- `npm run lint`: initially caught an unnecessary setState-in-effect for the copy source default; removed the effect and used derived fallback state.
- `npm run lint`: passed.
- `npm test -- --runInBand`: passed, 224/224.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- Live browser preview: passed; Template Library `Load` switched the active workflow editor tab to Canvas, Canvas displayed `Copy workflow from template` and `Copy into canvas`, and no console errors were reported.
- Autoreview: passed with no actionable findings.

## Step 53 - Template Lifecycle and Request Publishing Rules

Status: complete.

Plan:
- Rename Template Library `Load` to `Open in Canvas` and add `Duplicate as New Template`.
- Make published versions immutable; users duplicate them to create editable drafts.
- Add clearer save/publish messages and block publishing when validation has error-level issues.
- Filter new-request upload templates so explicit drafts cannot be used for submissions, while preserving legacy templates without draft metadata.
- Verify normalized Supabase workspace rows preserve template version/draft/published metadata consistently.
- Verify with red/green helper tests, typecheck, lint, full tests, build, live browser preview, review, and commit.

Root cause:
- The template lifecycle did not distinguish library opening, duplicating, editing drafts, publishing immutable versions, and creating requests from stable templates. New request submission also trusted the parent selected template id, so a draft could still be submitted even if the Upload dropdown was intended to show only request-ready templates.

Implementation notes:
- Added duplicate-as-draft state to `src/lib/workflow-template-action-state.ts`, including cloned graph/documents and a new draft id.
- Added publish validation gating through `validateWorkflowTemplate`; publish is blocked for missing first approver and other error-level issues.
- Added a save guard in `src/lib/workflow-template-save-state.ts` so published templates cannot be mutated directly.
- Reworked Template Library buttons to show `Open in Canvas`, `Duplicate as New Template`, and `Delete`.
- Reworked Upload state so explicit drafts are excluded, legacy unflagged templates remain available, and the Upload component synchronizes the displayed published/legacy template id back to workspace state.
- Added request-submission protection so explicit draft templates cannot create approval requests.
- Updated normalized workspace rows to use `template.version` before falling back to task history, keeping row version and template snapshot version aligned.

Verification:
- Red step: lifecycle tests failed before duplicate-as-draft, publish validation, save lock, request filtering, and version persistence were implemented.
- `npm test`: passed, 232/232.
- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- `git diff --check`: passed with CRLF warnings only.
- Live browser preview: passed; Template Library showed `Open in Canvas` and `Duplicate as New Template`, `Open in Canvas` switched to Canvas, Upload showed an available request template instead of `No published templates`, and no browser console errors were reported.
- Review: no actionable findings after checking the lifecycle diff. One persistence mismatch risk was found and fixed by preferring the template snapshot version over task history when normalizing template rows.

## Step 54 - Template Delete Remote-Missing Recovery

Status: complete.

Plan:
- Trace the `PATCH failed: 503` Template Library delete path.
- Preserve the workspace API failure reason so the UI can distinguish a missing remote row from other Supabase failures.
- Allow local template removal when the remote normalized template version is already missing, because the subsequent workspace save can persist the corrected template list.
- Keep other remote deactivation failures blocking.
- Verify with red/green tests, typecheck, lint, build, and browser attempt.

Root cause:
- Template Library delete first soft-deactivated the normalized Supabase template version. If the local template existed but the matching `workflow_template_versions` row did not, the API returned 503 and the client only surfaced `PATCH failed: 503`, then blocked the local delete.

Implementation notes:
- `deactivateRemoteWorkspaceAdminRecord` now includes the API response reason in non-OK failures.
- Added `getAdminRecordDeleteFailureState` to classify a missing template version as already removed remotely and safe to continue locally.
- Rewired the workspace delete path to use the classifier before deciding whether to block local deletion.

Verification:
- Red step: focused tests failed before the failure reason was preserved and before the missing-template classifier existed.
- `npm test -- src/lib/workspace-sync.test.mjs src/lib/workspace-admin-record-state.test.mjs`: passed.
- `npm test`: passed, 235/235.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed with the known non-fatal webpack cache `ENOENT` warning.
- `npm run lint`: passed after an initial environment timeout retry.
- Browser verification was attempted, but the browser connector failed to attach to an active/new tab in this run. Automated tests cover the reported failing path.

## Step 55 - Template Delete RLS Recovery

Status: complete.

Plan:
- Trace the `PATCH failed: 503 - new row violates row-level security policy for table "workflow_template_versions"` delete path.
- Add a narrow client-side recovery for template-version RLS soft-delete failures so Template Library delete can still remove the local template and persist the snapshot backup.
- Add and apply a Supabase migration that lets authenticated template creators update their own `workflow_template_versions` rows, while keeping the existing admin update policy.
- Verify the live Supabase policy, automated tests, typecheck, lint, production build, and browser preview.

Root cause:
- The workspace API correctly uses the signed-in user's Supabase session. The existing `workflow_template_versions` update policy only allowed admins, so a non-admin creator could fail the soft-delete update even though the workspace snapshot backup could still persist the intended local delete.

Implementation notes:
- Extended `getAdminRecordDeleteFailureState` to continue only when a template delete failure mentions both row-level security and `workflow_template_versions`.
- Added `supabase/migrations/20260621143000_allow_template_owner_soft_delete.sql` with an authenticated update grant and a creator-owned update policy for template versions.
- Applied the migration to live Supabase project `wlbxrdmpwuupjyarjcxb`.

Verification:
- Red step: focused admin-record-state test failed before the RLS classifier was added.
- `npm test -- src/lib/workspace-admin-record-state.test.mjs`: passed, 236/236.
- Supabase `pg_policies` verification: live project contains both `admins update workflow template versions` and `template creators update workflow template versions`.
- `npm test`: passed, 236/236.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- Live browser preview: passed; `http://localhost:3000/?tab=workflow` loaded the Workflow page with Template Builder first and no browser console errors.
- Autoreview: passed with no actionable Step 55 findings. Residual legacy-data note: template rows created by another user or with empty `created_by` can still be rejected by RLS, and the client fallback intentionally handles that case through the snapshot backup.

## Step 56 - Template Lifecycle Permissions, Audit, and PRD Update

Status: complete.

Plan:
- Live-test Template Library archive/delete with a temporary workflow.
- Add legacy template ownership repair policies and creator-owned template insert/update permissions.
- Add explicit Template Library status/permission labels for Draft, Published, Archived, Superuser access, Created by me, and Cannot edit.
- Archive templates with actor metadata instead of dropping them from the local library when the actor is known.
- Persist template admin audit events and show them in Admin.
- Keep archived templates out of new request submission while preserving request template snapshots for history.
- Update the PRD with the finalized lifecycle, RLS, audit, and data-model behavior.

Root cause:
- Template lifecycle behavior was partly implicit: published/draft state existed, but ownership, archived state, admin audit visibility, and RLS repair rules were not explicit in the UI or persistence model. A live smoke also showed that archiving an owned template could still surface an RLS fallback because creator-owned inactive rows were not readable under the active-only SELECT policy.

Implementation notes:
- Added template owner/updater/archive metadata and `AdminAuditEvent` types.
- Added Template Library state for status labels, ownership labels, and action availability.
- Threaded active-user metadata into WorkflowView and Template Library.
- Added workspace-level `adminAuditEvents`, persisted through local/Supabase snapshots and rendered in the Admin tab.
- Changed actor-aware template delete to archive locally and emit a `template_archived` audit event; the old remove behavior remains for callers that do not pass an actor.
- Added migrations:
  - `20260621151500_harden_template_lifecycle_permissions.sql`
  - `20260621162000_allow_template_creator_inactive_reads.sql`
- Applied both migrations to live Supabase project `wlbxrdmpwuupjyarjcxb`.
- Updated `PRD/approval-workflow-platform-prd.md` with template lifecycle, permissions, audit, RLS repair, and data-model details.

Verification:
- Red step: focused tests failed before template card permission metadata, admin audit persistence, archive metadata, and migration files existed.
- `npm test -- src/lib/workflow-template-library-state.test.mjs src/lib/workspace-template-record-state.test.mjs src/lib/workspace-persistence.test.mjs src/lib/supabase-template-ownership-policy.test.mjs`: passed after implementation.
- Live Supabase policy checks confirmed creator insert/update, ownerless legacy claim, and creator/admin inactive-read policies.
- Live browser smoke: created and archived a temporary template. The second run after the inactive-read policy showed Archived status, no RLS fallback message, and no browser console errors.
- Live Admin smoke: Template audit panel showed create/archive events for the temporary templates.
- `npm test`: passed, 242/242.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed.
- `npm run build`: passed. Webpack emitted the known non-fatal cache `ENOENT` warning after the successful route summary.
- Autoreview: passed with no actionable Step 56 findings. Residual product note: smoke-test archived templates remain in the current user workspace as intentional audit evidence.

## Step 57 - Template Library Archive Subtab
- Added Template Library / Template Archive subtabs inside the Template Library page area where archived templates were previously mixed with active templates.
- Active library now filters out archived workflow templates; archive shows only archived workflow templates as read-only cards.
- Verified with npm test, lint, TypeScript, production build, and live browser preview at localhost:3000.?tab=workflow.

## Step 58 - Canvas Stability and Node Placement
- Stopped normal canvas edits from remounting the React Flow canvas by making the canvas key depend only on workflow identity and explicit reset.
- Switched the canvas to controlled nodes/edges so drag previews remain live while parent graph changes are synced without resetting pan/zoom.
- Changed new node placement to use the selected box as the anchor, or the rightmost box when no box is selected, with collision nudging for occupied positions.
- Verified with npm test, lint, TypeScript, production build, and live browser add/undo smoke test without viewport reset.

## Step 59 - OpenRouter PDF OCR Parsing
- Connected `pdf-ocr` parsing to OpenRouter instead of returning the previous scaffold message.
- Added OpenRouter PDF file input payloads with the `file-parser` plugin and `mistral-ocr` default engine.
- Passed workflow document extraction fields from the upload client to `/api/parse`, so configured document fields guide OCR extraction when present.
- Verified with parser/file API tests, full test run, TypeScript, lint, production build, and a live `/api/parse` PDF smoke test returning `Invoice total: HKD 8400`.

## Step 60 - Qwen Visual OCR Upload Path
- Added a Qwen visual OCR path for PDFs rendered into page images, using OpenRouter `image_url` inputs instead of the PDF file-parser plugin.
- Added browser-side PDF page rendering with `pdfjs-dist`, bounded to the first few pages by default.
- Added ad hoc upload fields so users can specify what to extract before uploading a PDF, image, Excel, or CSV.
- Updated parser output handling to support field value, confidence, and evidence, while preserving older plain JSON field responses.
- Added confidence and evidence display to the upload extraction draft so users can review low/medium confidence values.
- Added config knobs: `OPENROUTER_VISION_OCR_MODEL=qwen/qwen3-vl-8b-instruct` and `NEXT_PUBLIC_PDF_OCR_MODE=qwen-page-images`.
- Verification: red tests failed for missing parser/upload contracts, then passed after implementation; `npm test` passed 253/253; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning; live browser smoke at `http://localhost:3000/?tab=upload` showed the field editor, Add field interaction, and no console errors.

## Step 61 - Combined Upload Field Selection, Suggestions, and Highlight Extraction
- Added implementation plan `docs/superpowers/plans/2026-06-22-upload-ocr-review-workflows.md`.
- Extended parser output to keep requested extracted fields separate from optional `suggestedFields`.
- Added suggested-field cards in Upload so users can include parser-discovered fields after parsing.
- Added document preview support for rendered PDF pages and uploaded images.
- Added manual highlight extraction: users can drag a rectangle over the preview, name the field, crop the region locally, and send only that crop back through Qwen extraction.
- Added shared preview geometry helpers and upload-state helpers for suggested and highlighted fields.
- Verification: red tests failed for missing parser suggestion, upload-state, and preview helpers; focused tests passed after implementation; `npm test` passed 260/260; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning; live upload-page smoke showed the base field editor and no browser console errors.

## Step 62 - Document Preview Readability Controls
- Added a tested preview image style helper for grayscale, contrast, brightness, and zoom with clamped bounds.
- Added default high-contrast preview controls to the document preview so faint scans are easier to inspect before highlighting fields.
- Changed the preview into a scrollable zoom stage, keeping highlight rectangles aligned with the displayed page.
- Verification: `npm test -- src/lib/document-preview.test.mjs` passed; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning; live upload-page smoke at `http://localhost:3000/?tab=upload` loaded without browser console errors.

## Step 63 - Black Text Preview Enhancement
- Replaced CSS-only readability with a canvas-generated preview enhancement for faint scans where text luminance is nearly the same as the paper background.
- Added a default `Black text` preview mode that turns faint darker-than-background pixels into black while keeping the page background white.
- Added an `Enhanced grey` mode for softer display and kept `Original` mode available for comparison.
- Kept field-highlight extraction pointed at the original uploaded document, so preview enhancement does not alter the file sent to OCR.
- Verification: red test failed for missing `enhancePreviewPixels`; after implementation `npm test -- src/lib/document-preview.test.mjs` passed; `npx tsc --noEmit` passed; `npm run lint` passed; `npm test` passed 264/264; `npm run build` passed with the known non-fatal webpack cache warning.

## Step 64 - Scanner PDF Decoder Assets
- Root cause: the Gleneagles scanner PDF uses JBIG2 image XObjects. PDF.js rendered the page shell but dropped the scanner image content because no browser-accessible `wasmUrl` was configured, producing `JBig2 failed to initialize` warnings and an unreadable preview.
- Added browser-accessible PDF.js runtime assets under `public/pdfjs/` for WASM decoders, CMaps, and standard fonts.
- Configured `renderPdfFileToPageImages` to pass `wasmUrl`, `cMapUrl`, `standardFontDataUrl`, and `useWorkerFetch` into `pdfjs.getDocument`.
- Split PDF rendering defaults so human preview renders up to 25 pages at 3x scale, while OCR remains bounded to 3 pages at 2x scale.
- Filled preview canvases with a white background before rendering to avoid transparent/black compositing artifacts.
- Verification: Poppler rendered `C:\Users\Derrick Pang\Desktop\S-003_IP-08 (Final Account) Signed 20250211 - Gleneagles.pdf` clearly, proving the source file was readable; a temporary browser probe initially reproduced PDF.js `JBig2 failed to initialize` warnings; after adding decoder assets the same probe rendered all 6 pages with no decoder warnings and a readable first-page screenshot, then the generated probe artifacts were removed; `npm test -- src/lib/pdf-page-images.test.mjs src/lib/document-preview.test.mjs` passed; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.

## Step 65 - Multi-Box Highlight Extraction
- Root cause: the document preview only committed `highlightRect` on mouse-up, so no rectangle could be drawn during drag; highlighted extraction also modeled one field as one box, which could not represent one field with multiple value regions.
- Added a tested active-selection helper so the preview draws the in-progress rectangle on every mouse move.
- Added tested upload highlight group helpers for one field name with many value boxes, per-box extraction status, remove-box behavior, and multi-value merge into one editable field value.
- Reworked the Upload preview highlight panel into `Highlight fields`: users can name a field, draw a rectangle, add it as a value box, add more boxes or more fields, and extract all boxes for a field into one multi-line data value.
- Kept the parser API unchanged by sending each value box as a cropped image with the same field definition, then merging returned values on the client.
- Verification: red tests failed for missing highlight group and active-selection helpers; after implementation `npm test -- src/lib/upload-view-state.test.mjs src/lib/document-preview.test.mjs` passed; `npx tsc --noEmit` passed; `npm run lint` passed; unauthenticated browser smoke redirected to `/login` with no console errors; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.

## Step 66 - Two-Step Field Recognition Workflow
- Added implementation plan `docs/superpowers/plans/2026-06-22-field-recognition-workflow.md`.
- Removed the duplicate pre-upload ad hoc field-entry card from Upload so users choose fields inside the document review flow instead of in two places.
- Reworked Upload document review into `Step 1: Suggested fields` for parser-found values and `Step 2: Add / correct fields` for boxed regions or direct manual values.
- Made the box-add action contextual: after a user draws a rectangle, the UI shows `Add box to <field>` for the active field.
- Mirrored the same concept in Workflow Box details by renaming document setup to recognition setup, adding `Step 1: Required template fields`, and changing field creation to `Add template field`.
- Verification: `npm test -- src/lib/upload-view-state.test.mjs src/lib/document-preview.test.mjs src/lib/workflow-document-field-state.test.mjs` passed as part of the full lib test glob, 272/272; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation; headless browser smoke redirected to `/login` with no console errors; visible in-app browser smoke at `http://localhost:3000/?tab=upload` loaded the authenticated Upload page with no console errors.

## Step 67 - Template Recognition and OCR Feedback Loop
- Added implementation plan `docs/superpowers/plans/2026-06-22-template-recognition-and-ocr-hardening.md`.
- Added extraction training examples to the workflow template model and parser prompt so corrected values can guide future OCR.
- Added `TemplateDocumentRecognitionPanel` inside Workflow Box Details for document requirements: sample upload, Step 1 suggested fields, Step 2 boxed/manual field creation, and sample example capture.
- Upload parsing now sends prior workflow examples to `/api/parse`; submitting a corrected extraction draft saves changed values back as template examples.
- Publish now blocks on incomplete guardrail warnings such as required documents without extraction fields, missing condition outcomes/rules, overlapping condition matches, incomplete approval coverage, and unreachable connected boxes.
- Fixed parser strategy detection so PDFs uploaded with a generic MIME type, such as `application/octet-stream`, are still routed to `pdf-ocr` based on the `.pdf` filename.
- Updated `PRD/approval-workflow-platform-prd.md` with template-side recognition, feedback examples, confidence/evidence, Qwen visual OCR, and publish guardrails.
- Verification: red focused tests failed for missing examples, template recognition helpers, publish guardrails, and generic-MIME PDF detection; after implementation `npm test` passed 280/280; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation; visible browser smoke loaded Workflow and Upload with no console errors, and Box Details showed recognition setup for a selected review node; live `/api/parse` smoke on `SKM_C550i26050716420 - Gleneagles.pdf` returned `pdf-ocr`, `Total amount: 500,000.00`, `Document title: STATEMENT OF FINAL ACCOUNT`, high confidence, evidence, and suggested fields.

## Step 68 - Upload Request Autosave
- Added browser-local upload request draft autosave so interrupted request creation can recover selected template, stored attachment references, OCR parse result, edited fields, parsed document id, and multi-box highlight field groups.
- Added `src/lib/upload-request-draft-state.ts` with serialization, validation, status labeling, and clear-state helpers, covered by red-green tests.
- Lifted upload highlight draft state into `approval-workspace.tsx` so boxed fields are included in autosave without persisting raw `File` objects.
- Added an Upload page autosave banner showing `No request draft` or `Autosaved ...`, plus `Clear draft` to discard recoverable work.
- Drafts are removed after successful submission or explicit clear; uploaded files remain in Supabase storage through their saved attachment references.
- Updated `PRD/approval-workflow-platform-prd.md` with the autosave behavior and state boundary.
- Verification: red test failed for missing autosave module; after implementation `npm test` passed 285/285; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation; visible browser smoke at `http://localhost:3000/?tab=upload` showed the autosave status and no console errors.

## Step 69 - Upload Draft Restore Loop Fix
- Root cause: restoring upload highlight groups from an autosaved draft could create a fresh default highlight group, notify the parent draft autosave state, then receive a new restored-highlight prop while the same restore token was still active.
- Added a token guard so Upload restores highlight state only once per autosave restore token.
- Skipped the highlight reset effect on initial mount so reset logic only runs after an explicit draft clear/submit reset token change.
- Autoreview caught a React Strict Mode edge case where a queued restore could be cancelled after the token was marked; moved token marking into the queued restore/reset execution path.
- Added a regression helper test for one-time highlight restore decisions.
- Verification: red focused test failed for the missing restore guard; after implementation `npm test -- src/lib/upload-request-draft-state.test.mjs` passed as part of the full lib glob, 286/286; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.

## Step 70 - Creator-Owned Saved Upload Drafts
- Added explicit saved upload request drafts on top of local autosave, so users can name, save, reload, and delete interrupted request work from the Upload page.
- Added `src/lib/upload-request-draft-state.ts` helpers for creator-owned saved draft construction, serialization, parsing, filtering, upsert, and removal. Client-side saved draft lists are filtered by the active creator email/id.
- Added `src/lib/upload-request-draft-api.ts` and `/api/upload-drafts` for loading, saving, and deleting signed-in users' saved upload drafts. The API stamps the creator from Supabase auth and does not trust client-provided owner identity.
- Added migration `20260623073000_create_upload_request_drafts.sql` with `upload_request_drafts`, RLS enabled, and select/insert/update/delete policies scoped to `owner_user_id = auth.uid()`.
- Strengthened request submission validation so required extracted fields must be present and low-confidence extracted values must be reviewed before task creation.
- Cleaned the Upload extraction review by adding field source labels for AI/OCR, boxed fields, and manual values, plus dismissible parser suggestions.
- Updated `PRD/approval-workflow-platform-prd.md` with saved request drafts, creator-only access, draft API routes, validation behavior, and upload draft RLS.
- Verification: red focused tests failed before the saved-draft helpers/API, RLS migration assertion, submission validation, and source-label helper existed; after implementation `npm test` passed 298/298, `npx tsc --noEmit` passed, `npm run lint` passed, and `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.
- Live browser smoke: authenticated Upload page at `http://localhost:3000/?tab=upload` loaded with the Upload heading and no browser console errors.
- Live Supabase migration status: not applied from this shell. The Supabase CLI is not installed on PATH, no database URL/psql connection is available in `.env`, and the available Supabase connector in this session only exposed Edge Function deployment, not SQL execution.
- Review: local code review found no blocker in the saved draft creator boundary. Existing route response-cookie propagation uses the same pattern as other API routes and was left out of scope for this commit.

## Step 71 - Upload Draft UX and Submission Blocking Pass
- Attempted to apply the live `upload_request_drafts` migration to Supabase project `wlbxrdmpwuupjyarjcxb`; the Supabase MCP returned `token_expired`, and `npx supabase projects list` reported no CLI access token. Live migration and multi-user RLS testing remain blocked until Supabase auth is refreshed.
- Added explicit saved upload draft access helpers showing that only the creator can view/load/delete a saved upload draft; superuser status does not bypass this rule.
- Added work-in-progress summary helpers that distinguish the current autosave from named saved drafts.
- Reworked the Upload draft panel into `Request work in progress`, with a current autosave section and a separate named saved drafts section.
- Added submission message tone classification so missing uploads, missing extracted fields, low-confidence fields, draft-template blocks, and archive blocks render as warnings instead of green success messages.
- Updated `PRD/approval-workflow-platform-prd.md` with the clarified saved-draft UX, creator-only policy, live migration status, and submission blocker styling requirement.
- Verification: `npm test` passed 301/301; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.
- Live browser smoke: authenticated Upload page at `http://localhost:3000/?tab=upload` showed `Request work in progress`, `CURRENT AUTOSAVE`, `NAMED SAVED DRAFTS`, and no browser console errors.

## Step 72 - Live Upload Draft Migration Applied
- Confirmed Supabase CLI authentication can list the `approval-app` project (`wlbxrdmpwuupjyarjcxb`) and linked the repo to that project.
- `npx supabase db push --linked --dry-run` could not be used because old remote migration-history entries are missing from the local migrations directory. No migration-history repair was attempted because that would affect unrelated historical entries.
- Applied `supabase/migrations/20260623073000_create_upload_request_drafts.sql` directly with `npx supabase db query --linked --file ...`.
- Verified the live `public.upload_request_drafts` table exists, RLS is enabled, and `authenticated` has select/insert/update/delete table privileges.
- Verified the four own-row RLS policies exist for select, insert, update, and delete.
- Inserted temporary tagged rows for two existing auth users, simulated one authenticated user's JWT claim, and confirmed only that user's tagged row was visible. Also confirmed the simulated authenticated user can insert its own row. Temporary test rows were removed and cleanup verified with `remaining_test_rows = 0`.
- Git repair note: the prior local commit object `99daaf0...` was corrupt on disk and contained an index (`DIRC`) header instead of a Git object. Repaired by moving the branch ref back to valid parent `a18c8fc...`, rebuilding the index with `git read-tree HEAD`, then preserving the seven-file working-tree diff for recommit.

## Step 73 - Drafts Resume Surface
- Added a first-class `Drafts` workspace tab between Upload and Workflow so users can find interrupted request work outside the Upload form.
- Added `workspace-tabs-state` to centralize supported tab IDs and fallback resolution for `/?tab=...`.
- Added `getUploadDraftResumeItems` so the app can summarize current autosave and named saved drafts with template name, file name, attachment/field counts, and saved timestamp.
- Added `UploadDraftsView`, showing current autosave, named saved drafts, resume actions, delete for named drafts, and an empty state with New request.
- Resuming a named saved draft writes it into the current autosave slot before navigating to Upload, so a route reload still restores the selected work.
- Verification: `npm test` passed 304/304; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed with the known non-fatal webpack cache warning after successful route generation.
- Restarted the stale Next dev server on port 3000 and confirmed `http://localhost:3000/?tab=drafts` returns HTTP 200.

## Step 74 - Drafts Hardening and Attachment Access
- Added a Drafts sidebar badge that counts the current private autosave plus named saved drafts.
- Added explicit access labels to Drafts cards: current autosave is marked private, creator-owned saved drafts are marked `Created by you`, and any non-creator draft is disabled and marked `Creator only`.
- Changed request submit persistence to await the workspace save result and report whether the submitted request was saved to Supabase or only saved locally because Supabase failed.
- Added `scripts/e2e-drafts-smoke.mjs` plus `npm run e2e:drafts`; without credentials it verifies the Drafts auth gate, and with `E2E_EMAIL`/`E2E_PASSWORD` it signs in and checks Upload and Drafts.
- Added migration `20260623061935_allow_request_participant_storage_reads.sql` so submitted approval request participants can read attachment storage objects while owner-only access still protects draft/ad-hoc files.
- `npx supabase db push --linked --dry-run` remains blocked by older remote migration-history entries missing from the local migrations directory. Applied this narrow storage policy directly with `npx supabase db query --linked --file ...`.
- Verified the live storage policy exists in `pg_policies` as `approval document owners and request participants read` on `storage.objects`.
- Supabase advisors completed with existing warnings for leaked-password protection and multiple permissive `workflow_template_versions` policies; no new storage-policy blocker was reported.
- Verification: focused tests passed 30/30; full `node --test --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --experimental-strip-types src/lib/*.test.mjs` passed 308/308; `npx tsc --noEmit` passed; `npm run lint` passed; `npm run build` passed; unauthenticated live route smoke for `http://localhost:3000/?tab=drafts` returned `307 /login`; `npm run e2e:drafts` passed the Drafts auth-gate smoke.
- Local autoreview: no blocker found. Residual gap: authenticated Drafts E2E was not run because no test credentials were provided to the script environment.

## Step 75 - Supabase Migration History Cleanup
- Repaired the missing local Git index with `git read-tree HEAD` after Git reported every file as deleted/untracked; no working files were overwritten.
- Audited `npx supabase migration list --linked`; local files were missing for older remote history entries, and six local migrations were absent from remote history.
- Preserved the old remote history locally by copying the three root SQL files into `supabase/migrations` and adding comment-only placeholder migrations for older remote-only versions whose original SQL is no longer in this repository snapshot.
- Verified the six local-only migrations were already reflected in the live database through policy/table checks, then marked them as applied with `npx supabase migration repair --linked --status applied`.
- `npx supabase db push --linked --dry-run` now reports `Remote database is up to date.`
- `npx supabase migration list --linked` now shows every local version matched to the same remote version.
- `npx supabase db advisors --linked --output json` still reports only the existing leaked-password-protection warning and multiple permissive `workflow_template_versions` policy warnings.
- Note: `supabase db dump --linked` could not create a schema dump because Docker Desktop is unavailable on this machine; the zero-byte failed dump artifact was removed.

## Step 76 - Autosave and Supabase Policy Cleanup
- Added `draft_kind` to `upload_request_drafts` so automatic current autosaves are separated from named saved drafts while preserving creator-only RLS.
- Added debounced Supabase current-request autosave from the Upload tab. Current autosave remains private to the creator, restores only when newer than the browser-local copy, and is deleted when the request draft is cleared or submitted.
- Simplified Upload extraction controls with a method selector for Suggested fields, Box from preview, and Manual values so all field-entry methods are not shown at once.
- Consolidated `workflow_template_versions` policies into one SELECT, one INSERT, and one UPDATE policy while preserving active reads, creator/admin writes, and ownerless legacy repair.
- Applied live migrations `20260623113043_consolidate_workflow_template_version_policies.sql` and `20260623113319_add_upload_request_draft_kind.sql` with `npx supabase db push --linked`.
- Verified `npx supabase migration list --linked` shows both new migrations on local and remote. Verified `upload_request_drafts.draft_kind` exists live with default `named`.
- Verified live `workflow_template_versions` policies are now exactly: one INSERT policy, one SELECT policy, and one UPDATE policy. `supabase db advisors` could not complete because the CLI temp role hit Supabase auth failures and requested `SUPABASE_DB_PASSWORD`.
- Updated `PRD/approval-workflow-platform-prd.md` with remote current autosave, consolidated template RLS, field-recognition mode selector, and the Supabase leaked-password-protection setup note.
