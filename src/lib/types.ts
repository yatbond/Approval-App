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
  | "accept_reassignment"
  | "decline_reassignment"
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

export type TaskReassignmentRequest = {
  id: string;
  fromEmail: string;
  toEmail: string;
  status: "requested" | "accepted" | "declined" | "cancelled";
  requestedAt: string;
  decidedAt?: string;
  decisionNote?: string;
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
  type:
    | "text"
    | "long_text"
    | "number"
    | "date"
    | "currency"
    | "email"
    | "select"
    | "radio"
    | "checkbox"
    | "table";
  required: boolean;
  source: "ai" | "ocr" | "excel" | "manual";
  instructions: string;
  placeholder?: string;
  options?: string[];
  documentId?: string;
  inputSource?: FormLibraryFieldInputSource;
  externalQuestionLabel?: string;
  attachmentFieldName?: string;
  examples?: ExtractionTrainingExample[];
};

export type FormLibrarySource = "native" | "microsoft_forms";
export type FormLibraryFieldInputSource =
  | "approval_app"
  | "microsoft_forms"
  | "attachment_extraction";
export type FormLibraryStatus =
  | "setup_required"
  | "ready"
  | "changed"
  | "broken"
  | "archived";
export type FormLibraryResponseMode =
  | "manual"
  | "start_workflow"
  | "complete_node";
export type FormParticipantResolutionSource =
  | "fixed_template"
  | "responder"
  | "form_field"
  | "directory_position"
  | "manual";

export type FormParticipantMapping = {
  nodeId: string;
  source: FormParticipantResolutionSource;
  fieldName?: string;
};

export type FormLibraryAttachmentField = {
  name: string;
  label: string;
  required: boolean;
};

export type FormLayoutItem = {
  fieldName: string;
  width: "full" | "half";
};

export type FormLayoutSection = {
  id: string;
  title: string;
  description?: string;
  items: FormLayoutItem[];
};

export type FormLayout = {
  sections: FormLayoutSection[];
};

export type FormLibraryDefinition = {
  id: string;
  formKey: string;
  name: string;
  description?: string;
  business?: string;
  department?: string;
  source: FormLibrarySource;
  version: number;
  versionComment?: string;
  isDraft?: boolean;
  isActiveVersion?: boolean;
  status: FormLibraryStatus;
  fields: WorkflowField[];
  layout?: FormLayout;
  attachmentFields?: FormLibraryAttachmentField[];
  responseMode: FormLibraryResponseMode;
  responseUrl?: string;
  embedUrl?: string;
  externalFormId?: string;
  schemaFingerprint?: string;
  targetWorkflowTemplateId?: string;
  participantMappings?: FormParticipantMapping[];
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowFormLibraryReference = {
  definitionId: string;
  formKey: string;
  version: number;
  source: FormLibrarySource;
  responseMode: FormLibraryResponseMode;
  responseUrl?: string;
  embedUrl?: string;
  externalFormId?: string;
  schemaFingerprint?: string;
  completionRequired: boolean;
  selectedFieldNames: string[];
  selectedAttachmentNames: string[];
  attachmentFields?: FormLibraryAttachmentField[];
  layout?: FormLayout;
};

export type ExternalFormResponseRecord = {
  provider: "microsoft_forms";
  formKey: string;
  formVersion: number;
  definitionId: string;
  externalResponseId: string;
  responseMode: "start_workflow" | "complete_node";
  status: "received" | "applied";
  answers: Record<string, string>;
  attachmentIds: string[];
  respondentEmail?: string;
  submittedAt: string;
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
  anchor?: {
    pageNumber: number;
    rect: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    nearbyText?: string;
  };
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
  sample?: WorkflowDocumentSample;
  formLibraryRef?: WorkflowFormLibraryReference;
};

export type WorkflowDocumentSamplePage = {
  pageNumber: number;
  mimeType: string;
  imageBase64?: string;
  storagePath?: string;
  pageText?: string;
};

export type WorkflowDocumentSample = {
  fileName: string;
  mimeType: string;
  previewPages: WorkflowDocumentSamplePage[];
  pageImages?: WorkflowDocumentSamplePage[];
  savedAt: string;
  trainingDraft?: WorkflowDocumentSampleTrainingDraft;
};

export type WorkflowDocumentSampleTrainingDraft = {
  selectedFieldName: string;
  newFieldLabel?: string;
  instructions: string;
  value: string;
  evidence?: string;
  anchor?: ExtractionTrainingExample["anchor"];
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

export type WorkflowHandoffCalculation = "difference" | "percentage_difference";

export type WorkflowHandoffComparisonProcess = {
  id: string;
  type: "comparison";
  label: string;
  leftField: string;
  operator: WorkflowRuleOperator;
  rightField: string;
};

export type WorkflowHandoffCalculationProcess = {
  id: string;
  type: "calculation";
  label: string;
  calculation: WorkflowHandoffCalculation;
  leftField: string;
  rightField: string;
};

export type WorkflowHandoffProcess =
  | WorkflowHandoffComparisonProcess
  | WorkflowHandoffCalculationProcess;

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
  assigneeEmailFixed?: boolean;
  dueInHours?: number;
  escalationName?: string;
  escalationEmail?: string;
  escalationEmailFixed?: boolean;
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
  databaseVersionId?: string;
  name: string;
  business: string;
  department: string;
  version?: number;
  isDraft?: boolean;
  isActiveVersion?: boolean;
  versionComment?: string;
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
  stateVersion?: number;
  availableActions?: ApprovalAction[];
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
  externalFormResponses?: ExternalFormResponseRecord[];
  collaborationRequests?: TaskCollaborationRequest[];
  sharedFulfillments?: TaskSharedFulfillment[];
  correctionRequests?: TaskCorrectionRequest[];
  reassignmentRequests?: TaskReassignmentRequest[];
  auditTrail: AuditEvent[];
};

export type AdminAuditEventAction =
  | "template_created"
  | "template_updated"
  | "template_published"
  | "template_duplicated"
  | "template_archived"
  | "template_activated";

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
