# Approval Workflow Platform PRD

Last updated: 2026-06-21
Document owner: Product / Workflow Platform
Status: Living PRD for the current prototype and next production build
Repository: Approval Workflow Next.js application

## 1. Product Summary

The Approval Workflow Platform is a web application for creating, submitting, routing, approving, rejecting, amending, tracking, and auditing business approval requests. It is designed for document-heavy workflows where different businesses and departments need configurable routing, document extraction, conditional branching, escalation, and transparent status visibility for all involved parties.

The current product is a Next.js application with Supabase-backed authentication, storage, row-level security, workspace persistence, and a local-first UI. It includes a workflow canvas, template builder, queue, tracking view, upload/request creation flow, admin directory management, audit trail, notifications, document attachment configuration, and rule-based routing.

This PRD documents both current implemented prototype behavior and target production behavior. Current behavior reflects what is represented in the codebase. Target behavior describes what must be hardened before a real pilot or production rollout.

## 2. Problem Statement

Business approvals often involve multiple document types, several reviewers or approvers, conditional paths, manual reassignment, escalation, and follow-up from the request originator. Without a structured workflow system:

- Users cannot easily see whether a task is waiting for them, another approver, the originator, or escalation.
- Approvers lose visibility after they approve a request and cannot see whether a later approver rejected it.
- Originators are not clearly responsible for rejected requests and may not know whether to amend, resubmit, or cancel.
- Workflow templates are hard to standardize across businesses and departments.
- Required supporting documents may differ by step, not only at submission.
- Approval conditions are difficult to express when multiple upstream approvals and extracted numeric values are involved.
- Audit history is often incomplete or spread across email/chat.

## 3. Goals

1. Allow superusers to create and maintain approval workflow templates by business and department.
2. Allow templates to be built visually with boxes and connections, rather than only form-based sequential steps.
3. Allow each workflow box to define its own required or optional document uploads.
4. Allow users to submit requests against a template and upload the required documents.
5. Extract configured fields from uploaded documents where possible.
6. Route requests to the correct person by name and email.
7. Support approval, approval with comment, rejection, rejection with comment, reassignment, delegation, amendment/resubmission, and cancellation.
8. Keep all performed tasks visible through tracking/history so every participant can see current status.
9. Allow rejected requests to return to the originator for amendment/resubmission or cancellation.
10. Support condition nodes that evaluate upstream approval decisions and parsed numeric values.
11. Support for-information branches that notify participants without blocking the main approval path.
12. Support automatic return/reject branches.
13. Maintain an audit trail for every task.
14. Persist workflow templates, requests, events, attachments, and workspace state in Supabase.
15. Keep the UI usable on desktop and mobile.
16. Maintain strong page-load performance, with production HTTP response medians under 50 ms for every primary route.

## 4. Non-Goals

1. Full enterprise identity lifecycle management beyond Supabase Auth and profile records.
2. Full BPMN compliance. The canvas borrows workflow concepts but is not intended to implement every BPMN primitive.
3. Rich document OCR for PDFs, Excel, and CSV beyond the current parser strategy interfaces.
4. Native email delivery and external notification delivery in the current local prototype.
5. A full reporting/BI module.
6. Multi-tenant billing, licensing, or subscription management.
7. Offline multi-device conflict resolution beyond local-first state and Supabase persistence.

## 4.1 Current Implementation Snapshot

Current implemented areas:

- Next.js App Router application with authenticated app shell and login route.
- Collapsible side navigation with Queue, Tracking, Upload, Workflow, and Admin tabs.
- Workflow page with Canvas, Template Builder, and Template Library top tabs.
- React Flow-based workflow canvas with start, approval, review, condition, for-information, return/reject, and end boxes.
- Box Details panel for editing node type, label, due hours, assignee, escalation, document requirements, condition cases, and branch details.
- Per-box document requirements, including document format, document type, required flag, and extraction fields.
- Condition cases with numbered display, optional nickname, approval-count rules, specific-reviewer rules, numeric rules, AND/OR joining, fallback route, and multiple outcome boxes.
- Canvas undo/redo actions, including Ctrl+Z/Ctrl+Y behavior and Delete-key deletion for selected boxes/branches.
- Queue actions for approve, approve with comment, reject, reject with comment, reassign, delegate, amend/resubmit, and cancel.
- Tracking view for originators, approvers, reviewers, FYI recipients, and participants.
- Audit trail creation for submitted, assigned, approved, rejected, reassigned, delegated, escalated, resubmitted, and cancelled events.
- Local-first workspace persistence with browser storage and remote Supabase workspace synchronization.
- Supabase schema and API routes for workspace snapshots, normalized data, auth, attachment upload, and parse/upload flows.
- Seed business and department directory with admin add/edit/delete controls. Add/edit persists through the normalized workspace save path; delete uses a dedicated admin soft-deactivation API that sets `is_active=false`.
- Template lifecycle metadata for Draft, Published, and Archived states, including creator/updater/archive metadata and visible Template Library permission labels.
- Template admin audit events for create, publish, duplicate, update, and archive actions, shown in the Admin tab and persisted in the workspace snapshot.
- Supabase RLS policies that allow authenticated template creators to insert/update their own template versions and claim ownerless legacy template rows during normalized save repair.
- Production performance optimizations for server response time and deferred workspace loading.

Current areas that remain incomplete or need hardening:

- The Supabase v2 baseline and grant-hardening migrations have been verified against the live `approval-app` Supabase project.
- Storage access policy currently centers on object ownership; participant-based shared attachment access needs stronger production policy design.
- Workflow publishing has a validation gate for blocking graph errors; additional business-rule validation may still be added before pilot.
- Condition coverage warnings exist, but the condition editor still needs more plain-language guidance and test coverage for complex overlapping rule sets.
- End-to-end tests are still needed for full request lifecycles.
- External delivery channels such as email or Teams are not yet implemented.

