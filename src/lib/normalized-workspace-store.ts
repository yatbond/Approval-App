import {
  buildNormalizedWorkspaceRows,
  restoreWorkspaceStateFromNormalizedRows,
  type NormalizedApprovalRequestAttachmentRow,
  type NormalizedApprovalRequestEventRow,
  type NormalizedApprovalRequestRow,
  type NormalizedBusinessDepartmentRow,
  type NormalizedBusinessUnitRow,
  type NormalizedWorkflowTemplateVersionRow,
} from "@/lib/normalized-workspace";
import type { WorkspaceStateSnapshot } from "@/lib/workspace-persistence";
import type { SupabaseClient } from "@supabase/supabase-js";

type SupabaseError = {
  message: string;
};

type SupabaseQueryResult = {
  data: unknown[] | null;
  error: SupabaseError | null;
};

type SupabaseMutationResult = {
  error: SupabaseError | null;
};

type SupabaseLike = Pick<SupabaseClient, "from">;

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

type AuthenticatedUser = {
  id: string;
  email: string;
};

type BusinessDbRow = {
  id: string;
  name: string;
};

type DepartmentDbRow = {
  id: string;
  business_unit_id: string;
  name: string;
};

type TemplateDbRow = {
  id: string;
  template_key: string;
  version_number: number;
  name: string;
  graph: unknown;
  document_requirements: unknown;
  supported_languages: string[];
  template_snapshot: unknown;
  business_units?: { name: string } | null;
  business_departments?: { name: string } | null;
};

type RequestDbRow = {
  id: string;
  request_no: string;
  requester_name: string;
  requester_email: string;
  title: string;
  workflow_name: string;
  department_name: string;
  status: NormalizedApprovalRequestRow["status"];
  due_label: string;
  due_at?: string | null;
  value_label: string;
  current_step: string;
  current_node_id?: string | null;
  current_owner_email: string;
  pending_node_ids: string[];
  pending_owner_emails: string[];
  completed_node_ids: string[];
  notified_node_ids: string[];
  node_decisions: unknown;
  active_branch_id?: string | null;
  extracted_fields: Record<string, string>;
  participants: string[];
  last_action: string;
  task_snapshot: unknown;
  workflow_template_versions?: {
    template_key: string;
    version_number: number;
  } | null;
};

type EventDbRow = {
  approval_request_id: string;
  event_key: string;
  action: NormalizedApprovalRequestEventRow["action"];
  actor_name: string;
  actor_email: string;
  detail: string;
  target_email?: string | null;
  created_at: string;
};

type AttachmentDbRow = {
  approval_request_id: string;
  attachment_key: string;
  file_name: string;
  document_id?: string | null;
  document_type: string;
  document_format: NormalizedApprovalRequestAttachmentRow["documentFormat"];
  workflow_node_id?: string | null;
  storage_path?: string | null;
  uploaded_by_email: string;
  created_at: string;
};

export async function saveNormalizedWorkspaceState(
  supabase: SupabaseLike,
  snapshot: WorkspaceStateSnapshot,
  user: AuthenticatedUser,
) {
  const rows = buildNormalizedWorkspaceRows(snapshot, {
    userId: user.id,
    email: user.email,
  });
  const businesses = await upsertBusinessUnits(supabase, rows.businessUnits);
  const departments = await upsertBusinessDepartments(
    supabase,
    rows.businessDepartments,
    rows.businessUnits,
    businesses,
  );
  const templates = await upsertTemplates(
    supabase,
    rows.workflowTemplateVersions,
    businesses,
    departments,
  );
  const requests = await upsertApprovalRequests(
    supabase,
    rows.approvalRequests,
    templates,
    user,
  );
  await upsertApprovalRequestEvents(
    supabase,
    rows.approvalRequestEvents,
    requests,
    user,
  );
  await upsertApprovalRequestAttachments(
    supabase,
    rows.approvalRequestAttachments,
    requests,
    user,
  );
}

