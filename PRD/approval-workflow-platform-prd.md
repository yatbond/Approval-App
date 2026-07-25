# Approval Workflow Platform PRD

Last updated: 2026-07-16
Document owner: Product / Workflow Platform
Status: Living specification aligned with the current codebase
Repository: Approval Workflow Next.js application
Production application: https://approval-app-git-codex-approval-tracking-derrick-pangs-projects.vercel.app/

## 1. Document Purpose

This Product Requirements Document describes the Approval Workflow Platform as it is currently implemented and identifies the remaining work required for a production rollout.

The codebase is the source of truth for implemented behavior. This PRD covers:

- product scope and user roles;
- navigation and responsive behavior;
- request creation, document parsing, and drafts;
- workflow template design, versioning, routing, and decisions;
- collaboration, tracking, notifications, and administration;
- data, APIs, security, deployment, and operational requirements;
- current limitations and production hardening priorities.

### 1.1 Status Labels

- **Implemented**: present in the current application and covered by code or tests.
- **Partially implemented**: usable, but has a documented operational or security limitation.
- **Planned**: not yet implemented.
- **Compatibility only**: retained in types or runtime handling for older data, but unavailable in the current user interface.

## 2. Product Summary

The Approval Workflow Platform is a responsive web application for document-heavy business approvals. It lets authorized users create reusable workflow templates, build and publish reusable forms in the Form Library, attach those forms to Submit or Approval boxes, start requests, extract structured values from uploaded documents, route work through sequential or parallel approvals, collaborate on missing information, track progress, and retain an auditable history.

The initial organizational scope is the Chun Wo group and its businesses and departments. The product is designed to support different approval structures without requiring a custom application for each process.

The current stack is:

- Next.js 16 and React 19;
- TypeScript;
- Supabase Auth, Postgres, Storage, and row-level security;
- React Flow for workflow design;
- OpenRouter or OpenAI-compatible AI parsing;
- Resend for transactional email;
- Vercel for deployment;
- Node.js test runner and Playwright-based browser verification.

## 3. Product Principles

1. **Simple first**: common actions remain visible; advanced configuration stays collapsed until needed.
2. **Position-based templates**: templates describe business positions, while actual request participants are resolved when a request starts.
3. **Visible ownership**: every actionable request identifies its current owner and status.
4. **No silent loss of context**: handoff, decisions, corrections, reassignment, and delegation remain auditable.
5. **Flexible with guardrails**: parallel routing, conditions, collaboration, and return routing are configurable but validated.
6. **Human-correctable AI**: extracted values are reviewable, editable, and trainable through saved examples.
7. **Mobile for operations, desktop for design**: request submission, Inbox, Tracking, Drafts, Workflow Builder/Library, Forms Builder/Library, and Admin are responsive; visual workflow canvas editing is desktop or tablet only.

## 4. Goals and Success Criteria

### 4.1 Product Goals

- Replace informal email and spreadsheet approval chains with a consistent system.
- Let administrators and workflow creators model approval processes without code.
- Support uploaded PDFs, images, spreadsheets, and native request forms.
- Reduce manual data entry through AI/OCR extraction with evidence and confidence.
- Provide deterministic sequential, parallel, conditional, FYI, escalation, return, delegation, and reassignment behavior.
- Preserve visibility for originators and prior participants throughout the request lifecycle.
- Provide a clear audit history suitable for operational review.
- Work effectively on desktop and mobile browsers.

### 4.2 Initial Success Measures

- A user can create, publish, and start a workflow without developer assistance.
- Required participants, documents, and values are validated before submission.
- Sequential and parallel workflows progress without duplicate tasks.
- Rejected requests return to the correct person or upstream stage.
- Every action appears in Tracking history.
- Draft work survives refresh and can be resumed without duplication.
- Extraction results are editable and saved corrections can be reused.
- Notifications accurately identify the request, action, recipient, and next step.
- All automated tests, lint checks, production build, and critical browser paths pass before release.

## 5. Non-Goals for the Current Release

The current release is not intended to provide:

- full BPMN modeling;
- native iOS or Android applications;
- offline multi-device conflict resolution;
- ERP, accounting, procurement, or document-management integrations;
- enterprise SSO, SCIM, or identity lifecycle automation;
- advanced analytics, SLA dashboards, or report builders;
- cryptographic digital signatures;
- a fully server-hosted workflow execution engine;
- immutable regulatory records management.

## 6. Users, Roles, and Authorization

### 6.1 User Roles

| Role | Main responsibilities |
| --- | --- |
| Originator / submitter | Starts a request, supplies required information, tracks progress, responds to returns, resubmits, or cancels. |
| Approver | Reviews the handoff, approves, rejects, requests contributors, delegates, or initiates reassignment. |
| FYI participant | Receives visibility or acknowledgement work without blocking approval unless explicitly configured. |
| Contributor | Supplies requested information or documents without becoming the request owner. |
| Delegate | Acts on a task for the owner while the original owner retains ownership and tracking visibility. |
| Reassignment candidate | Accepts or declines a proposed ownership transfer. |
| Workflow creator | Creates and manages templates they own. |
| Superuser / administrator | Manages organizational data, templates, users, email diagnostics, and audit views. |

### 6.2 Template Ownership

- A workflow template can be managed by its creator or a superuser.
- Other users may use an active published template but may not edit it.
- Published versions are locked. Changes are made in a new draft version.
- Archived versions are excluded from normal template selection.

### 6.3 Current Role Limitation

**Partially implemented:** the domain model, database policies, and template ownership rules support scoped roles, but the current workspace client constructs the active signed-in user as a superuser. Production rollout requires server-derived role resolution and enforcement in every privileged API and UI action.

## 7. Information Architecture

### 7.1 Primary Navigation

The signed-in application contains six primary destinations:

1. **Inbox**: requests requiring the user’s action.
2. **Tracking**: requests the user originated, owns, previously acted on, or can otherwise view.
3. **Drafts**: incomplete request drafts that can be resumed or deleted.
4. **Workflow**: workflow Builder, Canvas, and version-grouped Library.
5. **Forms**: independent reusable form Builder, native form Layout editor, and version-grouped Library.
6. **Admin**: organization, role, notification, email, and template administration.