## 4.2 Current Architecture Snapshot

The current codebase has been refactored into clearer UI, state, workflow, persistence, and API boundaries. The main workspace shell is now responsible for application-level tabs, local/remote workspace state wiring, request upload orchestration, queue/tracking/admin rendering, and persistence calls. The workflow editor is isolated in its own component module.

Current front-end component boundaries:

- `src/app/approval-workspace.tsx`: authenticated workspace shell, active tab routing, queue/tracking/upload/admin orchestration, request submission, task action orchestration, parse/upload orchestration, and workspace persistence wiring.
- `src/app/workflow-view.tsx`: workflow canvas, template builder/library tabs, runtime task preview, condition details, box document configuration, workflow undo/redo, and workflow-local UI state.
- `src/app/workspace-shell.tsx`: app frame, collapsible navigation, tab state, notifications, and sync status presentation.
- `src/app/task-views.tsx`: queue, tracking, user directory datalist, and task-facing presentation.
- `src/app/upload-view.tsx`: request upload, document selection, parse result review, and submission UI.
- `src/app/admin-view.tsx`: business, department, user directory, role assignment, and admin notification UI.

Current pure state and domain boundaries:

- `src/lib/approval-state.ts`: approval action domain transitions and audit event creation.
- `src/lib/request-builder.ts`: approval task creation from templates and document requirement validation.
- `src/lib/workflow-graph.ts`: graph creation, routing, validation, condition routing, FYI branches, return/reject handling, and simulation.
- `src/lib/workspace-persistence.ts`: serialized workspace snapshot shape and parsing.
- `src/lib/database-normalizer.ts` and related database helpers: normalized Supabase row conversion and restore behavior.
- `src/lib/workspace-template-record-state.ts`: create/update/delete template record state.
- `src/lib/workspace-admin-record-state.ts`: business directory and role assignment record state.
- `src/lib/workspace-request-submission-state.ts`: submit-request decision state and successful task creation state.
- `src/lib/workspace-task-action-state.ts`: manual queue action state and workflow-runner action state.
- `src/lib/workspace-file-api.ts`: upload and parse API client boundary plus parsed file payload type.
- `src/lib/workspace-parse-file-state.ts`: parse-file UI reset, stored attachment creation, and parse success mapping.

Latest refactor completion state as of 2026-06-21:

- `approval-workspace.tsx` was reduced from 1,753 lines to 478 lines by moving the workflow editor to `workflow-view.tsx`.
- The workflow editor is still large at about 1,285 lines and should be split further when the next feature work touches canvas details, condition details, or document configuration.
- Refactor progress is tracked in `tmp/refactor-Approval-workflow.md` and mirrored to `C:\tmp\refactor-Approval-workflow.md`.
- The latest refactor commits are:
  - `a548cef refactor: split workflow view component`
  - `858df1c refactor: extract workspace parse file state`
  - `fd3550f refactor: extract workspace file api client`
  - `1578969 refactor: extract workspace task action state`
  - `1fd5f48 refactor: extract workspace request submission state`
  - `4b105d1 refactor: extract workspace admin record state`

Live Supabase verification as of 2026-06-21:

- Project `wlbxrdmpwuupjyarjcxb` / `approval-app` is active and healthy.
- Migration history includes `20260620002111 approval_workflow_v2_baseline_and_workspace_snapshots`, `20260621075424 harden_data_api_table_grants`, `20260621080230 ensure_profiles_rls_enabled_for_grants`, `20260621080644 tighten_data_api_grants_to_current_app_usage`, and `20260621083108 drop_unused_delete_policies`.
- Expected public tables exist: `business_units`, `business_departments`, `profiles`, `workflow_template_versions`, `approval_requests`, `approval_request_events`, `approval_request_attachments`, and `workspace_snapshots`.
- RLS is enabled on the expected public tables.
- Storage bucket `approval-documents` exists and is private.
- `anon` has no grants on the approval workflow public tables.
- `authenticated` grants are limited to current durable app operations and are backed by RLS policies: SELECT/INSERT/UPDATE for editable app tables, SELECT for `profiles`, and no DELETE grants.
- Business, department, and workflow-template delete actions are implemented as scoped admin soft deactivation through `PATCH /api/workspace`; live DELETE policies and DELETE grants for those tables have been removed. The mutation path uses exact update counts and rejects zero-row updates so RLS-denied or stale targets do not disappear locally while remaining active remotely. Admin deletes are blocked while workspace sync mode is still `loading`.

Current verification baseline:

- `npx next typegen && npx tsc --noEmit`: passing.
- `npm run lint`: passing.
- `npm test -- --runInBand`: passing, 218/218 tests, including submit -> approve -> reject -> amend/resubmit -> complete lifecycle coverage, admin soft-deactivation coverage, zero-row deactivation rejection coverage, and loading-state delete blocking.
- `npm run build`: passing.
- Live unauthenticated route smoke for `http://localhost:3000/?tab=workflow`: returns `307` to `/login`, which is expected when no authenticated Supabase session is available.
- Build currently emits a non-fatal webpack cache `ENOENT` warning after successful route generation; this should be monitored but is not blocking the build.

## 5. Personas

### 5.1 Originator

Creates a request, uploads documents, reviews extracted fields, submits the request, tracks status, amends a returned request, resubmits, or cancels.

Needs:

- Know which documents are required before submission.
- See extracted values and correct them.
- Know exactly where the request is waiting.
- Receive returned/rejected requests with clear next actions.
- Resubmit or cancel responsibly.

### 5.2 Approver

Receives assigned approval tasks and performs approve, approve with comment, reject, reject with comment, reassign, or delegate.

Needs:

- See extracted draft fields and attached documents.
- Add comments when approving or rejecting.
- Send the task to another person by email when reassigning or delegating.
- Continue tracking a task after action.
- See when a later approver rejects a request previously approved by them.

