export type ParserStrategy = "image-ai" | "pdf-ocr" | "excel-table";

export type ApprovalAction =
  | "approve"
  | "approve_with_comment"
  | "reject_with_comment"
  | "reassign"
  | "delegate";

export type WorkflowField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "currency" | "table";
  required: boolean;
  source: "ai" | "ocr" | "excel" | "manual";
  instructions: string;
};

export type WorkflowStep = {
  name: string;
  role: string;
  department: string;
  dueInHours: number;
  escalationRole: string;
  condition: string;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  department: string;
  documentTypes: string[];
  languages: string[];
  fields: WorkflowField[];
  steps: WorkflowStep[];
};

export type ApprovalTask = {
  id: string;
  title: string;
  workflow: string;
  requester: string;
  department: string;
  status: "pending" | "overdue" | "escalated";
  due: string;
  value: string;
  currentStep: string;
  extractedFields: Record<string, string>;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
};