The header also contains:

- a clickable, user-specific unread notification count and notification menu;
- signed-in user identity;
- save/sync state;
- persistent light/dark theme control;
- sign-out action with confirmation;
- **+ New** to start a request.

### 7.2 Request Creation Is Not a Navigation Tab

There is no user-facing Upload tab. **+ New** opens the internal request-creation route. Uploaded documents belong to a new request or to a contributor response, not to a separate top-level workspace.

### 7.3 Responsive Navigation

- Desktop uses a collapsible sidebar and compact header.
- Mobile uses a compact six-item navigation treatment and responsive action layout.
- Intermediate window widths use available panel width, not viewport width alone, so nested cards stack before their text or controls become cramped.
- Long labels wrap or truncate without crossing control boundaries.
- Tooltips explain unfamiliar controls.
- Workflow Canvas editing is disabled on mobile with a concise desktop/tablet notice.
- Form controls and icon-only actions expose accessible names; placeholders are supporting hints rather than the only control label.
- The sidebar collapse control retains a full touch target even when the brand lockup and navigation share constrained width.

## 8. End-to-End User Journeys

### 8.1 Create and Publish a Workflow

1. An authorized user opens Workflow > Builder.
2. The user creates a workflow or opens the current draft/active version of an existing workflow family.
3. The user enters or updates workflow name, business, and department. Published versions remain locked and expose **Create draft version** instead of editable fields.
4. For a new workflow, the user chooses **Blank workflow** or copies an active, non-archived workflow.
5. The application prevents duplicate workflow names within the same business and department.
6. Creating the template opens Canvas directly.
7. The user configures Submit, Approval, FYI, and Condition boxes and connects them to the fixed Start and End boxes.
8. Validation identifies routing, document, field, and condition problems.
9. The user enters one tester email and starts a dedicated test request. Every
   workflow role is assigned to that tester, and no live request is changed.
10. The user publishes an eligible draft.
11. The published version can be activated for future requests. Library keeps every draft and published version under one workflow family, with archived versions in a separate view.

### 8.2 Start and Submit a Request

1. The user presses **+ New**.
2. The user selects an active published workflow.
3. A compact workflow map shows the request route and highlights the box whose participant, document, or field information is being entered.
4. The user supplies participant and escalation emails that were not fixed by the template.
5. The user uploads required documents or completes manual fields.
6. The application parses supported documents and displays extracted values, evidence, and confidence.
7. Document preview starts in Original mode at 100% zoom, 100% contrast, and 100% brightness; users may adjust these controls when needed.
8. The user corrects values as needed.
9. Validation blocks submission until required assignments, documents, and fields are complete.
10. The request is created with a workflow snapshot and assigned to the first actionable stage.
11. Tracking and notification records are created.

### 8.3 Act on a Request

1. An actor opens Inbox and selects a request.
2. The actor reviews visible values, documents, history, ownership, and due state.
3. The actor approves, approves with a note, rejects, rejects with a note, delegates, requests reassignment, or requests a contributor.
4. The workflow engine applies graph routing, parallel-stage rules, conditions, FYI behavior, and audit events.
5. New owners are notified and all authorized participants retain tracking visibility.

### 8.4 Return, Amend, and Resubmit

1. Reject defaults to returning the request to the original submitter.
2. The rejecting actor may expand **Return to...** and select a valid upstream node or parallel stage.
3. Returned upstream boxes reopen and affected downstream state is reset.
4. The recipient reviews the rejection note, amends information, and resubmits, or cancels if they are the originator.
5. Reopened stages must act again before the request progresses.

## 9. Request Creation and Drafts

### 9.1 Template Selection

- Only active, published, non-archived workflows are offered for new requests.
- Labels identify workflow name, business, and department to disambiguate duplicate names across organizational scopes.
- Historical requests retain the workflow snapshot used when they started.

### 9.2 Participant Resolution

Templates are position-based:

- Box labels use **Position name**.
- Person names are not required in the template.
- Submitter, approver, FYI, and escalation emails are optional while designing a template.
- An optional template email can be marked **Fixed**.
- Fixed emails cannot be changed when the real request starts.
- Non-fixed or blank emails must be completed at request start when the position is required by the route.
- Escalation position and escalation email are optional.

### 9.3 Native Request Forms

Native forms are created and versioned only in the primary **Forms** workspace. A Submit or Approval box can attach an active published form from the Form Library; the workflow editor does not provide a second inline form builder. Document upload requirements are added separately from form attachments.

Supported field types are:

- short text;
- long text;
- number;
- currency;
- date;
- email;
- dropdown;
- single choice;
- checkbox.

Each field can define a label, optional help text, optional placeholder, required status, and choices where applicable. Dropdown and single-choice fields must contain at least one choice before publication. Required native fields block request submission until completed.

Each request data field has one explicit input source:

- **User entry in Approval App** for a native form control;
- **Microsoft Forms answer** for an exact question label delivered by Power Automate; or
- **AI from attachment** for a value extracted from a registered file-upload question.

AI-derived fields select the attachment question to parse and can provide an optional extraction instruction. The extracted result is written into the same editable request field map as manual answers, so the submitter or box owner can review and correct it before submission or approval. Required extracted values block progression when extraction does not produce a value.

Native form values use the same request field map as AI/OCR values. They therefore participate in draft autosave, conditions, handoff visibility, tracking, and audit behavior without a separate form data model. Existing templates stored with an embedded `inputMode: manual_form` remain readable and runnable for compatibility, but the workflow editor treats them as read-only legacy requirements. Users can remove them and attach a published Form Library version; all new forms must be created and published in the Form Library before attachment to a workflow box.

### 9.4 Reusable Form Library

**Forms** is a primary workspace separate from Workflow. It contains a reusable, versioned Form Library so forms can be designed independently and attached to multiple workflows.

The library supports:

- native forms built and completed in Approval App;
- a Builder for fields, source mappings, choices, required responses, attachment questions, company/department scope, and version notes;
- a Layout editor that arranges native fields into named sections and full- or half-width desktop rows, with automatic full-width mobile rendering;
- drafts that update in place until published;
- linked Microsoft Forms registered by response URL;
- canonical request data fields with an explicit user-entry, Microsoft Forms answer, or AI-from-attachment source;
- registered file-upload questions that can attach files and supply AI/OCR-derived values;
- immutable published versions with version comments and explicit activation for new workflow attachments;
- archive behavior that removes a form from new workflow selection without breaking pinned workflow versions;
- a target workflow and participant-resolution preflight when a Microsoft Form starts a new request.

Forms Library groups draft and published versions under one form family. **Available** contains usable versions and editable drafts; **Archived** contains retired versions. An authorized user can edit a draft, create a new draft from a published version, activate any ready published version, or archive a version. Existing workflow attachments remain pinned to their original form version.

A Submit or Approval box can attach a ready library form. The workflow stores both a pinned library/version reference and a snapshot of its mapped fields. Later library changes therefore do not alter published workflow versions or in-flight requests.

Pinned library forms retain their source and are not converted into generic document requirements:

- a Microsoft Form remains a Microsoft Form and is completed through its registered Microsoft Forms link;
- an Approval App form renders its native controls inside Approval App;
- Canvas shows the pinned source, version, field sources, and attachment mappings as a read-only summary;
- Canvas does not offer the legacy **Input method** or **Format** controls for a pinned library form;
- field definitions, choice lists, and attachment questions are edited by creating a new Form Library version, then attaching that version to the workflow.

Microsoft Forms remains authoritative for its question presentation and choice lists. Approval App stores the exact question label and canonical data type needed by the workflow, but it does not duplicate Microsoft Forms choice options as native controls. Power Automate returns the selected answer. Native Approval App choice fields continue to store and render their configured options directly.

Microsoft Forms can be configured in two modes:

1. **Start a new approval request**: one registered form version identifies one active published workflow version. Participant emails resolve from fixed template values, the respondent, mapped email fields, the company position directory, or manual intake resolution.
2. **Complete an existing workflow box**: the external response must carry the Approval Request Reference and match a form version pinned to that request's workflow snapshot.

The request screen opens a linked Microsoft Form in a new tab and shows the values expected from that form without rendering duplicate native answer controls. Automatic response delivery requires a Microsoft Power Automate flow. A Microsoft Form does not need to contain questions for AI-derived fields: Power Automate delivers the registered attachment and Approval App writes the parsed result into the app-owned request data field.

Attachment handling follows the form source:

- Microsoft Forms attachments are uploaded in Microsoft Forms and delivered to Approval App by Power Automate; no duplicate Approval App file picker is shown for them.
- Approval App form attachments are uploaded in Approval App, parsed immediately when fields are linked, and remain editable before submission.

The secure endpoint is `POST /api/form-intake`. It requires a bearer secret, validates a bounded structured payload, and deduplicates by provider/form/response ID. Each payload identifies the workspace owner, pinned form key and version, external Form ID, schema fingerprint, response mode, and external response ID.

The response processor is server-side and synchronous:

- **Start workflow** resolves the registered active workflow, maps respondent/form/template participant emails, downloads registered PDF or image attachments when AI fields require them, extracts those fields, validates required values and uploads, creates one request, and routes it normally.
- **Complete node** locates the referenced request, verifies the pinned form version, adds mapped values and Microsoft 365 attachment links, extracts registered AI fields, and records an audit event. It does not approve the box; the current owner still decides.
- Processing updates both the normalized workspace and the owner snapshot so browser reloads retain the result.
- Results and failures remain in `external_form_submissions` for diagnosis.

For native Approval App forms, registered attachment questions render as upload controls in the request screen. Uploading a PDF or image invokes the existing parser, merges linked AI-derived values into the current request without clearing manual answers, and leaves every result editable. Multiple attachment questions can contribute values to the same request.

The Power Automate runbook and payload contract are in `docs/microsoft-forms-power-automate.md`.

Schema drift policy:

- form versions are immutable;
- breaking changes require a new registered version;
- new requests can only use forms in **Ready** status;
- existing workflows and requests remain pinned to their original form schema;
- changed, broken, and archived status values are reserved for connection monitoring and lifecycle control.
- unknown questions, missing required questions/uploads, external Form ID mismatch, and fingerprint mismatch are rejected as `schema_changed` before request data changes;
- duplicate external response IDs return the existing stored result without repeating workflow actions.

### 9.5 Required Inputs

Submission validation covers:

- participant assignments for the effective route;
- required uploads;
- required extracted or manual fields;
- valid email formats;
- valid workflow graph and active template version.

Native-form workflows may submit without an uploaded file when their required fields are complete.

### 9.6 Draft Identity and Persistence

- Every request draft has a stable unique identifier.
- Autosaving an existing loaded draft updates that draft rather than creating a duplicate.
- Users can create named drafts, load them, and delete them.
- Drafts are creator-owned.
- The current implementation uses local-first state with Supabase draft persistence when available.
- Uploaded document references, parsed values, training drafts, selected field, instruction, sample value, and saved sample examples must survive refresh.
- The Drafts page is the primary location for resuming incomplete requests.
- Resuming a draft opens the request editor while keeping **Drafts** highlighted in navigation. A compact **Draft controls** bar below the workflow map shows autosave status and a **Drafts (n)** dropdown for opening named drafts, saving a new draft, deleting saved drafts, or discarding current work.
- Each saved attachment exposes **Edit extraction** and **Remove** actions. Edit extraction securely reloads the private stored original, restores its preview and saved extraction boxes, and opens boxed-field editing. Remove requires confirmation and clears the associated attachment, extracted values, and prepared request item from the same draft.

### 9.7 Multi-Document and Batch Behavior

- A request can contain multiple required or optional documents.
- Each attachment records its requirement, source box, storage metadata, and parsing result.
- Multiple prepared draft items may be submitted when all required data is valid.
- Sample documents used to configure a template are training assets and must never become actual request attachments.

## 10. Document Parsing and Field Recognition

### 10.1 Supported Inputs