### 5.3 Reviewer

Reviews content, documents, or draft information before approval.

Needs:

- Receive review tasks routed from the canvas.
- Attach or request additional documents at the review stage.
- Approve/reject review outcomes where configured.

### 5.4 For-Information Recipient

Receives non-blocking notifications or visibility on a request.

Needs:

- Be included in participants and notifications.
- See the task status without being required to act.

### 5.5 Superuser/Admin

Maintains businesses, departments, users, roles, and workflow templates.

Needs:

- Add, edit, and delete businesses.
- Add, edit, and delete departments.
- Manage workflow templates by business and department.
- Configure canvas boxes, connections, document requirements, conditions, routing, and escalation.
- Publish versioned templates.
- Check workflow logic for missing or contradictory conditions.

## 6. Current Primary Navigation

The application contains these main tabs:

- Queue: tasks currently actionable by the signed-in user.
- Tracking: tasks visible to the user as originator, current actor, previous actor, participant, or FYI recipient.
- Upload: request submission flow, document upload, parsing, extracted draft review, and task creation.
- Workflow: canvas builder, template builder, and template library.
- Admin: business directory, department management, inferred user directory, role assignment, and notifications.

The side navigation is collapsible to provide more canvas space on desktop. The workflow page also has top-level tabs for Canvas, Template Builder, and Template Library.

## 6.1 Screen-Level Product Requirements

### Queue Tab

Purpose: show work that requires the active user's action.

Required content:

- Request title, workflow name, department, amount/value label, status, current step, due label, requester, and latest action.
- Reassigned, delegated, returned, escalated, overdue, approved, and cancelled labels where applicable.
- Extracted draft fields and attachment context.
- Action comment box.
- Target email input for reassign and delegate.
- Required current-node document upload controls when the active workflow box requires documents at that stage.
- Action buttons that wrap cleanly on mobile.

### Tracking Tab

Purpose: show current state and history for all requests visible to the active user.

Required content:

- Task list with status and participant role.
- Current owner and current workflow step.
- Workflow path summary with completed, current, pending, FYI, returned, and cancelled states.
- Audit trail with actor, timestamp, action, detail, and target email.
- Attachments and extracted values.

### Upload Tab

Purpose: allow an originator to create a request from a published workflow template.

Required content:

- Template selector.
- Business and department context.
- Required and optional starting document list.
- File upload controls per required document.
- Parser feedback and extracted field review.
- Editable extracted field values before submission.
- Missing-document validation before task creation.

### Workflow Tab

Purpose: allow superusers to define and test workflow templates.

Required content:

- Full-width canvas.
- Toolbar for adding approval, review, condition, FYI, return/reject, and end boxes.
- Branch creation controls and visual connections.
- Runtime task preview selector.
- Template Builder for metadata only: name, business, department, create/update/publish.
- Template Library for load, publish, delete, and version visibility.
- Validation panel with errors and warnings.
- Box Details drawer/panel with context-sensitive editing.

### Admin Tab

Purpose: maintain organization setup and user-role context.

Required content:

- Business create, rename, delete.
- Department create, rename, delete within selected business.
- User directory inferred from tasks/templates and role assignments.
- Role assignment editing by name, email, role, business, and department.
- Notification summary.

## 7. Business and Department Directory

### 7.1 Seed Businesses

The product seeds the following businesses:

1. Asia Allied Infrastructure
2. AMAIN
3. Chun Wo Bus
4. Hong Kong Cyclotron
5. Kwan Lee
6. Manbond
7. Mattex
8. City Service Group
9. Chun Wo Property
10. Vision Foundations
11. Allalign
12. HyPath
13. See Change Education
14. Chun Wo Construction

### 7.2 Seed Departments

Asia Allied Infrastructure departments:

1. Administration
2. Company Secretary
3. Contracts & Legal
4. Corporate Communications
5. Finance
6. Human Resources
7. Information & Technology
8. Internal Control & Process

Chun Wo Construction departments:

1. Construction Finance
2. BIM
3. Claims & Dispute Resolution
4. Commercial
5. Compliance
6. Human Resources
7. Technical
8. Maintenance
9. Tendering

### 7.3 Directory Requirements

- Superusers can add, rename, and delete businesses.
- Superusers can add, rename, and delete departments within a business.
- Workflow templates must be assigned to a business and department.
- Role assignments should support business and department context.

## 8. Workflow Template Builder

### 8.1 Template Metadata

Each template includes:

- Template name.
- Business.
- Department.
- Version.
- Draft/published state.
- Publish timestamp.
- Source template ID when versioned from another template.
- Supported languages.
- Workflow graph.
- Document requirements.
- Legacy sequential steps for compatibility.

Current design principle: the Template Builder should only own template metadata. Workflow structure, approval/review steps, condition logic, FYI paths, return/reject behavior, and document requirements should be configured from the canvas and Box Details.

### 8.2 Document Format

Document format is a controlled dropdown, not free text.

Allowed formats:

1. Text file
2. PDF
3. Image
4. Excel/CSV

### 8.3 Document Type

Document type is a user-defined business label for each uploaded or required document, for example:

- Invoice
- Doctor slip
- Receipt
- Contract
- Delivery note
- Supporting schedule

Document type is distinct from document format.

### 8.4 Per-Box Document Requirements

Documents are configured inside Box Details, not globally in the Template Builder. This is required because additional documents may be needed in the middle of a workflow.

For each workflow box, users can configure:

- Zero or more document requirements.
- Document type.
- Document format.
- Required or optional flag.
- One or more fields to extract from that document.
- Field label.
- Field data type.
- Field source.
- Extraction instructions.

### 8.5 Field Extraction Requirements

Each document can have multiple fields to extract.

Supported field types:

- Text
- Number
- Date
- Currency
- Table

Supported extraction sources:

- AI
- OCR
- Excel
- Manual

