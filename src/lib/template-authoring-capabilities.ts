export type TemplateAuthoringCapabilityStatus =
  | "supported"
  | "guardrailed"
  | "phase_1"
  | "phase_2"
  | "future";

export type TemplateAuthoringCapability = {
  id: string;
  area: string;
  capability: string;
  status: TemplateAuthoringCapabilityStatus;
  evidence: string;
  authoringRule: string;
};

export const templateAuthoringCapabilities: TemplateAuthoringCapability[] = [
  {
    id: "linear_approval",
    area: "Routing",
    capability: "Sequential submission, review, and approval stages",
    status: "supported",
    evidence: "Workflow graph nodes, edges, validator, simulator, and runtime routing",
    authoringRule: "Generate an explicit Start-to-End route with no orphaned stage.",
  },
  {
    id: "parallel_approval",
    area: "Routing",
    capability: "Parallel approvals with fan-in decisions",
    status: "supported",
    evidence: "Parallel start routes and approval-count condition cases",
    authoringRule: "State the required approval count and unresolved-case behavior.",
  },
  {
    id: "conditional_routing",
    area: "Routing",
    capability: "Numeric, text, fallback, and approval-count conditions",
    status: "supported",
    evidence: "Condition cases, numeric rules, coverage and overlap validation",
    authoringRule: "Every condition needs exhaustive or fallback coverage.",
  },
  {
    id: "reject_return",
    area: "Routing",
    capability: "Reject, return, amend, and resubmit loops",
    status: "supported",
    evidence: "Rejected branches, return-reject nodes, runtime amend/resubmit",
    authoringRule: "Name the permitted return targets and correction owner.",
  },
  {
    id: "fyi",
    area: "Routing",
    capability: "Non-blocking for-information recipients with optional acknowledgement",
    status: "supported",
    evidence: "For-information nodes and non-blocking branches",
    authoringRule: "FYI routes must never block unless acknowledgement is explicit.",
  },
  {
    id: "request_fields",
    area: "Inputs",
    capability: "Typed request fields and native forms",
    status: "supported",
    evidence: "Workflow fields, native form sections, form layout and validation",
    authoringRule: "Ask for type, required state, options, and source.",
  },
  {
    id: "file_requirements",
    area: "Inputs",
    capability: "Required and optional PDF, image, text, and spreadsheet uploads",
    status: "supported",
    evidence: "Workflow document requirements and attachment gate matrix",
    authoringRule: "Ask when the file is required and which stage owns it.",
  },
  {
    id: "attachment_extraction",
    area: "Inputs",
    capability: "AI, OCR, and spreadsheet field extraction",
    status: "supported",
    evidence: "Parser strategies, extraction fields, examples, and correction UI",
    authoringRule: "Treat model extraction as proposed data until user review.",
  },
  {
    id: "form_library",
    area: "Inputs",
    capability: "Pinned native and Microsoft Forms definitions",
    status: "supported",
    evidence: "Form Library versions and workflow references",
    authoringRule: "Only attach a published active form version.",
  },
  {
    id: "template_submitters",
    area: "Collaboration",
    capability: "Multiple template-defined submit boxes",
    status: "supported",
    evidence: "Parallel submit nodes and shared fulfillment policy",
    authoringRule: "Ask which documents and confirmation policy belong to each submitter.",
  },
  {
    id: "ad_hoc_contributors",
    area: "Collaboration",
    capability: "Invite contributors by email with a note and due date",
    status: "supported",
    evidence: "Authoritative collaboration commands and contributor requests",
    authoringRule: "Ask whether contribution blocks the approval stage.",
  },
  {
    id: "shared_confirmation",
    area: "Collaboration",
    capability: "First-decision confirmation and correction loops",
    status: "supported",
    evidence: "Shared fulfillment, confirmation, rejection, and correction state",
    authoringRule: "Default to first decision wins and block downstream work on rejection.",
  },
  {
    id: "directory_resolution",
    area: "Participants",
    capability: "Fixed, request-time, and directory-derived participants",
    status: "guardrailed",
    evidence: "Request participant mapping and directory validation",
    authoringRule: "Do not invent people; unresolved participants stay explicit.",
  },
  {
    id: "sla_escalation",
    area: "Operations",
    capability: "Stage due hours and escalation recipients",
    status: "supported",
    evidence: "Node due hours, escalation routing, overdue scheduler",
    authoringRule: "Ask for business hours versus elapsed hours; use elapsed until calendars exist.",
  },
  {
    id: "visibility",
    area: "Governance",
    capability: "Broad participant tracking visibility",
    status: "supported",
    evidence: "Participant visibility and tracking projections",
    authoringRule: "Default to all participants for status visibility.",
  },
  {
    id: "targeted_notifications",
    area: "Governance",
    capability: "Important-change notifications to directly involved people",
    status: "supported",
    evidence: "Event-derived notification recipients and durable outbox",
    authoringRule: "Default to sparse, event-driven notifications.",
  },
  {
    id: "draft_revision",
    area: "Authoring API",
    capability: "Optimistic, idempotent, whole-definition draft replacement",
    status: "phase_1",
    evidence: "New server-authoritative draft service",
    authoringRule: "Every mutation carries expectedRevision and idempotencyKey.",
  },
  {
    id: "publish_review",
    area: "Authoring API",
    capability: "Publish request separated from activation",
    status: "phase_1",
    evidence: "New publish-request and immutable version service",
    authoringRule: "Agents may propose; only authorized humans may publish or activate.",
  },
  {
    id: "openapi",
    area: "Authoring API",
    capability: "Stable REST/OpenAPI contract for internal and external agents",
    status: "phase_1",
    evidence: "New versioned API and generated specification",
    authoringRule: "Expose intent-level commands, never raw database writes.",
  },
  {
    id: "requirements_interview",
    area: "Copilot",
    capability: "Adaptive interview backed by a deterministic requirements ledger",
    status: "phase_2",
    evidence: "New embedded Copilot",
    authoringRule: "The model asks; coded state decides what is complete.",
  },
  {
    id: "copilot_tools",
    area: "Copilot",
    capability: "Validate, simulate, diff, save draft, and request publication",
    status: "phase_2",
    evidence: "API-backed, auditable tools",
    authoringRule: "No direct database or publish tool is available to the model.",
  },
  {
    id: "copilot_attachments",
    area: "Copilot",
    capability: "Requirements-document upload and extraction",
    status: "phase_2",
    evidence: "Bounded private upload pipeline with content scanning",
    authoringRule: "Files are untrusted input and never become system instructions.",
  },
  {
    id: "business_calendar_sla",
    area: "Operations",
    capability: "Holiday- and shift-aware SLA calculations",
    status: "future",
    evidence: "Not represented in current runtime",
    authoringRule: "Record as an explicit unresolved requirement.",
  },
  {
    id: "electronic_signature",
    area: "Compliance",
    capability: "Regulated electronic signatures",
    status: "future",
    evidence: "No signature provider or non-repudiation contract exists",
    authoringRule: "Do not claim a standard approval action is an e-signature.",
  },
];

export function getTemplateAuthoringCapability(id: string) {
  return templateAuthoringCapabilities.find((capability) => capability.id === id);
}