| File type | Default strategy |
| --- | --- |
| PDF | PDF OCR and rendered-page vision |
| Image | Image AI |
| XLSX, XLS, CSV | Spreadsheet table extraction |
| No file | Manual form |

### 10.2 Parsing Pipeline

For PDF documents:

1. PDF.js renders pages and extracts typed page text where available.
2. When rendered page images are present, the configured vision OCR model is tried first.
3. If requested values remain missing, the main vision model is used as a fallback.
4. Full-document parsing may use the configured OpenRouter file-parser plugin.
5. Results include values, confidence, evidence, page references, and optional field suggestions.

The default OpenRouter configuration supports:

- Qwen 3 VL for rendered-page visual OCR;
- Gemini Flash as the main vision/fallback model;
- a full-PDF parser such as Mistral OCR through OpenRouter.

Model names remain environment-configurable and must not be treated as a permanent product contract.

### 10.3 Extraction Review

- Extracted fields are editable before submission.
- Confidence is shown as high, medium, or low.
- Evidence helps the user verify the result.
- Low-confidence or missing values remain visible for correction.
- Corrected values can become examples for future extraction.
- Suggested fields can be accepted into the request or template configuration.

### 10.4 Template Training Samples

For each configured document requirement, a workflow creator can:

1. upload a sample document;
2. select an existing **Field to train**;
3. enter an optional instruction;
4. run **Manual Extract** to zoom, pan, and draw a region;
5. run **Full Auto Detect** to search the full document;
6. confirm or edit the Sample value;
7. use **Save and next field** to persist the example and continue.

Multiple fields can be trained from one sample document. A field can also retain multiple region examples.

The selected box is a location hint, not an exact coordinate rule. Recognition must tolerate scan movement, scaling, rotation, photocopying, and upside-down pages by combining visual region, surrounding labels, instructions, and document context.

### 10.5 Sample Data Isolation

- Sample documents and preview images belong to template configuration.
- Publishing sanitizes bulky preview page images from the reusable template payload while retaining extraction examples needed at runtime.
- Starting a request begins with empty actual attachments and does not reuse the sample file.

## 11. Workflow Template Lifecycle

### 11.1 States

| State | Behavior |
| --- | --- |
| Draft | Editable by creator or superuser; unavailable for real requests. |
| Published | Locked version; eligible for activation. |
| Active | Published version selected for new requests. |
| Archived | Removed from normal Library and request selection; retained for history. |

### 11.2 Workflow Views

- **Builder**: creates a new workflow or opens one current draft/active record per workflow family. It edits draft identity fields and creates a draft version from a published workflow.
- **Canvas**: visually edits the selected draft.
- **Library**: shows one full-width, collapsed row per workflow with its company, department, active version, and a draft indicator when applicable. Only one workflow expands at a time. The expanded view separates the active version, current draft, and individually expandable version history; version notes remain plain text until edited. Its **Available** view supports edit/new draft, activation, and archive actions, while **Archived** keeps retired versions separate.

### 11.3 Versioning Rules

- Editing a published workflow creates or uses a new draft version.
- Publishing a new version does not delete earlier versions.
- Activating a version makes it the version used for new requests.
- An authorized user can activate an older published version without renumbering or pretending it is a new version.
- Every version can include a short change comment.
- Existing requests continue using their original workflow snapshot.
- Archived versions are not available as a copy base or new-request template.

## 12. Workflow Canvas and Boxes

### 12.1 Canvas Behavior

The desktop/tablet Canvas provides:

- pan, zoom, fit view, and minimap controls;
- drag-to-connect edges;
- node and edge selection;
- keyboard deletion where allowed;
- undo, redo, and reset;
- route validation;
- route summary and a dedicated tester-email workflow test;
- autosave and publish controls.

The template canvas shows workflow structure and editor selection only. It does
not display live-request labels such as **Current**, **Completed**, or **FYI
sent**. Test-run progress appears in **Test this workflow**, while real-request
progress remains in Inbox and Tracking.

### 12.2 Available Boxes

| Box | Purpose |
| --- | --- |
| Start | Fixed structural entry point. Exactly one. Cannot be deleted or added. |
| Submit | Collects actual request data, documents, and submitter assignment. |
| Approval | A blocking decision step with approve and reject behavior. |
| FYI | Sends information or optional acknowledgement without becoming a normal approval. |
| Condition | Selects one or more outgoing paths based on prior decisions or numeric values. |
| End | Fixed structural completion point. Exactly one. Cannot be deleted, added, or selected as another box type. |

Separate Review and Return/Reject boxes are not exposed. Review behavior is represented by Approval. Reject return routing is built into Approval actions.

Legacy `review` and `return_reject` values may remain in domain types or compatibility handling for previously stored data, but they are not available in the builder.

### 12.3 Submit Box

The Submit box can define:

- position name;
- optional submitter email and fixed-email lock;
- shared upload behavior;
- whether shared fulfillment requires confirmation;
- document requirements;
- manual or extracted fields;
- sample documents and extraction examples.

### 12.4 Approval Box

The Approval box can define:

- position name;
- optional person email and fixed-email lock;
- due hours;
- optional escalation position;
- optional escalation email and fixed-email lock;
- information handoff rules;
- local document requirements and recognition fields;
- an active published native or Microsoft form pinned from the Form Library.

When an Approval box becomes current, Inbox renders its pinned form and local
document requirements. Native form values and native form attachments can be
completed in Inbox. Microsoft Forms shows its registered response link and the
Approval Request Reference, then waits for the pinned response delivered through
Power Automate. Approval is blocked while any required file, extracted value,
native form field, native form attachment, or Microsoft Forms response is
missing. Approval-stage uploads run AI/OCR immediately; the current owner can
review and correct the extracted values before deciding.

### 12.5 FYI Box

The FYI box can define:

- position and optional fixed email;
- information handoff;
- whether acknowledgement is required.

An FYI event does not block a normal approval route unless acknowledgement is explicitly part of the configured behavior.

### 12.6 Information Handoff

Each participant box can control what it receives:

**Values**

- All values
- Selected values, using checkboxes from the available field list
- Hide selected values, using checkboxes

**Documents**