Numeric and currency fields are used by condition nodes for routing logic.

## 9. Visual Workflow Canvas

### 9.1 Purpose

The canvas is the primary way to define workflow routing. Users add boxes, connect them, and configure behavior by clicking each box or connection.

### 9.2 Canvas Requirements

- Canvas should use the full available screen width.
- Side navigation should be collapsible.
- Boxes should move in real time while dragging.
- Canvas should support pan by click-and-drag.
- Canvas should support zoom in/out with mouse wheel.
- Delete key should delete selected boxes or links.
- Delete button should remain available in the Box Details panel.
- Undo button and Ctrl+Z should undo recent canvas actions, including accidental deletion.
- Redo support should be available for undone actions.
- Canvas should avoid flicker, black frames, or canvas relocation during fast drag.
- Workflow boxes and links should be selectable.
- Box Details should show context-sensitive controls based on box type.
- Tooltips should explain functions in Box Details.

### 9.2.1 Canvas Interaction Model

Users should be able to build a workflow without understanding implementation terms.

Required interactions:

- Add box from toolbar.
- Drag box and see real-time position updates.
- Click a box to open Box Details.
- Click a branch to edit branch label, branch type, and rule.
- Click "Connect from this box", then click a target box to create a branch.
- Select a condition case, then click outcome boxes to assign them.
- Press Delete to remove a selected box or branch.
- Press Ctrl+Z to undo the most recent workflow edit.
- Press Ctrl+Y or Ctrl+Shift+Z to redo an undone workflow edit.
- Use mouse wheel to zoom.
- Drag empty canvas space to pan.
- Reset canvas view from toolbar.

Constraints:

- Start node should not be deleted in normal editing.
- Deleting a node should remove connected branches.
- Undo must restore accidental deletion of boxes and branches.
- Branch labels should remain readable at normal zoom.
- Canvas should not flicker, black out, or jump during fast drag.

### 9.3 Node Types

Supported box types:

- Start
- Approval
- Review
- For Information
- Condition
- Return/Reject
- End

### 9.4 Edge/Branch Types

Supported connection types:

- Main path
- Approved
- Rejected
- Condition
- For Information

Branch behavior:

- Main, approved, rejected, and condition paths can route the active task.
- For Information paths notify/include recipients without blocking the main task path.
- Return/Reject paths return a request to the originator for amendment/resubmission or cancellation.

## 10. Box Details

### 10.1 Common Box Fields

Each box can include:

- Box type.
- Box name/label.
- Due hours.
- Blocking step flag.
- Connect from this box action.
- Delete action.

### 10.2 Approval and Review Box Fields

Approval and review boxes can include:

- Assignee name.
- Assignee email.
- Due hours.
- Escalation name.
- Escalation email.
- Blocking flag.
- Required/optional document requirements.
- Fields to extract from documents attached to the box.

### 10.3 For Information Box Fields

For Information boxes can include:

- Recipient name.
- Recipient email.
- Acknowledgement required flag if needed in future.
- Non-blocking behavior by default.

### 10.4 Condition Box Fields

Condition boxes must recognize context every time they are opened:

1. Upstream connected approval/review boxes.
2. Extracted numeric values available from upstream documents.
3. Downstream boxes connected as possible outcomes.

Condition boxes allow multiple condition cases. Each case has:

- System-generated display number: Condition 1, Condition 2, etc.
- Optional nickname.
- Approval rule.
- Optional numeric rule.
- Join mode when both approval and numeric rules are present.
- Outcome boxes.
- Fallback/all-other-conditions flag.

Condition names should remain numbered so users understand how many cases exist. Users may add an optional nickname, shown as "Condition N - Nickname".

The condition editor should not expose "count case" as a top-level user concept. Approval-count configuration belongs inside each condition case.

### 10.5 Approval Rule Options

A condition can evaluate upstream approval decisions.

Supported examples:

- At least 1 out of 2 upstream boxes approved.
- At least 2 out of 3 upstream boxes approved.
- Exactly 1 upstream box approved.
- All 3 upstream boxes approved.
- Specific reviewers must approve, for example Review 1 and Review 3 approved.

Approval count rules belong inside each condition case, not as a separate top-level "count case" concept.

### 10.6 Numeric Rule Options

Conditions can evaluate parsed numeric values.

Supported operators:

- Greater than
- Greater than or equal to
- Equal
- Less than
- Less than or equal to

Only parsed numeric/currency fields should appear in numeric condition selectors.

### 10.7 Outcome Mapping

Each condition case can map to one or more outcome boxes.

Outcome boxes may include:

- Review boxes.
- Approval boxes.
- For Information boxes.
- Return/Reject boxes.
- End boxes.

When multiple outcome boxes are selected, For Information boxes are notified while the first blocking action box continues the active route.

### 10.8 Fallback Case

Users can define an "All other conditions" fallback case.

Fallback is required when explicit condition cases do not cover every possible upstream approval count or numeric path.

### 10.9 Plain-Language Condition Examples

The UI should support examples such as:

- Condition 1 - Low amount: at least 1 of Review 1, Review 2, Review 3 approved AND invoice amount <= 3000, then route to End.
- Condition 2 - Manager review: Review 1 and Review 3 approved AND invoice amount > 3000, then route to Approval 1 and FYI Finance.
- Condition 3 - CFO review: all 3 upstream reviews approved AND invoice amount >= 50000, then route to CFO Approval.
- All other conditions: route to Return/Reject.

The editor should display a readable summary under each condition case so users can confirm the logic without reading raw fields.

## 11. Condition Logic Validation

The system should warn users when workflow logic may be incomplete or contradictory.

Validation checks include:

