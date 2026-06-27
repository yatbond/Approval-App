export type ParserStrategy = "image-ai" | "pdf-ocr" | "excel-table";
export type ExtractionConfidence = "high" | "medium" | "low";

export type ExtractedFieldSuggestion = {
  name: string;
  label: string;
  value: string;
  confidence: ExtractionConfidence;
  evidence: string;
  instructions: string;
};

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
    | "cancelled"
    | "contribution_requested"
    | "contribution_submitted"
    | "shared_fulfillment_submitted"
    | "shared_fulfillment_confirmed"
    | "shared_fulfillment_rejected"
    | "correction_requested"
    | "correction_submitted";
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
  examples?: ExtractionTrainingExample[];
};

export type ExtractionTrainingExample = {
  id: string;
  templateId: string;
  documentId?: string;
  documentType?: string;
  fieldLabel: string;
  originalValue: string;
  correctedValue: string;
  evidence?: string;
  sourceFileName?: string;
  createdByEmail: string;
  createdAt: string;
};

export type DocumentFormat = "text" | "pdf" | "image" | "excel_csv";
export type WorkflowDocumentInputMode = "upload" | "manual_form";

export type WorkflowDocumentRequirement = {
  id: string;
  documentType: string;
  format: DocumentFormat;
  inputMode?: WorkflowDocumentInputMode;
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

export type TaskCollaborationRequest = {
  id: string;
  contributorName: string;
  contributorEmail: string;
  requestedByName: string;
  requestedByEmail: string;
  requestNote: string;
  dueAt: string;
  blocksApproval?: boolean;
  status: "requested" | "submitted" | "cancelled";
  createdAt: string;
  submittedAt?: string;
  attachmentIds?: string[];
  extractedFields?: Record<string, string>;
};

export type TaskSharedFulfillmentStatus =
  | "pending_confirmation"
  | "confirmed"
  | "rejected"
  | "superseded";

export type TaskSharedFulfillment = {
  id: string;
  taskId: string;
  requirementNodeId: string;
  documentId: string;
  documentType: string;
  assignedSubmitterEmail: string;
  assignedSubmitterName: string;
  uploaderEmail: string;
  uploaderName: string;
  attachmentId: string;
  required: boolean;
  status: TaskSharedFulfillmentStatus;
  submittedAt: string;
  decidedAt?: string;
  decidedByEmail?: string;
  decidedByName?: string;
  decisionRole?: "current_actor" | "assigned_submitter";
  decisionNote?: string;
  correctionRequestId?: string;
};

export type TaskCorrectionRequest = {
  id: string;
  taskId: string;
  sharedFulfillmentId: string;
  requestedByEmail: string;
  requestedByName: string;
  assignedSubmitterEmail: string;
  uploaderEmail: string;
  rejectionNote: string;
  status: "requested" | "submitted" | "cancelled";
  blocksApproval: boolean;
  createdAt: string;
  submittedAt?: string;
  resolvedByFulfillmentId?: string;
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
  | "submit_request"
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

export type WorkflowHandoffFieldVisibility = {
  mode: "all" | "selected" | "hidden";
  fieldNames?: string[];
};

export type WorkflowHandoffDocumentVisibility = {
  mode: "all" | "selected" | "required_for_node" | "none";
  documentIds?: string[];
};

export type WorkflowHandoffLayout = "standard" | "compact" | "comparison";

export type WorkflowHandoffProcess = {
  id: string;
  type: "comparison";
  label: string;
  leftField: string;
  operator: WorkflowRuleOperator;
  rightField: string;
};

export type WorkflowHandoffView = {
  fieldVisibility?: WorkflowHandoffFieldVisibility;
  documentVisibility?: WorkflowHandoffDocumentVisibility;
  layout?: WorkflowHandoffLayout;
  processes?: WorkflowHandoffProcess[];
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
  allowSharedFulfillment?: boolean;
  requireSharedFulfillmentConfirmation?: boolean;
  blocking?: boolean;
  acknowledgementRequired?: boolean;
  conditionCases?: WorkflowConditionCase[];
  handoffView?: WorkflowHandoffView;
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
  createdByEmail?: string;
  createdByName?: string;
  createdAt?: string;
  updatedByEmail?: string;
  updatedAt?: string;
  isArchived?: boolean;
  archivedAt?: string;
  archivedByEmail?: string;
  documentTypes: string[];
  documents: WorkflowDocumentRequirement[];
  languages: string[];
  fields: WorkflowField[];
  extractionExamples?: ExtractionTrainingExample[];
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
  collaborationRequests?: TaskCollaborationRequest[];
  sharedFulfillments?: TaskSharedFulfillment[];
  correctionRequests?: TaskCorrectionRequest[];
  auditTrail: AuditEvent[];
};

export type AdminAuditEventAction =
  | "template_created"
  | "template_updated"
  | "template_published"
  | "template_duplicated"
  | "template_archived";

export type AdminAuditEvent = {
  id: string;
  action: AdminAuditEventAction;
  actor: string;
  actorEmail: string;
  timestamp: string;
  detail: string;
  templateId: string;
  templateName: string;
  templateVersion: number;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};
