import { createClient } from "@supabase/supabase-js";
import {
  departments as fallbackDepartments,
  workflowTemplates as fallbackWorkflowTemplates,
} from "@/lib/mock-data";
import { createTtlCache } from "@/lib/performance-cache";
import type { WorkflowTemplate } from "@/lib/types";

type WorkflowTemplateRow = {
  id: string;
  name: string;
  document_types: string[];
  supported_languages: string[];
  departments: { name: string } | null;
  workflow_fields: {
    name: string;
    label: string;
    field_type: WorkflowTemplate["fields"][number]["type"];
    source: WorkflowTemplate["fields"][number]["source"];
    is_required: boolean;
    instructions: string | null;
    display_order: number;
  }[];
  workflow_steps: {
    name: string;
    approver_role: string;
    departments: { name: string } | null;
    due_in_hours: number;
    escalation_role: string | null;
    branch_condition: Record<string, unknown>;
    display_order: number;
  }[];
};

function getReadClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

export async function getDepartments() {
  return departmentsCache.get();
}

export async function getWorkflowTemplates() {
  return workflowTemplatesCache.get();
}

const directoryCacheTtlMs = 60_000;

const departmentsCache = createTtlCache({
  ttlMs: directoryCacheTtlMs,
  load: loadDepartments,
});

const workflowTemplatesCache = createTtlCache({
  ttlMs: directoryCacheTtlMs,
  load: loadWorkflowTemplates,
});

async function loadDepartments() {
  const supabase = getReadClient();

  if (!supabase) {
    return fallbackDepartments;
  }

  const { data, error } = await supabase
    .from("departments")
    .select("name")
    .eq("is_active", true)
    .order("name");

  if (error || !data?.length) {
    return fallbackDepartments;
  }

  return data.map((department) => department.name);
}

async function loadWorkflowTemplates() {
  const supabase = getReadClient();

  if (!supabase) {
    return fallbackWorkflowTemplates;
  }

  const { data, error } = await supabase
    .from("workflow_templates")
    .select(
      "id,name,document_types,supported_languages,departments(name),workflow_fields(name,label,field_type,source,is_required,instructions,display_order),workflow_steps(name,approver_role,due_in_hours,escalation_role,branch_condition,display_order,departments(name))",
    )
    .eq("is_active", true)
    .order("name")
    .returns<WorkflowTemplateRow[]>();

  if (error || !data?.length) {
    return fallbackWorkflowTemplates;
  }

  return data.map((template) => {
    const department = template.departments?.name || "General";
    const fields = template.workflow_fields
      .sort((left, right) => left.display_order - right.display_order)
      .map((field) => ({
        name: field.name,
        label: field.label,
        type: field.field_type,
        required: field.is_required,
        source: field.source,
        instructions: field.instructions || "",
        documentId: "document-1",
      }));

    return {
      id: template.id,
      name: template.name,
      business: "Asia Allied Infrastructure",
      department,
      documentTypes: template.document_types,
      documents: [
        {
          id: "document-1",
          documentType: template.document_types[0] || "General document",
          format: "pdf" as const,
          required: true,
          fields,
        },
      ],
      languages: template.supported_languages,
      fields,
      steps: template.workflow_steps
      .sort((left, right) => left.display_order - right.display_order)
      .map((step) => ({
        name: step.name,
        role: step.approver_role,
        approverName: step.approver_role,
        approverEmail: "approver@example.com",
        department: step.departments?.name || "Requester department",
        dueInHours: step.due_in_hours,
        escalationRole: step.escalation_role || "Department head",
        escalationName: step.escalation_role || "Department head",
        escalationEmail: "escalation@example.com",
        condition: formatBranchCondition(step.branch_condition),
      })),
    };
  });
}

function formatBranchCondition(condition: Record<string, unknown>) {
  if (condition.always) {
    return "Always";
  }

  if (condition.field && condition.operator && condition.value !== undefined) {
    return `${condition.field} ${condition.operator} ${condition.value}`;
  }

  return "Configured rule";
}