- Condition box has no configured cases.
- Condition case has no approval rule or numeric rule.
- Condition case has no outcome boxes.
- Numeric condition references a field that is not extracted upstream.
- Two condition cases can both match the same request.
- Approval count coverage is incomplete, for example 0, 1, 2, or 3 approvals could occur but not all are routed.
- No fallback case exists for unspecified outcomes.
- Branch points to a missing box.
- Branch starts from a missing box.
- Box is disconnected.
- Box is connected but unreachable from Start.
- First approver cannot be found from Start.
- Required document has no extraction fields.
- Approval/review box is missing assignee email.

Warnings should be visible but not always blocking. Errors should prevent publishing or submission where they would make routing impossible.

## 12. Request Submission Flow

### 12.1 Template Selection

Originator selects a workflow template from the Upload page.

The system shows:

- Template business.
- Department.
- Required starting documents.
- Optional documents.
- Fields to extract.

### 12.2 Document Upload

Originator uploads required documents for the initial route.

The system checks:

- Required documents for the starting approval/review route.
- Document format compatibility.
- Missing required documents.

### 12.3 Parsing and Extraction

The system chooses a parser strategy:

- PDF -> PDF/OCR strategy.
- Excel/CSV -> Excel table strategy.
- Image -> AI image strategy.
- Text -> manual/text strategy.

Current image extraction supports OpenAI or OpenRouter based on environment configuration.

Extraction prompt requirements:

- Return JSON only.
- Use configured field labels.
- Do not invent uncertain values.
- Support language hints.

### 12.4 Extracted Draft Review

Originator can review extracted fields before submission.

The system should show:

- Extracted field values.
- Confidence or notes where available.
- Editable corrections.
- Parse notes/errors.

### 12.5 Task Creation

On submission, the system creates an ApprovalTask from the selected template.

Created task includes:

- Task ID.
- Title.
- Workflow/template snapshot.
- Requester name/email.
- Department.
- Pending status.
- Due date/time.
- Current owner.
- Current node.
- Pending node IDs and owners.
- Completed start node.
- FYI notified nodes.
- Extracted fields.
- Attachments.
- Participants.
- Audit trail events for submitted and assigned.

### 12.6 Mid-Workflow Document Upload

Approval and review boxes can require additional documents after submission.

Behavior:

- If the current workflow box requires documents, the Queue action panel must show upload controls before action buttons.
- Required current-node documents must be uploaded before approve/reject actions are enabled.
- Optional current-node documents may be uploaded without blocking action.
- Uploaded documents must be attached to the task with document ID, document type, format, workflow node ID, uploader, timestamp, storage path, and file name.
- Extracted fields from mid-workflow uploads should become available to later condition nodes when numeric/currency fields are configured.

## 13. Queue and Tracking

### 13.1 Queue

Queue shows tasks actionable by the signed-in user.

A task is actionable when:

- Current owner equals the user email, or
- Pending owners include the user email, and
- Task is not approved or cancelled.

Queue actions:

- Approve.
- Approve with comment.
- Reject.
- Reject with comment.
- Reassign.
- Delegate.
- Amend and resubmit, when originator owns a returned task.
- Cancel, when originator owns a returned task.

After action:

- Task status and ownership update.
- Task remains visible in Tracking for participants.
- Reassigned/delegated tasks keep an active status and show the appropriate label.
- Audit event is appended.

### 13.2 Tracking

Tracking shows tasks visible to a participant.

Participants include:

- Originator.
- Current actor.
- Previous actors.
- Reassigned/delegated users.
- Escalation users.
- FYI users.
- Other participants added through workflow routing.

Tracking should allow participants to see:

- Current state.
- Current owner.
- Current workflow box.
- Last action.
- Audit trail.
- Attachments.
- Extracted values.
- Whether they have already acted.
- Whether a later approver rejected a request after their approval.

## 14. Action Behavior

### 14.1 Approve

Approve records the current node as approved and routes to the next actionable node.

If multiple parallel approvals are pending:

- The approving actor's node is completed.
- Remaining pending actors stay active.
- The task waits until a condition or routing rule can continue.

If no next actionable node exists:

- Task is marked approved.
- Current owner is cleared.
- Pending nodes/owners are cleared.

### 14.2 Approve With Comment

Same as approve, with comment appended to audit detail.

### 14.3 Reject

Reject records the current node as rejected.

If a rejected branch exists:

- The system follows that branch.
- If it reaches Return/Reject, the task is returned to the originator.
- If it reaches another approval/review box, the task is assigned there.

If no rejected branch exists:

- The task is returned to the originator.
- Status becomes returned.
- Current step becomes "Originator action required".

### 14.4 Reject With Comment

Same as reject, with comment appended to audit detail.

### 14.5 Reassign

Reassign requires target email.

Behavior:

- Current owner becomes target email.
- Pending owner is replaced.
- Status becomes reassigned.
- Participants include target email.
- Audit event is appended.

### 14.6 Delegate

Delegate requires target email.

Behavior:

- Current owner becomes target email.
- Pending owner is replaced.
- Status becomes delegated.
- Participants include delegate email.
- Audit event is appended.

### 14.7 Amend and Resubmit

Originator can amend and resubmit a returned request.

Behavior:

- Task restarts from the template start route.
- Node decisions are cleared.
- Pending owner becomes the first routed approver/reviewer.
- Audit event records resubmission.

### 14.8 Cancel

Originator can cancel a returned request.

Behavior:

- Status becomes cancelled.
- Current owner is cleared.
- Current step becomes cancelled.
- Audit event records cancellation.

## 15. Escalation

Each approval/review box can define:

- Due hours.
- Escalation name.
- Escalation email.

If a task passes due time:

- If escalation email exists and current owner is not already escalation email, task is assigned to escalation email.
- Status becomes escalated.
- Pending owner is replaced.
- Audit event is appended.
- Escalation user is added to participants.

If no escalation email exists:

- Task becomes overdue.

## 16. Audit Trail

Every task keeps an immutable-style audit trail in chronological order.

Audit events include:

- Submitted.
- Assigned.
- Approved.
- Rejected.
- Reassigned.
- Delegated.
- Escalated.
- Amended.
- Resubmitted.
- Cancelled.

Each audit event includes:

- Event ID.
- Action.
- Actor name.
- Actor email.
- Timestamp.
- Detail.
- Optional target email.

Audit trail must be visible to originator, approvers, reviewers, FYI participants, escalation users, and admins who are allowed to view the request.

## 17. Notifications

The current product generates in-app notification objects.

Notification types:

- Action required.
- Originator update.
- FYI.
- Escalation.

Notifications should be generated for:

- Current owner.
- Originator.
- Participants/FYI users.
- Escalated/overdue tasks.

Future delivery channels may include email, Teams, or push notifications.

## 18. Template Versioning

Templates can be published as immutable versions.

Publishing behavior:

- Increment version number.
- Mark template as not draft.
- Set published timestamp.
- Preserve source template ID.
- New requests store a template snapshot so future template edits do not change historical request routing.

Template lifecycle states:

- Draft: editable by the creator or a superuser.
- Published: immutable and available for new requests when not archived.
- Archived: hidden from new request submission and treated as inactive in normalized Supabase template rows.

Template Library permission behavior:

- Superusers can open, duplicate, and archive non-archived templates.
- Template creators can open and archive their own editable drafts.
- Non-creators can duplicate non-archived templates to create their own editable draft.
- Archived templates cannot be opened, duplicated, deleted again, or used for new requests.
- Library cards show status and ownership labels such as Draft, Published, Archived, Created by me, Cannot edit, and Superuser access.

Template lifecycle audit behavior:

- Template create, update, publish, duplicate, and archive actions create admin audit events.
- Each admin audit event stores actor name, actor email, timestamp, action, template ID, template name, version, and human-readable detail.
- Admin audit events are persisted with the workspace snapshot and shown in the Admin tab.

## 19. Supabase Persistence

### 19.1 Database Objects

The current Supabase schema includes:

- business_units
- business_departments
- workflow_template_versions
- approval_requests
- approval_request_events
- approval_request_attachments
- workspace_snapshots
- storage bucket: approval-documents

### 19.2 Persistence Strategy

The UI currently uses local-first workspace state for fast startup.

Workspace state includes:

- Selected template ID.
- Approval tasks.
- Business directory.
- Workflow templates.
- User role assignments.
- Template admin audit events.

Workspace state is serialized to localStorage and saved to Supabase.

### 19.3 Template RLS and Legacy Repair

Workflow template versions use Supabase RLS:

- Authenticated users can read active template versions.
- Admin profile users can create and update template versions.
- Template creators can insert template versions where `created_by = auth.uid()`.
- Template creators can update template versions they own.
- Ownerless legacy template rows can be claimed during update when `created_by is null` and the new row sets `created_by = auth.uid()`.

The live migration `20260621151500_harden_template_lifecycle_permissions.sql` applies the creator insert/update and ownerless legacy-claim policies. The legacy ownerless check currently reports zero active ownerless template versions in the live project.

Remote persistence includes:

- Normalized tables for workflow templates, requests, events, attachments, businesses, and departments.
- Snapshot fallback in workspace_snapshots.
- Supabase storage for uploaded approval documents.

### 19.2.1 API Routes

Current API surface:

- `POST /api/auth/sign-in`: signs in with Supabase email/password.
- `POST /api/auth/sign-up`: creates a Supabase user in setup/admin flow.
- `GET /api/workspace`: loads normalized workspace state with snapshot fallback.
- `POST /api/workspace`: saves workspace snapshot and normalized data where possible.
- `POST /api/attachments/upload`: uploads task documents to the `approval-documents` storage bucket.
- `POST /api/parse`: parses uploaded files and returns extracted draft fields.
- `GET /logout`: signs out and redirects to login.

API requirements:

- All workspace, attachment, and auth routes must use server-side Supabase clients.
- Unauthenticated workspace and attachment calls must return 401 or redirect to login as appropriate.
- Workspace load should use short server-side caching where safe.
- Workspace save should not block first page render.
- Attachment upload must sanitize file names and store files under a user/document scoped path.
- Parse route must return structured JSON with extracted fields, notes, and errors.

### 19.2.2 Local-First Sync

The app should load quickly from local workspace state, then reconcile with Supabase.

Requirements:

- Browser local state should be used as the first available UI snapshot.
- Remote workspace load should update state once available.
- Remote autosave should be delayed/debounced to avoid save storms.
- If remote load/save fails, the app should stay usable in local mode and display a non-blocking sync status.
- Local and remote payloads should use the same workspace snapshot shape.

### 19.3 Security Requirements

Supabase RLS must enforce:

- Authenticated users can read active businesses/departments/templates.
- Admins can create/update business units, departments, and templates through the current normalized workspace save path.
- Admins can soft-deactivate business units, departments, and workflow template versions through the dedicated workspace admin mutation path; DELETE grants are intentionally absent.
- Request participants can read relevant approval requests.
- Originators and current owners can update requests where allowed.
- Participants can read events and attachments for requests they are allowed to see.
- Users can read and update their own workspace snapshots.
- Storage object access should be limited to authenticated owners/participants as the document security model matures.

## 20. Role Management

The product supports role assignments with:

- Name.
- Email.
- Role.
- Business.
- Department.

Supported roles:

- Superuser.
- Originator.
- Approver.
- Reviewer.
- FYI.
- Current actor.
- Previous actor.
- Participant.

The user directory is currently inferred from tasks and templates and can be managed from the Admin tab.

## 21. Authentication

The app uses Supabase Auth.

Requirements:

- Sign in with email and password.
- Setup mode for first admin account.
- Logout route.
- Server-side current-user checks.
- Prefer fast JWT claims validation with fallback to user lookup.
- Authenticated pages redirect unauthenticated users to login.
- Login redirects signed-in users back to the app.