export async function loadNormalizedWorkspaceState(
  supabase: SupabaseLike,
  selectedTemplateId: string,
): Promise<WorkspaceStateSnapshot | null> {
  const businesses = await selectRows<BusinessDbRow>(
    supabase
      .from("business_units")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
  );
  const departments = await selectRows<DepartmentDbRow>(
    supabase
      .from("business_departments")
      .select("id,business_unit_id,name")
      .eq("is_active", true)
      .order("name"),
  );
  const templates = await selectRows<TemplateDbRow>(
    supabase
      .from("workflow_template_versions")
      .select(
        "id,template_key,version_number,name,graph,document_requirements,supported_languages,template_snapshot,business_units(name),business_departments(name)",
      )
      .eq("is_active", true)
      .order("updated_at", { ascending: false }),
  );
  const requests = await selectRows<RequestDbRow>(
    supabase
      .from("approval_requests")
      .select(
        "id,request_no,requester_name,requester_email,title,workflow_name,department_name,status,due_label,due_at,value_label,current_step,current_node_id,current_owner_email,pending_node_ids,pending_owner_emails,completed_node_ids,notified_node_ids,node_decisions,active_branch_id,extracted_fields,participants,last_action,task_snapshot,workflow_template_versions(template_key,version_number)",
      )
      .order("updated_at", { ascending: false }),
  );

  if (!templates.length && !requests.length) {
    return null;
  }

  const requestIds = requests.map((request) => request.id);
  const events = requestIds.length
    ? await selectRows<EventDbRow>(
        supabase
          .from("approval_request_events")
          .select(
            "approval_request_id,event_key,action,actor_name,actor_email,detail,target_email,created_at",
          )
          .in("approval_request_id", requestIds)
          .order("created_at"),
      )
    : [];
  const attachments = requestIds.length
    ? await selectRows<AttachmentDbRow>(
        supabase
          .from("approval_request_attachments")
          .select(
            "approval_request_id,attachment_key,file_name,document_id,document_type,document_format,workflow_node_id,storage_path,uploaded_by_email,created_at",
          )
          .in("approval_request_id", requestIds)
          .order("created_at"),
      )
    : [];
  const requestNoById = new Map(
    requests.map((request) => [request.id, request.request_no]),
  );

  return restoreWorkspaceStateFromNormalizedRows({
    selectedTemplateId: selectedTemplateId || templates[0]?.template_key || "",
    businessUnits: businesses.map((business) => ({
      clientId: business.id,
      name: business.name,
    })),
    businessDepartments: departments.map((department) => ({
      businessClientId: department.business_unit_id,
      name: department.name,
    })),
    workflowTemplateVersions: templates.map(mapTemplateRow),
    approvalRequests: requests.map(mapRequestRow),
    approvalRequestEvents: events.map((event) => ({
      approvalRequestNo: requestNoById.get(event.approval_request_id) || "",
      eventKey: event.event_key,
      action: event.action,
      actorName: event.actor_name,
      actorEmail: event.actor_email,
      detail: event.detail,
      ...(event.target_email ? { targetEmail: event.target_email } : {}),
      createdAt: event.created_at,
    })),
    approvalRequestAttachments: attachments.map((attachment) => ({
      approvalRequestNo: requestNoById.get(attachment.approval_request_id) || "",
      attachmentKey: attachment.attachment_key,
      fileName: attachment.file_name,
      ...(attachment.document_id ? { documentId: attachment.document_id } : {}),
      documentType: attachment.document_type,
      documentFormat: attachment.document_format,
      ...(attachment.workflow_node_id ? { workflowNodeId: attachment.workflow_node_id } : {}),
      ...(attachment.storage_path ? { storagePath: attachment.storage_path } : {}),
      uploadedByEmail: attachment.uploaded_by_email,
      createdAt: attachment.created_at,
    })),
  });
}