- All documents
- Selected documents, using checkboxes from the current effective upstream and local requirement list
- No documents

The former **Required here** document option is not user-facing.

Document options must be derived from current reachable requirements, deduplicated by stable requirement identity, and refreshed when the workflow changes. Stale draft or deleted requirements must not appear.

**Format**

- Standard
- Compact
- Comparison

**Processes**

- Compare values
- Calculate difference
- Calculate percentage difference

Handoff configuration currently controls display behavior. Server-side access control must independently enforce the same visibility before production use.

### 12.7 Test This Workflow

The Canvas provides a routing-only test for the current draft:

- the workflow author enters an Approval App user email;
- the application creates a separate request with a `TEST-` identifier and a
  `[TEST]` title;
- every Submit, Approval, FYI, and escalation recipient in the test snapshot is
  replaced with the tester email, including template emails marked Fixed;
- starting a new test replaces the previous test run for the same template but
  does not remove or change any live request;
- the tester receives an email containing the workflow name, current position,
  upstream position, status, required action, latest decision or update, and a
  direct link to Inbox or Tracking;
- later test decisions send the updated workflow details only to the tester;
- the panel uses plain labels such as **Current position**, **Latest update**,
  **Approve test step**, and **Reject test step** instead of internal node IDs;
- only actions valid for the current test status are shown;
- document requirements are displayed but do not block this routing-only test;
  forms, uploads, and AI parsing are tested through **+ New**.

The tester must have an Approval App account for the entered email. Email
delivery follows the configured Disabled, Dry run, or Live delivery mode.

## 13. Routing and Decision Semantics

### 13.1 Sequential Routing

- Approval advances to connected downstream work after its decision succeeds.
- Structural and FYI nodes are traversed according to their configured behavior.
- A request completes when all required reachable work reaches End.

### 13.2 Parallel Routing and Join Behavior

- Multiple outgoing main paths create parallel work.
- A downstream convergence waits for all active required upstream parallel boxes.
- One approval does not silently bypass an unanswered peer.
- If one peer never responds, the joined downstream stage remains waiting.
- Due-hour logic marks overdue work and may escalate it, but it does not auto-approve.
- Rejection returns the request according to reject routing and prevents normal forward completion for that cycle.

### 13.3 Approval Actions

| Action | Result |
| --- | --- |
| Approve | Records approval and advances when join requirements are satisfied. |
| Approve with note | Same as Approve and records the note. |
| Reject | Returns to the originator or selected valid upstream stage. |
| Reject with note | Same as Reject and records the note in audit history. |
| Delegate | Lets another user act while the original owner retains ownership and tracking visibility. |
| Reassign | Proposes a transfer; ownership changes only after the candidate accepts. |
| Request contributor | Requests information or documents without changing task ownership. |

### 13.4 Built-In Reject Return Routing

- The default return target is the original submitter.
- **Return to...** is an advanced, compact control in Inbox.
- Only valid upstream boxes or upstream parallel stages are selectable.
- A parallel stage can reopen multiple boxes together.
- The rejecting box is recorded as rejected.
- Selected upstream boxes become pending again.
- Affected downstream decisions and completion state are cleared.
- Earlier unrelated completed work remains intact.
- After reopened boxes complete again, routing proceeds forward through the existing graph.
- The original submitter can amend and resubmit or cancel.

### 13.5 Reassignment

- Requesting reassignment does not immediately change the owner.
- The proposed new owner can accept or decline.
- On acceptance, ownership and the relevant task visibility transfer.
- On decline, the original owner remains responsible.
- Reassignment events remain in history.

### 13.6 Delegation

- Delegation authorizes another person to act.
- The original owner remains the owner and can continue tracking.
- Delegation and reassignment controls are independent and may both be configured or used where valid.

### 13.7 Conditions

A Condition box supports numbered cases and an optional fallback.

A case may evaluate:

- a named upstream approval result;
- an approval count using at-least or exactly semantics;
- a numeric field with an operator and threshold;
- approval and numeric criteria combined with AND or OR.

A case can route to one or multiple output boxes. Conditions wait when required parallel outcomes are unresolved.

Validation covers:

- missing targets;
- missing or invalid numeric operands;
- approval-count coverage;
- overlapping or ambiguous cases;
- missing fallback;
- unreachable or disconnected paths.

### 13.8 Due Dates and Escalation

- Approval boxes may define due hours and optional escalation assignment.
- Pending work becomes overdue after its due time.
- It may then become escalated and notify the escalation recipient.

**Current limitation:** escalation evaluation runs on an interval while an authenticated client is active. Production requires a durable server-side scheduler so escalation does not depend on an open browser.

## 14. Collaboration and Shared Fulfillment

### 14.1 Additional Contributors

An actor can request help by entering:

- contributor name;
- contributor email;
- request note;
- due time;
- whether the request blocks progress.

The contributor can open Tracking, upload information, and submit their contribution. This does not change the approval owner.

### 14.2 Shared Submit Requirements

- A submit requirement can be fulfilled by an allowed participant other than the originally assigned submitter.
- The resulting fulfillment records who supplied it and which requirement it satisfies.
- A template can require confirmation by the assigned submitter or current actor.

### 14.3 Correction Flow

- A fulfillment can be confirmed or rejected.
- Rejection creates a correction request rather than silently discarding the contribution.
- A corrected upload supersedes the earlier fulfillment.
- Blocking corrections prevent forward progress until resolved.
- Collaboration events and targeted notifications remain in the audit trail.

## 15. Inbox

### 15.1 Inbox Scope

Inbox shows requests on which the signed-in user can act, including:

- current ownership;
- accepted delegation;
- pending reassignment acceptance;
- returned-originator action;
- contribution or confirmation work when applicable.

### 15.2 Inbox Presentation

- Filters include All, Attention, Delegated, and Reassignment.
- Each item summarizes request, workflow, status, current step, owner, and due state.
- Handoff displays visible values and documents.
- Primary approval is an orange action.
- Reassign, Delegate, and Additional contributor are collapsed under **More actions** for a cleaner interface.
- Enabling Reassign or Delegate suppresses conflicting approval actions for that interaction.
- Forms and document uploads attached to the current Approval box appear in the action area. Required inputs disable Approve and Approve + note until completed.
- Approval-stage document uploads run AI/OCR and expose editable **Document data** before approval.
- Native Approval App forms expose editable controls and required attachments; Microsoft Forms show response status, the request reference, and the registered external link.
- Mobile layouts collapse secondary Request information and History.