## 21.1 Authorization Requirements

The product must distinguish authentication from authorization.

Target authorization model:

- Superusers can manage businesses, departments, templates, and role assignments.
- Originators can create requests and act on returned requests they own.
- Current owners can act on assigned approval/review tasks.
- Participants can view tracking, audit trail, and relevant attachments.
- FYI recipients can view tracking but cannot block workflow progress.
- Admins can view operational records required for support and governance.

Current prototype uses a mix of Supabase profile admin flags, role assignments, participant lists, and local user context. Production should consolidate this into a clear server-enforced permission model.

## 22. Performance Requirements

### 22.1 Target

Every primary page should load in under 50 ms under repeatable production HTTP response measurements.

Primary pages:

- /login
- /?tab=queue
- /?tab=tracking
- /?tab=upload
- /?tab=workflow
- /?tab=admin

### 22.2 Current Performance Evidence

Production HTTP response medians measured on 2026-06-20 during performance work:

- /login: approximately 8 ms
- /?tab=queue: approximately 6-11 ms across repeated runs
- /?tab=tracking: approximately 5-9 ms across repeated runs
- /?tab=upload: approximately 5-9 ms across repeated runs
- /?tab=workflow: approximately 6-9 ms across repeated runs
- /?tab=admin: approximately 5-9 ms across repeated runs

### 22.3 Performance Design Decisions

Current optimizations include:

- Supabase directory/template TTL caching.
- Workspace payload caching.
- Auth getClaims before getUser.
- Proxy matcher excludes /api routes.
- Local-first workspace loading.
- Deferred background autosave.
- Dynamic loading of workflow canvas.
- Dynamic loading of full workspace behind a lightweight shell.

### 22.4 Open Performance Concern

In-app browser navigation measurements remain above 50 ms because they include browser automation overhead, client JavaScript, and hydration. Current production browser navigation medians are about 117-134 ms. This should be tracked separately from production HTTP response time.

### 22.5 Current Quality Gate

The current required quality gate for significant architecture or workflow changes is:

- Focused red/green tests for new state or domain helpers where behavior changes.
- `npx next typegen && npx tsc --noEmit`.
- `npm run lint`.
- Live route smoke against `http://localhost:3000/?tab=workflow`; unauthenticated `307 /login` is expected without a browser Supabase session.
- `npm test -- --runInBand`.
- `npm run build`.
- Autoreview before commit.

Latest known passing baseline as of 2026-06-21:

- Type generation and TypeScript passed.
- Lint passed.
- Live route smoke returned `307 /login`.
- Full unit suite passed at 218/218.
- Production build passed.
- Latest autoreview status should be updated after the current soft-deactivation review completes.

## 23. Mobile and Responsive Requirements

The UI must be usable on mobile and desktop.

Requirements:

- Text must wrap inside cards, boxes, buttons, and form fields.
- Buttons must not spill text outside their containers.
- Workflow side navigation must collapse.
- Canvas should remain usable on smaller screens.
- Box Details panel should scroll without hiding controls.
- Form fields should stack on narrow screens.
- Action buttons should use flexible wrapping and adequate tap targets.
- No overlapping text or controls.

## 24. Accessibility and Usability Requirements

- Buttons should have clear labels or tooltips.
- Icon-only controls should have tooltips or accessible names.
- Condition controls should avoid internal terminology such as "count cases".
- Condition cases should be numbered automatically.
- User-facing labels should explain intent clearly.
- Delete operations should be undoable.
- Missing required inputs should be visibly indicated.
- Validation warnings should be written in business language.

## 25. Data Model Summary

### 25.1 WorkflowTemplate

Represents a configured approval workflow.

Important fields:

- id
- name
- business
- department
- version
- isDraft
- publishedAt
- createdByEmail
- createdByName
- createdAt
- updatedByEmail
- updatedAt
- isArchived
- archivedAt
- archivedByEmail
- documents
- fields
- steps
- graph

### 25.1.1 AdminAuditEvent

Represents an administrative template lifecycle event.

Important fields:

- id
- action
- actor
- actorEmail
- timestamp
- detail
- templateId
- templateName
- templateVersion

### 25.2 WorkflowGraph

Contains nodes and edges.

Nodes define workflow boxes.

Edges define routing paths.

### 25.3 WorkflowGraphNode

Important fields:

- id
- kind
- label
- x/y position
- assignee name/email
- due hours
- escalation name/email
- document IDs
- blocking flag
- acknowledgement required flag
- condition cases

### 25.4 WorkflowConditionCase

Important fields:

- id
- name/nickname
- fallback flag
- approval rule
- numeric rule
- join mode
- target node IDs

### 25.5 ApprovalTask

Represents a submitted request.

Important fields:

- id
- title
- workflow
- workflow template ID/version/snapshot
- requester name/email
- status
- due/dueAt
- current step
- current owner
- current node ID
- pending node IDs
- pending owners
- completed node IDs
- notified node IDs
- node decisions
- extracted fields
- attachments
- participants
- audit trail

## 26. Acceptance Criteria

### 26.1 Template Management

- Superuser can create a workflow template with name, business, and department.
- Superuser can add approval, review, condition, FYI, return/reject, and end boxes.
- Superuser can connect boxes using branch types.
- Superuser can configure documents inside a box.
- Superuser can add multiple fields to extract per document.
- Superuser can publish a versioned template.

### 26.2 Condition Builder

- User can add multiple condition cases.
- Each case is displayed as Condition 1, Condition 2, etc.
- User can add a nickname to a case.
- User can configure approval rules inside each condition.
- User can configure numeric rules inside each condition.
- User can combine approval and numeric rules with AND/OR.
- User can map each condition to one or more outcome boxes.
- User can add an All other conditions fallback.
- System warns about missing approval count coverage.
- System warns about contradictory/overlapping conditions.

### 26.3 Request Submission

