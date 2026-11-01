export type TemplateAuthoringGoldenWorkflow = {
  id: string;
  title: string;
  employeePrompt: string;
  expectedCapabilities: string[];
  requiredInterviewTopics: string[];
  expectedRisk: "standard" | "sensitive" | "high";
};

export const templateAuthoringGoldenWorkflows: TemplateAuthoringGoldenWorkflow[] = [
  {
    id: "purchase-request-linear",
    title: "Department purchase request",
    employeePrompt:
      "Staff submit a quotation and amount. The department head approves, then Finance approves purchases over HKD 50,000.",
    expectedCapabilities: [
      "linear_approval",
      "conditional_routing",
      "file_requirements",
      "request_fields",
    ],
    requiredInterviewTopics: [
      "currency and threshold",
      "quotation formats",
      "Finance assignee",
      "rejection return target",
    ],
    expectedRisk: "standard",
  },
  {
    id: "capex-parallel",
    title: "Capital expenditure with parallel review",
    employeePrompt:
      "Engineering and Finance review in parallel. Both must approve before the Managing Director.",
    expectedCapabilities: [
      "parallel_approval",
      "conditional_routing",
      "sla_escalation",
    ],
    requiredInterviewTopics: [
      "parallel approval rule",
      "unresolved reviewer behavior",
      "final approver",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "invoice-three-way-match",
    title: "Invoice three-way match",
    employeePrompt:
      "Accounts Payable needs an invoice, purchase order, and delivery note. Extract totals and flag mismatches before approval.",
    expectedCapabilities: [
      "file_requirements",
      "attachment_extraction",
      "conditional_routing",
    ],
    requiredInterviewTopics: [
      "required documents",
      "matching tolerance",
      "mismatch owner",
      "extraction review",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "employee-expense",
    title: "Employee expense reimbursement",
    employeePrompt:
      "Employees submit receipts and expense details. Their manager approves, and Finance receives FYI when paid.",
    expectedCapabilities: [
      "request_fields",
      "file_requirements",
      "linear_approval",
      "fyi",
    ],
    requiredInterviewTopics: [
      "manager resolution",
      "receipt rules",
      "Finance FYI timing",
    ],
    expectedRisk: "standard",
  },
  {
    id: "leave-request",
    title: "Leave request",
    employeePrompt:
      "An employee requests leave. The line manager approves and HR is informed. Medical leave needs a certificate.",
    expectedCapabilities: [
      "request_fields",
      "conditional_routing",
      "file_requirements",
      "fyi",
    ],
    requiredInterviewTopics: [
      "leave type",
      "certificate trigger",
      "manager resolution",
      "HR notification",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "new-vendor-onboarding",
    title: "New vendor onboarding",
    employeePrompt:
      "Procurement collects registration, bank, insurance, and compliance files. Finance and Compliance review before activation.",
    expectedCapabilities: [
      "template_submitters",
      "file_requirements",
      "parallel_approval",
      "shared_confirmation",
    ],
    requiredInterviewTopics: [
      "submitter ownership",
      "bank-data classification",
      "confirmation policy",
      "activation authority",
    ],
    expectedRisk: "high",
  },
  {
    id: "contract-review",
    title: "Contract review",
    employeePrompt:
      "A requester uploads a contract. Legal reviews it, Finance reviews commercial terms, and an executive signs off above a threshold.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "conditional_routing",
      "reject_return",
    ],
    requiredInterviewTopics: [
      "threshold field",
      "legal and Finance routing",
      "correction loop",
      "signature limitation",
    ],
    expectedRisk: "high",
  },
  {
    id: "tender-submission",
    title: "Tender submission authorization",
    employeePrompt:
      "Bid, commercial, and technical teams contribute documents with due dates. The bid manager confirms each set before executive approval.",
    expectedCapabilities: [
      "template_submitters",
      "ad_hoc_contributors",
      "shared_confirmation",
      "sla_escalation",
    ],
    requiredInterviewTopics: [
      "document owners",
      "confirmation decision makers",
      "correction deadline",
      "executive approver",
    ],
    expectedRisk: "high",
  },
  {
    id: "site-access",
    title: "Construction site access",
    employeePrompt:
      "A sponsor requests access for a worker, with safety certificates and insurance. Safety and Security approve.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "directory_resolution",
    ],
    requiredInterviewTopics: [
      "sponsor",
      "document expiry",
      "Safety and Security owners",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "method-statement",
    title: "Method statement review",
    employeePrompt:
      "A subcontractor provides a method statement and risk assessment. Site, Safety, and Engineering review, with corrections until accepted.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "reject_return",
      "shared_confirmation",
    ],
    requiredInterviewTopics: [
      "external submitter",
      "review sequence",
      "return owner",
      "acceptance rule",
    ],
    expectedRisk: "high",
  },
  {
    id: "design-change",
    title: "Engineering design change",
    employeePrompt:
      "Engineering proposes a drawing change. Cost, programme, and safety impacts are reviewed in parallel before approval.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "request_fields",
      "visibility",
    ],
    requiredInterviewTopics: [
      "drawing version",
      "impact reviewers",
      "approval count",
      "participant visibility",
    ],
    expectedRisk: "high",
  },
  {
    id: "subcontractor-payment",
    title: "Subcontractor payment certificate",
    employeePrompt:
      "Quantity Surveying prepares a payment certificate. Site confirms progress, Finance verifies deductions, and a director approves.",
    expectedCapabilities: [
      "template_submitters",
      "attachment_extraction",
      "linear_approval",
      "shared_confirmation",
    ],
    requiredInterviewTopics: [
      "certificate owner",
      "progress evidence",
      "deduction fields",
      "confirmation policy",
    ],
    expectedRisk: "high",
  },
  {
    id: "it-access-request",
    title: "IT system access",
    employeePrompt:
      "A manager requests system roles for a staff member. The data owner and IT Security approve privileged access.",
    expectedCapabilities: [
      "request_fields",
      "conditional_routing",
      "parallel_approval",
      "targeted_notifications",
    ],
    requiredInterviewTopics: [
      "role catalogue",
      "privileged-access trigger",
      "data owner",
      "access expiry",
    ],
    expectedRisk: "high",
  },
  {
    id: "data-export",
    title: "Confidential data export",
    employeePrompt:
      "Staff request an export of confidential data. The data owner, Privacy, and Information Security must approve.",
    expectedCapabilities: [
      "parallel_approval",
      "request_fields",
      "visibility",
      "targeted_notifications",
    ],
    requiredInterviewTopics: [
      "data classification",
      "export purpose",
      "recipients",
      "retention",
    ],
    expectedRisk: "high",
  },
  {
    id: "policy-exception",
    title: "Corporate policy exception",
    employeePrompt:
      "An employee requests an exception with business justification and an expiry date. Risk and policy owners approve.",
    expectedCapabilities: [
      "request_fields",
      "parallel_approval",
      "sla_escalation",
    ],
    requiredInterviewTopics: [
      "policy reference",
      "expiry",
      "compensating controls",
      "renewal behavior",
    ],
    expectedRisk: "high",
  },
  {
    id: "marketing-publication",
    title: "External publication review",
    employeePrompt:
      "Marketing submits copy and artwork. Brand and Legal review; an executive approves high-profile campaigns.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "conditional_routing",
      "fyi",
    ],
    requiredInterviewTopics: [
      "campaign classification",
      "asset formats",
      "executive trigger",
      "publication FYI",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "customer-credit-limit",
    title: "Customer credit limit",
    employeePrompt:
      "Sales requests a credit limit. Finance approves normal limits and a director approves limits above HKD 1 million.",
    expectedCapabilities: [
      "request_fields",
      "conditional_routing",
      "linear_approval",
    ],
    requiredInterviewTopics: [
      "currency",
      "limit thresholds",
      "customer evidence",
      "director scope",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "asset-disposal",
    title: "Asset disposal",
    employeePrompt:
      "A department proposes disposal with photos and valuation. Finance and Sustainability review before approval.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "attachment_extraction",
    ],
    requiredInterviewTopics: [
      "asset identifier",
      "valuation evidence",
      "disposal method",
      "approvers",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "incident-corrective-action",
    title: "Incident corrective action closure",
    employeePrompt:
      "An owner uploads evidence for corrective actions. Safety reviews each action and rejects incomplete evidence for correction.",
    expectedCapabilities: [
      "template_submitters",
      "file_requirements",
      "shared_confirmation",
      "reject_return",
    ],
    requiredInterviewTopics: [
      "action owners",
      "evidence per action",
      "closure authority",
      "correction behavior",
    ],
    expectedRisk: "high",
  },
  {
    id: "training-course",
    title: "External training approval",
    employeePrompt:
      "An employee requests a course. The manager approves, then HR approves courses above a cost threshold.",
    expectedCapabilities: [
      "request_fields",
      "conditional_routing",
      "file_requirements",
    ],
    requiredInterviewTopics: [
      "course evidence",
      "cost threshold",
      "manager resolution",
      "completion evidence",
    ],
    expectedRisk: "standard",
  },
  {
    id: "travel-request",
    title: "Business travel request",
    employeePrompt:
      "Staff request travel with estimated cost and itinerary. International travel adds Security review before manager and Finance approval.",
    expectedCapabilities: [
      "request_fields",
      "file_requirements",
      "conditional_routing",
      "linear_approval",
    ],
    requiredInterviewTopics: [
      "domestic versus international",
      "itinerary",
      "cost fields",
      "Security review",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "charitable-donation",
    title: "Charitable donation",
    employeePrompt:
      "Corporate Affairs requests a donation. Compliance verifies the beneficiary and Finance and an executive approve.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "linear_approval",
    ],
    requiredInterviewTopics: [
      "beneficiary due diligence",
      "amount",
      "conflict checks",
      "executive approver",
    ],
    expectedRisk: "high",
  },
  {
    id: "visitor-event",
    title: "Corporate visitor event",
    employeePrompt:
      "An organizer requests a visitor event. Security reviews the guest list and Facilities confirms the venue.",
    expectedCapabilities: [
      "file_requirements",
      "parallel_approval",
      "template_submitters",
      "fyi",
    ],
    requiredInterviewTopics: [
      "guest-list classification",
      "organizer",
      "venue owner",
      "arrival FYI",
    ],
    expectedRisk: "sensitive",
  },
  {
    id: "emergency-procurement",
    title: "Emergency procurement",
    employeePrompt:
      "Emergency purchases may proceed before normal approval, but require justification, retrospective Finance review, and director approval within 24 hours.",
    expectedCapabilities: [
      "conditional_routing",
      "sla_escalation",
      "file_requirements",
      "visibility",
    ],
    requiredInterviewTopics: [
      "emergency criteria",
      "retrospective control",
      "24-hour escalation",
      "audit evidence",
    ],
    expectedRisk: "high",
  },
];