async function upsertBusinessUnits(
  supabase: SupabaseLike,
  rows: NormalizedBusinessUnitRow[],
) {
  if (!rows.length) {
    return [];
  }

  return selectRows<BusinessDbRow>(
    supabase
      .from("business_units")
      .upsert(
        rows.map((row) => ({
          name: row.name,
          is_active: true,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "name" },
      )
      .select("id,name"),
  );
}

async function upsertBusinessDepartments(
  supabase: SupabaseLike,
  rows: NormalizedBusinessDepartmentRow[],
  businessRows: NormalizedBusinessUnitRow[],
  businesses: BusinessDbRow[],
) {
  if (!rows.length) {
    return [];
  }

  const businessNameByClientId = new Map(
    businessRows.map((business) => [business.clientId, business.name]),
  );
  const businessIdByName = new Map(
    businesses.map((business) => [business.name, business.id]),
  );
  const payload = rows
    .map((row) => {
      const businessName = businessNameByClientId.get(row.businessClientId);
      const businessId = businessName ? businessIdByName.get(businessName) : undefined;
      return businessId
        ? {
            business_unit_id: businessId,
            name: row.name,
            is_active: true,
            updated_at: new Date().toISOString(),
          }
        : null;
    })
    .filter(isPresent);

  if (!payload.length) {
    return [];
  }

  return selectRows<DepartmentDbRow>(
    supabase
      .from("business_departments")
      .upsert(payload, { onConflict: "business_unit_id,name" })
      .select("id,business_unit_id,name"),
  );
}

async function upsertTemplates(
  supabase: SupabaseLike,
  rows: NormalizedWorkflowTemplateVersionRow[],
  businesses: BusinessDbRow[],
  departments: DepartmentDbRow[],
) {
  if (!rows.length) {
    return [];
  }

  const businessIdByName = new Map(
    businesses.map((business) => [business.name, business.id]),
  );
  const departmentIdByBusinessAndName = new Map(
    departments.map((department) => [
      `${department.business_unit_id}:${department.name}`,
      department.id,
    ]),
  );

  const payload = rows.map((row) => {
    const businessId = businessIdByName.get(row.businessName);
    const departmentId = businessId
      ? departmentIdByBusinessAndName.get(`${businessId}:${row.departmentName}`)
      : undefined;

    return {
      template_key: row.templateKey,
      version_number: row.versionNumber,
      name: row.name,
      business_unit_id: businessId,
      department_id: departmentId,
      graph: row.graph || { nodes: [], edges: [] },
      document_requirements: row.documentRequirements,
      supported_languages: row.supportedLanguages,
      template_snapshot: row.templateSnapshot,
      is_active: true,
      created_by: row.createdBy,
      updated_at: new Date().toISOString(),
    };
  });

  return selectRows<{ id: string; template_key: string; version_number: number }>(
    supabase
      .from("workflow_template_versions")
      .upsert(payload, { onConflict: "template_key,version_number" })
      .select("id,template_key,version_number"),
  );
}

async function upsertApprovalRequests(
  supabase: SupabaseLike,
  rows: NormalizedApprovalRequestRow[],
  templates: { id: string; template_key: string; version_number: number }[],
  user: AuthenticatedUser,
) {
  if (!rows.length) {
    return [];
  }

  const templateIdByKeyVersion = new Map(
    templates.map((template) => [
      `${template.template_key}:${template.version_number}`,
      template.id,
    ]),
  );
  const payload = rows
    .map((row) => {
      const templateId = templateIdByKeyVersion.get(
        `${row.workflowTemplateKey}:${row.workflowTemplateVersion}`,
      );
      if (!templateId) {
        return null;
      }

      return {
        request_no: row.requestNo,
        workflow_template_version_id: templateId,
        requester_id: row.requesterEmail === user.email ? user.id : null,
        requester_name: row.requesterName,
        requester_email: row.requesterEmail,
        title: row.title,
        workflow_name: row.workflowName,
        department_name: row.department,
        status: row.status,
        due_label: row.dueLabel,
        due_at: row.dueAt || null,
        value_label: row.valueLabel,
        current_step: row.currentStep,
        current_node_id: row.currentNodeId || null,
        current_owner_email: row.currentOwnerEmail,
        pending_node_ids: row.pendingNodeIds,
        pending_owner_emails: row.pendingOwnerEmails,
        completed_node_ids: row.completedNodeIds,
        notified_node_ids: row.notifiedNodeIds,
        node_decisions: row.nodeDecisions,
        active_branch_id: row.activeBranchId || null,
        extracted_fields: row.extractedFields,
        participants: row.participants,
        last_action: row.lastAction,
        task_snapshot: row.taskSnapshot,
        updated_at: new Date().toISOString(),
      };
    })
    .filter(isPresent);

  if (!payload.length) {
    return [];
  }

  return selectRows<{ id: string; request_no: string }>(
    supabase
      .from("approval_requests")
      .upsert(payload, { onConflict: "request_no" })
      .select("id,request_no"),
  );
}

async function upsertApprovalRequestEvents(
  supabase: SupabaseLike,
  rows: NormalizedApprovalRequestEventRow[],
  requests: { id: string; request_no: string }[],
  user: AuthenticatedUser,
) {
  if (!rows.length || !requests.length) {
    return;
  }

  const requestIdByNo = new Map(
    requests.map((request) => [request.request_no, request.id]),
  );
  const payload = rows
    .map((row) => {
      const requestId = requestIdByNo.get(row.approvalRequestNo);
      return requestId
        ? {
            approval_request_id: requestId,
            event_key: row.eventKey,
            action: row.action,
            actor_name: row.actorName,
            actor_id: row.actorEmail === user.email ? user.id : null,
            actor_email: row.actorEmail,
            detail: row.detail,
            target_email: row.targetEmail || null,
            created_at: row.createdAt,
          }
        : null;
    })
    .filter(isPresent);

  if (!payload.length) {
    return;
  }

  await throwIfError(
    supabase
      .from("approval_request_events")
      .upsert(payload, { onConflict: "approval_request_id,event_key" }),
  );
}

async function upsertApprovalRequestAttachments(
  supabase: SupabaseLike,
  rows: NormalizedApprovalRequestAttachmentRow[],
  requests: { id: string; request_no: string }[],
  user: AuthenticatedUser,
) {
  if (!rows.length || !requests.length) {
    return;
  }

  const requestIdByNo = new Map(
    requests.map((request) => [request.request_no, request.id]),
  );
  const payload = rows
    .map((row) => {
      const requestId = requestIdByNo.get(row.approvalRequestNo);
      return requestId
        ? {
            approval_request_id: requestId,
            attachment_key: row.attachmentKey,
            file_name: row.fileName,
            document_id: row.documentId || null,
            document_type: row.documentType,
            document_format: row.documentFormat,
            workflow_node_id: row.workflowNodeId || null,
            storage_path: row.storagePath || null,
            uploaded_by: row.uploadedByEmail === user.email ? user.id : null,
            uploaded_by_email: row.uploadedByEmail,
            created_at: row.createdAt,
          }
        : null;
    })
    .filter(isPresent);

  if (!payload.length) {
    return;
  }

  await throwIfError(
    supabase
      .from("approval_request_attachments")
      .upsert(payload, { onConflict: "approval_request_id,attachment_key" }),
  );
}

function mapTemplateRow(row: TemplateDbRow): NormalizedWorkflowTemplateVersionRow {
  const snapshot = row.template_snapshot as NormalizedWorkflowTemplateVersionRow["templateSnapshot"];
  return {
    templateKey: row.template_key,
    versionNumber: row.version_number,
    name: row.name,
    businessName: row.business_units?.name || snapshot.business || "",
    departmentName: row.business_departments?.name || snapshot.department || "",
    graph: snapshot.graph || (row.graph as NormalizedWorkflowTemplateVersionRow["graph"]),
    documentRequirements:
      snapshot.documents ||
      (row.document_requirements as NormalizedWorkflowTemplateVersionRow["documentRequirements"]),
    supportedLanguages: row.supported_languages,
    templateSnapshot: snapshot,
    createdBy: "",
  };
}

function mapRequestRow(row: RequestDbRow): NormalizedApprovalRequestRow {
  const snapshot = row.task_snapshot as NormalizedApprovalRequestRow["taskSnapshot"];
  return {
    requestNo: row.request_no,
    workflowTemplateKey: row.workflow_template_versions?.template_key || snapshot.workflowTemplateId || "",
    workflowTemplateVersion: row.workflow_template_versions?.version_number || snapshot.workflowTemplateVersion || 1,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    title: row.title,
    workflowName: row.workflow_name,
    department: row.department_name,
    status: row.status,
    dueLabel: row.due_label,
    ...(row.due_at ? { dueAt: row.due_at } : {}),
    valueLabel: row.value_label,
    currentStep: row.current_step,
    ...(row.current_node_id ? { currentNodeId: row.current_node_id } : {}),
    currentOwnerEmail: row.current_owner_email,
    pendingNodeIds: row.pending_node_ids || [],
    pendingOwnerEmails: row.pending_owner_emails || [],
    completedNodeIds: row.completed_node_ids || [],
    notifiedNodeIds: row.notified_node_ids || [],
    nodeDecisions: (row.node_decisions || {}) as NormalizedApprovalRequestRow["nodeDecisions"],
    ...(row.active_branch_id ? { activeBranchId: row.active_branch_id } : {}),
    extractedFields: row.extracted_fields || {},
    participants: row.participants || [],
    lastAction: row.last_action,
    taskSnapshot: snapshot,
  };
}

async function selectRows<T>(
  query: PromiseLike<SupabaseQueryResult>,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as T[];
}

async function throwIfError(query: PromiseLike<SupabaseMutationResult>) {
  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}