- Originator can select a template.
- Originator can upload all required starting documents.
- System blocks submission if required starting documents are missing.
- System extracts configured fields where parser support is available.
- Originator can review and correct extracted fields.
- System creates a task with participants, current owner, due time, and audit events.

### 26.4 Queue Actions

- Approver can approve.
- Approver can approve with comment.
- Approver can reject.
- Approver can reject with comment.
- Approver can reassign with target email.
- Approver can delegate with target email.
- Task routes according to the canvas graph.
- Reassigned tasks remain active and show reassigned label.
- Delegated tasks remain active and show delegated label.

### 26.5 Returned Requests

- Rejected requests return to originator when configured or when no rejected branch exists.
- Originator can amend and resubmit.
- Originator can cancel.
- Previous approvers can still track the request after later rejection.

### 26.6 Tracking and Audit

- Originator sees current request status.
- Prior approvers see later updates.
- FYI participants see workflow status.
- Escalation users see assigned escalations.
- Every action appends an audit event.
- Tracking view shows current state and audit trail.

### 26.7 Persistence

- Business directory persists.
- Workflow templates persist.
- Approval requests persist.
- Request events persist.
- Attachments persist.
- Workspace snapshot fallback persists.
- Local state loads quickly before remote sync.

### 26.8 Performance

- Production HTTP median for each primary route is under 50 ms.
- Dev-mode performance should remain good enough for iterative preview.
- Supabase sync must not block first page paint.

## 27. Known Gaps and Follow-Up Work

1. Replace inferred user directory with a proper user/profile management workflow.
2. Add real email/Teams notification delivery.
3. Strengthen storage policies so participants, not only object owners, can access relevant files.
4. Add richer PDF, text, Excel, and CSV extraction implementations.
5. Add attachment preview/download UI with access checks.
6. Add template import/export.
7. Add drag handles and clearer connection affordances on the canvas.
8. Extend workflow publish validation with business-specific checks beyond graph validity.
9. Add production monitoring for route latency, client load, and Supabase API timings.
10. Add E2E tests for the full submit -> approve -> reject -> amend -> resubmit lifecycle.
11. Add admin controls for assigning superuser status.
12. Add real-user validation for durable admin soft-deactivation across business units and departments.
13. Add conflict handling for concurrent edits to the same template.
14. Add searchable/filterable tracking history.
15. Add audit export for compliance.

## 27.1 Prioritized Next Build Backlog

Priority 0 - must finish before real pilot:

- Confirm RLS policies with real users: admin, originator, approver, participant, and non-participant.
- Validate durable admin soft-deactivation with real Supabase admin and non-admin users, including negative RLS checks.
- Add E2E tests for create template, submit request, approve, reject, return, amend/resubmit, cancel, reassign, delegate, and condition routing.
- Extend publish gate with business-specific pilot rules.
- Make condition editor clearer with business-language summaries and fallback warnings.
- Add participant-safe attachment download/preview.

Priority 1 - should finish before broader rollout:

- Replace inferred user directory with managed profiles and role assignment screens.
- Add email or Teams notification delivery.
- Add template version comparison and rollback.
- Add tracking filters by status, owner, requester, business, department, date, and template.
- Add audit export.
- Add production monitoring for API failures, Supabase latency, parse failures, and client errors.

Priority 2 - later enterprise readiness:

- Add advanced parser/OCR extraction for PDFs and text documents.
- Add extraction confidence and correction feedback loop.
- Add condition simulation/test mode with sample extracted values.
- Add template import/export.
- Add concurrent editing protection for workflow templates.
- Add retention policies for attachments and audit records.

## 28. Open Questions

1. Should workflow templates be shared globally by business/department, or can departments have private drafts?
2. Should reassignment transfer ownership permanently, or should the original approver remain accountable?
3. Should delegation allow the delegate to act on behalf of the delegator, or should it fully replace the actor?
4. Should FYI recipients be able to acknowledge receipt?
5. Should condition cases execute all matching outcomes or only the first matching case?
6. Should numeric comparisons support currency conversion?
7. Should document extraction corrections train future extraction behavior?
8. How should approver identity be validated when a user enters an arbitrary email?
9. What is the retention policy for uploaded approval documents?
10. What reports are required for compliance and management review?

## 29. Release Milestones

### Milestone 1: Local Functional Prototype

Status: largely implemented.

Includes:

- Queue.
- Tracking.
- Upload flow.
- Workflow canvas.
- Box details.
- Condition cases.
- Return/reject.
- Reassign/delegate.
- Audit trail.
- Admin directory.
- Local workspace persistence.

### Milestone 2: Supabase Persistence

Status: partially implemented.

Includes:

- Supabase auth.
- Schema SQL.
- Normalized persistence code.
- Workspace snapshot fallback.
- Attachment upload route and storage bucket configuration.
- Live v2 baseline, grant-hardening, and profile RLS migrations verified on the `approval-app` Supabase project.

Remaining:

- Complete access model for shared participant attachment reads.
- Add operational migration process.

### Milestone 3: Production Workflow Hardening

Status: in progress.

Includes:

- Validation checks.
- Template versioning.
- Performance optimization.

Remaining:

- E2E tests.
- Publish gate.
- Better conflict handling.
- Monitoring.

### Milestone 4: Enterprise Readiness

Status: future.

Includes:

- Full user administration.
- External notifications.
- Reporting/export.
- Advanced document parsing.
- Compliance retention controls.
- Role-based dashboards.

## 30. Success Metrics

- 95% of approval requests have a visible current owner and status.
- 100% of approval actions create audit events.
- 100% of returned requests show amend/resubmit and cancel options to the originator.
- 100% of template condition nodes either cover all approval-count outcomes or define a fallback.
- Production HTTP median route response remains under 50 ms.
- Users can create a basic approval template without developer assistance.
- Users can track a request after they have acted on it.
- Superusers can update business and department directories without code changes.