### 15.3 Status Labels

Supported task statuses include:

- Pending
- Overdue
- Escalated
- Approved
- Returned
- Reassigned
- Delegated
- Cancelled

Extraction state must not overwrite the workflow status. The UI should only show **Pending extraction** when required parsing is genuinely incomplete.

## 16. Tracking and Audit History

Tracking includes requests visible to the user as:

- originator;
- current owner;
- previous owner or actor;
- assigned participant;
- FYI participant;
- contributor where authorized.

The request detail combines path and history:

- stages are numbered in workflow order;
- parallel boxes use lettered identifiers such as 3A and 3B;
- completed boxes are green;
- the current or returned-pending box uses the active color;
- rejected activity is shown in red history;
- unreached or reset downstream boxes are visually neutral;
- relevant audit events appear within or alongside the stage they describe.
- **View history** expands the selected request's combined workflow path and audit history; **Hide history** collapses it again.

History records actor, timestamp, event type, message, notes, assignment changes, contributions, corrections, and relevant routing outcomes.

A Handoff visibility panel can be toggled off for simple workflows and expanded when users need to inspect values, documents, formatting, processes, and audience.

## 17. Notifications and Email

### 17.1 In-App Notifications

The application creates targeted notifications for:

- assignment and action required;
- originator updates;
- FYI;
- escalation;
- reassignment and delegation;
- contributor and correction activity;
- shared fulfillment confirmation.

The header count includes only notifications addressed to the signed-in user. Selecting the count opens a menu with the notification title, request context, time, and a direct link to the applicable Inbox or Tracking request. Users can mark individual notifications or all notifications as read, with read state retained in the browser.

### 17.2 Email Modes

Email uses Resend and supports:

| Mode | Behavior |
| --- | --- |
| Disabled | No provider call. |
| Dry run | Records intended delivery without sending to the real recipient. |
| Live | Sends through the configured Resend account. |

A test redirect can send all messages to one verified address while recording the intended recipient. Real-recipient delivery requires a valid provider key, verified sending domain/address, live mode, and no test redirect.

Workflow-routing test emails are always addressed only to the tester entered on
the Canvas. They include the workflow context and latest decision details and
link action-required tests to Inbox; completed or cancelled tests link to
Tracking.

### 17.3 Email Types

- action required;
- originator update;
- FYI;
- escalation;
- collaboration update.

Messages include a request summary and link to Tracking.

### 17.4 Email Administration

Admin displays:

- provider configuration status without exposing secrets;
- current delivery mode;
- test-email action with confirmation;
- recent outbox entries and sent, failed, skipped, or redirected status.

**Current limitations:**

- the visible outbox is client-memory state rather than a durable delivery ledger;
- production provider/domain verification remains an operational prerequisite;
- email APIs require explicit server-side role and request authorization hardening.

## 18. Workflow Administration

Admin supports:

- business and department creation and editing;
- soft deactivation instead of destructive deletion;
- user directory assembled from known participants and assignments;
- role assignments by business and department;
- task notification review;
- email diagnostics and test delivery;
- workflow-template audit events.

Seed organization data includes the configured Chun Wo group businesses and departmental structures. Seed values are editable administrative data, not hard-coded product rules.

## 19. Data Model

### 19.1 Core Entities

- User profile and role assignment
- Business unit and department
- Workflow template and version
- Workflow graph node and edge
- Document requirement and field definition
- Extraction sample and training example
- Approval request and workflow snapshot
- Approval task and node decision
- Attachment and parsed field result
- Audit event and notification
- Upload/request draft
- Contributor request
- Shared fulfillment
- Correction request

### 19.2 Operational Tables

The current Supabase schema and migrations include normalized tables for:

- `business_units`
- `departments`
- `profiles`
- `role_assignments`
- `workflow_template_versions`
- `approval_requests`
- `approval_events`
- `approval_attachments`
- `upload_request_drafts`
- `workflow_collaboration_requests`
- `shared_fulfillments`
- `correction_requests`
- `notification_events`
- `workspace_snapshots`

The private Storage bucket is `approval-documents`.

The legacy `supabase/schema.sql` represents an earlier schema and must not be used as the current operational baseline. The v2 schema plus ordered migrations are authoritative.

### 19.3 Snapshot and Normalized Persistence

The current application saves:

- a workspace snapshot for compatibility and recovery;
- normalized workflow, request, event, and attachment records;
- creator-owned request drafts;
- normalized collaboration mirrors.

**Partially implemented:** canonical workflow execution still depends heavily on a client-side task snapshot. Production requires a server-authoritative, transactional command path with optimistic concurrency, idempotency, and conflict handling.

