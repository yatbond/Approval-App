export type ParserStrategy = "image-ai" | "pdf-ocr" | "excel-table";

export type ApprovalAction =
  | "approve"
  | "approve_with_comment"
  | "reject"
  | "reject_with_comment"
  | "reassign"
  | "delegate"
  | "amend_resubmit"
  | "cancel";

export type ApprovalStatus =
  | "pending"
  | "overdue"
  | "escalated"
  | "approved"
  | "returned"
  | "reassigned"
  | "delegated"
  | "cancelled";

export type ApprovalActor = {
  name: string;
  email: string;
};

export type AuditEvent = {
  id: string;
  action:
    | "submitted"
    | "assigned"
    | "approved"
    | "rejected"
    | "reassigned"
    | "delegated"
    | "escalated"
    | "amended"
    | "resubmitted"
    | "cancelled";
  actor: string;
  actorEmail: string;
  timestamp: string;
  detail: string;
  targetEmail?: string;
};

export type WorkflowField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "currency" | "table";
  required: boolean;
  source: "ai" | "ocr" | "excel" | "manual";
  instructions: string;
  documentId?: string;
};

export type DocumentFormat = "text" | "pdf" | "image" | "excel_csv";

export type WorkflowDocumentRequirement = {
  id: string;
  documentType: string;
  format: DocumentFormat;
  required: boolean;
  fields: WorkflowField[];
};

export type ApprovalAttachment = {
  id: string;
  fileName: string;
  documentId?: string;
  documentType: string;
  format: DocumentFormat | "ad_hoc";
  workflowNodeId?: string;
  storagePath?: string;
  publicUrl?: string;
  uploadedBy: string;
  uploadedAt: string;
};

export type WorkflowStep = {
  name: string;
  role: string;
  approverName: string;
  approverEmail: string;
  department: string;
  dueInHours: number;
  escalationRole: string;
  escalationName: string;
  escalationEmail: string;
  condition: string;
};

export type WorkflowNodeKind =
  | "start"
  | "approval"
  | "review"
  | "for_information"
  | "condition"
  | "return_reject"
  | "end";

export type WorkflowRuleOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains";

export type WorkflowBranchType =
  | "main"
  | "approved"
  | "rejected"
  | "condition"
  | "for_information";

export type WorkflowApprovalRule = {
  upstreamNodeIds: string[];
  minimumApproved: number;
  mode?: "at_least" | "exactly";
};

export type WorkflowNumericRule = {
  field: string;
  operator: WorkflowRuleOperator;
  value: string;
};

export type WorkflowConditionCase = {
  id: string;
  name: string;
  isFallback?: boolean;
  isApprovalCount?: boolean;
  approvalRule?: WorkflowApprovalRule;
  numericRule?: WorkflowNumericRule;
  join: "and" | "or";
  targetNodeIds: string[];
};

export type WorkflowBranchRule = {
  field: string;
  operator: WorkflowRuleOperator;
  value: string;
  approvalRule?: WorkflowApprovalRule;
  join?: "and" | "or";
};

export type WorkflowGraphNode = {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  x: number;
  y: number;
  assigneeName?: string;
  assigneeEmail?: string;
  dueInHours?: number;
  escalationName?: string;
  escalationEmail?: string;
  documentIds?: string[];
  blocking?: boolean;
  acknowledgementRequired?: boolean;
  conditionCases?: WorkflowConditionCase[];
};

export type WorkflowGraphEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  branchType: WorkflowBranchType;
  rule?: WorkflowBranchRule;
  blocking?: boolean;
};

export type WorkflowGraph = {
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  business: string;
  department: string;
  version?: number;
  isDraft?: boolean;
  publishedAt?: string;
  sourceTemplateId?: string;
  documentTypes: string[];
  documents: WorkflowDocumentRequirement[];
  languages: string[];
  fields: WorkflowField[];
  steps: WorkflowStep[];
  graph?: WorkflowGraph;
};

export type BusinessUnit = {
  id: string;
  name: string;
  departments: string[];
};

export type UserRole =
  | "superuser"
  | "originator"
  | "approver"
  | "reviewer"
  | "fyi"
  | "current actor"
  | "previous actor"
  | "participant";

export type UserRoleAssignment = {
  name: string;
  email: string;
  role: UserRole;
  businessId: string;
  department: string;
};

export type ApprovalTask = {
  id: string;
  title: string;
  workflow: string;
  workflowTemplateId?: string;
  workflowTemplateVersion?: number;
  workflowTemplateSnapshot?: WorkflowTemplate;
  requester: string;
  requesterEmail: string;
  department: string;
  status: ApprovalStatus;
  due: string;
  dueAt?: string;
  value: string;
  currentStep: string;
  currentOwner: string;
  currentNodeId?: string;
  pendingNodeIds?: string[];
  pendingOwners?: string[];
  completedNodeIds?: string[];
  notifiedNodeIds?: string[];
  nodeDecisions?: Record<string, "approved" | "rejected">;
  activeBranchId?: string;
  participants: string[];
  lastAction: string;
  extractedFields: Record<string, string>;
  attachments?: ApprovalAttachment[];
  auditTrail: AuditEvent[];
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};
