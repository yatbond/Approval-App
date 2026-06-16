import type { ApprovalTask, NotificationItem, WorkflowTemplate } from "@/lib/types";

export const departments = [
  "Finance",
  "Human Resources",
  "Procurement",
  "Operations",
  "Legal",
  "Sales",
  "IT",
  "Administration",
];

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "finance-invoice",
    name: "Finance invoice approval",
    department: "Finance",
    documentTypes: ["Invoice PDF", "Invoice photo", "Excel schedule"],
    languages: ["English", "Traditional Chinese", "Simplified Chinese"],
    fields: [
      {
        name: "vendor",
        label: "Vendor",
        type: "text",
        required: true,
        source: "ai",
        instructions: "Extract the supplier or vendor legal name.",
      },
      {
        name: "invoice_total",
        label: "Invoice total",
        type: "currency",
        required: true,
        source: "ocr",
        instructions: "Use the grand total including tax.",
      },
      {
        name: "line_items",
        label: "Line items",
        type: "table",
        required: false,
        source: "excel",
        instructions: "Keep item, quantity, unit price, and subtotal columns.",
      },
    ],
    steps: [
      {
        name: "Department review",
        role: "Department reviewer",
        department: "Finance",
        dueInHours: 24,
        escalationRole: "Finance manager",
        condition: "Always",
      },
      {
        name: "Supervisor endorsement",
        role: "Supervisor",
        department: "Requester department",
        dueInHours: 48,
        escalationRole: "Department head",
        condition: "Always",
      },
      {
        name: "CFO approval",
        role: "CFO delegate",
        department: "Finance",
        dueInHours: 24,
        escalationRole: "CFO",
        condition: "invoice_total >= 10000",
      },
    ],
  },
];

export const approvalTasks: ApprovalTask[] = [
  {
    id: "APR-1048",
    title: "Cloud subscription invoice",
    workflow: "Finance invoice approval",
    requester: "Mandy Chan",
    department: "IT",
    status: "pending",
    due: "Today, 17:00",
    value: "HKD 8,400",
    currentStep: "Department review",
    extractedFields: {
      Vendor: "Northstar Cloud Limited",
      "Invoice no.": "INV-2026-0612",
      Total: "HKD 8,400",
      Language: "English",
    },
  },
  {
    id: "APR-1042",
    title: "Office renovation progress photos",
    workflow: "Operations site endorsement",
    requester: "Leo Wong",
    department: "Operations",
    status: "overdue",
    due: "Yesterday, 15:00",
    value: "Photo evidence",
    currentStep: "Supervisor endorsement",
    extractedFields: {
      Location: "Kwun Tong office",
      "Observed work": "Ceiling and cabling progress",
      Risk: "Moderate",
      Language: "Mixed Chinese and English",
    },
  },
  {
    id: "APR-1039",
    title: "Quarterly training expense sheet",
    workflow: "HR training reimbursement",
    requester: "Suki Lee",
    department: "Human Resources",
    status: "escalated",
    due: "Escalated 2h ago",
    value: "12 rows",
    currentStep: "Finance verification",
    extractedFields: {
      "Sheet count": "3",
      "Rows parsed": "12",
      Total: "HKD 21,980",
      Language: "Traditional Chinese",
    },
  },
];

export const notifications: NotificationItem[] = [
  {
    id: "N-1",
    title: "Approval due soon",
    body: "APR-1048 is due today at 17:00.",
    time: "12 min ago",
    unread: true,
  },
  {
    id: "N-2",
    title: "Task escalated",
    body: "APR-1039 was escalated to Finance manager.",
    time: "2h ago",
    unread: true,
  },
  {
    id: "N-3",
    title: "Delegation active",
    body: "Your approval authority is delegated to Alex Ho this Friday.",
    time: "Yesterday",
    unread: false,
  },
];