## 20. API Surface

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/sign-in` | POST | Email/password sign-in |
| `/api/auth/sign-up` | POST | Account creation and confirmation flow |
| `/logout` | GET | Session sign-out |
| `/api/attachments/upload` | POST | Private attachment upload |
| `/api/attachments/file` | GET, DELETE | Owner-scoped private attachment retrieval and deletion |
| `/api/parse` | POST | Document parsing and extraction |
| `/api/upload-drafts` | GET, POST, DELETE | Creator-owned request draft persistence |
| `/api/workspace` | GET, POST, PATCH | Load/save workspace and soft-deactivate entities |
| `/api/workflow-collaboration` | POST | Mirror collaboration records |
| `/api/email/task-notifications` | POST | Send task event notifications |
| `/api/email/test` | POST | Send an administrator test email |
| `/api/form-intake` | POST | Validate and process idempotent Microsoft Forms responses from Power Automate |

Authentication middleware protects application routes and Supabase SSR cookies maintain the session.

## 21. Security and Privacy Requirements

### 21.1 Implemented Controls

- Supabase email/password authentication;
- server-side session validation;
- private attachment bucket;
- signed-in, participant-aware storage access policies;
- row-level security on operational tables;
- creator-owned draft access;
- no anonymous access to approval data;
- soft deactivation for core administrative data;
- environment-held provider secrets;
- audit events for workflow actions.

### 21.2 Required Production Hardening

1. Resolve role and scope from trusted server data, not client defaults.
2. Authorize every command against current owner, delegate, candidate, contributor, or administrator status.
3. Make workflow actions transactional and idempotent.
4. Add version checks to prevent two clients from overwriting each other.
5. Apply handoff visibility on the server and storage layer, not only in presentation.
6. Create a durable email and notification outbox with retries and provider identifiers.
7. Add rate limits and abuse protection to parsing, upload, authentication, and email routes.
8. Validate file type, size, malware posture, and retention policy.
9. Record privileged administrative changes in a durable audit log.
10. Review all Supabase policies with production identities and adversarial tests.

## 22. UX and Brand Requirements

### 22.1 Visual Language

The interface follows the supplied Chun Wo brand guide:

- clean white working surfaces;
- orange primary actions and highlights;
- restrained charcoal text and olive/green supporting states;
- official logo treatment;
- minimal decorative styling;
- compact radii and borders;
- high information clarity without nested decorative cards.

The product should not become a one-color orange interface. Orange identifies action and brand; status colors retain semantic meaning.

The interface supports light and dark modes. The user can change theme from the login screen or workspace header. The explicit choice persists in the browser; system preference supplies the initial default when no choice has been saved. Form surfaces, disabled controls, validation states, Canvas controls, and semantic status colors must retain readable contrast in both themes.

### 22.2 Interaction Requirements

- Familiar icons are used for icon actions.
- Tooltips explain advanced or unfamiliar terms.
- Binary settings use toggles or checkboxes.
- Modes and views use tabs or segmented controls.
- Advanced settings remain collapsed by default.
- Destructive actions require clear intent or confirmation.
- Controls have stable dimensions and text never overlaps its container.
- Errors explain what the user can do next.
- Technical parser/provider details stay out of the normal request flow.

### 22.3 Accessibility

- Keyboard access for common controls and Canvas editing where supported;
- visible focus state;
- semantic labels for form controls;
- sufficient contrast in light and dark surfaces, form controls, helper text, validation messages, and status states;
- touch targets suitable for mobile;
- no reliance on color alone for workflow state;
- readable labels at zoom and narrow widths.

## 23. Reliability and Performance

### 23.1 Reliability Requirements

- Draft edits must survive refresh.
- A loaded draft must not create a duplicate autosave.
- Submit and decision commands must be idempotent.
- Parallel joins must not advance twice.
- A rejected cycle must reset only the intended downstream work.
- Sample documents must never leak into real requests.
- Attachment metadata must match stored objects.
- Notification failure must not corrupt workflow state.
- External AI failure must leave a correctable manual path.

### 23.2 Performance Requirements

- Initial authenticated workspace should remain usable while remote state loads.
- Inbox and Tracking lists should remain responsive with realistic request volumes.
- Parsing should show progress and avoid blocking unrelated navigation.
- Large PDF previews should use bounded rendering and release browser resources.
- Canvas should remain responsive for typical departmental workflows.
- Expensive saves should be debounced and unnecessary full-workspace writes reduced.

### 23.3 Observability Requirements

Production should record:

- request and workflow command identifiers;
- parser provider/model, latency, token/cost metadata, and diagnostic ID;
- email provider message identifier and delivery result;
- storage object and attachment correlation;
- workflow version and route decision;
- authorization denial and policy failures;
- scheduler and escalation execution.

## 24. Deployment and Operations

- GitHub is the source repository.
- Vercel builds and hosts preview and production deployments.
- Supabase provides authentication, database, and storage.
- Deployment configuration must preserve environment parity across preview and production.
- Stable Vercel aliases are used so testers do not remain on stale preview URLs.
- The project uses the webpack build path because Turbopack has shown path issues on the network-backed Windows workspace.
- Secrets must remain in local or hosted environment variables and never be committed.

Important environment groups include:

- Supabase URL and publishable/server keys;
- OpenRouter/OpenAI provider and model configuration;
- Resend key, sender, live mode, and optional test redirect;
- public application URL;
- optional E2E credentials and live-test flags.

## 25. Validation and Test Coverage

The codebase currently contains 747 automated tests. Coverage includes:

- graph validation and routing;
- sequential and parallel approval state;
- condition evaluation;
- reject return routing;
- reassignment and delegation;
- contributor and shared fulfillment flows;
- request drafts and autosave identity;
- template lifecycle and versions;
- sample training persistence;
- PDF and spreadsheet parsing;
- upload/request workspace behavior;
- Inbox, Tracking, Workflow, Forms, intermediate-width, mobile, and light/dark UI behavior;
- accessible control labels, placeholder readability, stable touch targets, and dark-theme semantic foregrounds;
- email delivery modes and notification targeting;
- Supabase persistence and normalized records;
- security and row-level policy expectations.

Generated bounded-exhaustive matrices supplement the hand-written scenarios.
They cover all one-to-three-stage linear Approval/FYI layouts, rejection and
resubmission from every linear stage, every approve/reject decision vector for
two- and three-person parallel stages, matching and fallback routes for every
supported numeric operator, all supported upload formats at Submit and Approval
boxes, Form Library source/node/publication boundaries, and every present or
missing combination of approval-stage file, extracted value, and native or
Microsoft form completion.

Release verification must include:

1. all unit and integration tests;
2. lint;
3. production build;
4. authenticated desktop browser smoke test;
5. mobile browser smoke test;
6. new request with real uploaded document;
7. sequential and parallel approval;
8. reject to originator and reject to selected upstream stage;
9. contributor upload and correction;
10. draft refresh and resume;
11. published template version activation;
12. email dry-run or controlled live-delivery verification.
13. Approval-box native form completion, Microsoft Forms response intake, and approval-stage AI/OCR correction.

The release browser audit exercises the six primary screens at 390 px mobile,
900 px intermediate, and 1440 px desktop widths. It checks page-level overflow,
clipped content, accessible control names, placeholder and foreground contrast,
minimum control size, and light/dark theme behavior. Workflow subviews and the
Tracking, notification, handoff, history, and draft controls are checked as
separate interactive states rather than relying only on their default screens.

## 26. Acceptance Criteria by Capability

### 26.1 Workflow Design

- Creator can start from blank or a usable workflow.
- Archived workflows do not appear as copy bases.
- Start and End remain unique and undeletable.
- Only Submit, Approval, FYI, and Condition can be added.
- Validation blocks unsafe publication.
- Published versions are immutable and activatable.

### 26.2 Request Creation

- Only active published templates appear.
- Participant emails are completed or fixed before submit.
- Required documents and fields block incomplete submission.
- Sample files are absent from new requests.
- Draft identity, documents, values, and training edits survive refresh.

### 26.3 Parsing

- Supported files select the correct strategy.
- Parsed values include evidence and confidence when available.
- Manual correction works when AI fails.
- One sample can train multiple fields.
- Manual Extract and Full Auto Detect populate an editable Sample value.

### 26.4 Approval Runtime

- Sequential requests advance once.
- Parallel joins wait for all required peers.
- Unanswered peers remain pending and can become overdue/escalated.
- Reject defaults to originator.
- Advanced reject reopens only valid upstream boxes and resets affected downstream state.
- Delegate retains original ownership.
- Reassign transfers only after acceptance.

### 26.5 Visibility and Audit

- Inbox only shows actionable work.
- Tracking preserves authorized visibility after action.
- Path numbering makes sequential and parallel order clear.
- Every material action and note appears in history.
- Handoff display respects selected values and documents.

### 26.6 Administration and Email

- Organization records can be added, edited, and deactivated.
- Template management is limited to creator or superuser.
- Email mode and provider readiness are visible.
- Test email requires confirmation.
- Failed email remains diagnosable without changing workflow state.

## 27. Known Limitations and Prioritized Backlog

### Priority 0 - Production Safety

- Replace hard-coded client superuser identity with server-derived roles.
- Move workflow decisions to server-authoritative transactional commands.
- Add idempotency and optimistic concurrency.
- Enforce handoff and attachment visibility on the server.
- Add durable scheduled escalation.
- Add durable notification/email outbox and retries.
- Harden authorization on parsing, email, workspace, and collaboration APIs.

### Priority 1 - Pilot Reliability

- Add provider quotas, retry policy, cost controls, and AI observability.
- Add robust file validation, scanning, and retention controls.
- Add real-time or reliable incremental workspace synchronization.
- Normalize remaining role assignments and administrative audit data.
- Add load and concurrency tests using pilot-scale datasets.
- Add operational dashboards for stuck requests, parsing failures, and delivery failures.

### Priority 2 - Product Expansion

- Enterprise SSO and user provisioning.
- Teams or Slack notifications.
- ERP/procurement integrations.
- Complete tenant-side Power Automate setup for each registered Microsoft Form and monitor failed flow runs.
- Add an administrative inbox for `schema_changed` and failed external form submissions.
- Add scheduled Microsoft Forms metadata checks so the library can proactively mark Changed/Broken before the next response.
- Microsoft Forms is the only planned external form platform. Google Forms, Typeform, and Jotform are out of scope unless the product decision is revisited.
- Search, reporting, SLA analytics, and export.
- Read-only workflow visualization optimized for mobile.
- Localization and configurable date/number formats.

## 28. Implementation Traceability

| Capability | Primary implementation area |
| --- | --- |
| Workspace shell and navigation | `src/app/approval-workspace.tsx` and `src/app/use-approval-workspace-state.ts` |
| Request creation and native forms | `src/app/upload-view.tsx`, `src/lib/workflow-native-form-state.ts`, and upload/request libraries |
| Form Library and Microsoft Forms registration | `src/app/form-library.tsx`, `src/lib/form-library-state.ts`, `src/app/api/form-intake`, and `external_form_submissions` migration |
| Inbox actions | `src/app/approval-workspace.tsx`, workspace task-state libraries, and `src/lib/approval-state.ts` |
| Tracking | `src/app/approval-workspace.tsx` and workflow graph/history libraries |
| Workflow Builder and Canvas | `src/app/workflow-view.tsx`, `src/app/workflow-canvas.tsx`, and `src/lib/workflow-graph.ts` |
| Parsing | `src/app/api/parse` and parser/document-preview libraries |
| Draft persistence | `src/app/api/upload-drafts` and draft libraries |
| Workspace persistence | `src/app/api/workspace` and Supabase workspace libraries |
| Collaboration | `src/app/api/workflow-collaboration` and collaboration libraries |
| Email | `src/app/api/email` and email delivery/notification libraries |
| Authentication | auth routes, login page, proxy, and Supabase SSR helpers |
| Database and RLS | `supabase` schema and ordered migrations |
| Automated verification | `src/**/*.test.*`, `tests`, and Playwright scripts |

## 29. Product Decision Summary

The current product direction is:

- one Approval box instead of separate Approval and Review boxes;
- reject routing inside Approval actions instead of a Return/Reject box;
- one fixed Start and one fixed End;
- position-based templates with optional fixed emails;
- request-time participant completion;
- native forms are built and versioned in the Form Library, then attached to workflow boxes, and share the workflow field model;
- Microsoft Forms is the sole external form connector because the organization uses Microsoft 365;
- Microsoft Forms responses enter through Power Automate and the authenticated idempotent intake endpoint; the server processor applies valid responses only after pinned-version, schema, required-input, request-reference, and participant preflight checks;
- all/selected/none document handoff;
- checkbox-based value and document selection;
- simple default handoff with advanced controls collapsed;
- Inbox for action, Tracking for visibility, Workflow for workflow design, Forms for reusable form design, and Drafts for incomplete requests;
- **+ New** for request creation, with no Upload navigation tab;
- flexible contributors, delegation, and acceptance-based reassignment;
- AI-assisted parsing with human correction and reusable examples;
- immutable published versions with explicit activation of any prior published version.

This PRD should be updated whenever code changes alter a user journey, workflow rule, data contract, security boundary, or operational dependency.
