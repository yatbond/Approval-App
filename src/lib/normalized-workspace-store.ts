import {
  buildNormalizedWorkspaceRows,
  restoreWorkspaceStateFromNormalizedRows,
  type NormalizedApprovalRequestAttachmentRow,
  type NormalizedApprovalRequestEventRow,
  type NormalizedApprovalRequestRow,
  type NormalizedWorkflowTemplateVersionRow,
} from "./normalized-workspace.ts";
import type { WorkspaceStateSnapshot } from "./workspace-persistence.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TaskCollaborationRequest,
  TaskCorrectionRequest,
  TaskSharedFulfillment,
} from "./types.ts";

type SupabaseError = {
  message: string;
};

type SupabaseQueryResult = {
  data: unknown[] | null;
  error: SupabaseError | null;
};

type SupabaseMutationResult = {
  error: SupabaseError | null;
  count?: number | null;
};

type SupabaseLike = Pick<SupabaseClient, "from" | "rpc">;

export type WorkspaceAdminDeactivation =
  | { type: "business"; businessId: string }
  | { type: "department"; businessId: string; departmentName: string }
  | { type: "template"; templateKey: string; versionNumber: number };

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  is_active?: boolean;
  is_active_version?: boolean | null;
  version_comment?: string | null;
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
  public_url?: string | null;
  uploaded_by_email: string;
  created_at: string;
};

type CollaborationMirrorDbRow = {
  approval_request_no: string;
  payload: unknown;
};

type CollaborationMirrorRows = {
  collaborationRequests: CollaborationMirrorDbRow[];
  sharedFulfillments: CollaborationMirrorDbRow[];
  correctionRequests: CollaborationMirrorDbRow[];
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
  if (
    !rows.businessUnits.length &&
    !rows.businessDepartments.length &&
    !rows.workflowTemplateVersions.length
  ) {
    return;
  }

  const businessNameByClientId = new Map(
    rows.businessUnits.map((business) => [business.clientId, business.name]),
  );
  const configuration = {
    schemaVersion: 1,
    businessUnits: rows.businessUnits.map((business) => ({
      name: business.name,
      isActive: true,
    })),
    businessDepartments: rows.businessDepartments.map((department) => ({
      businessName:
        businessNameByClientId.get(department.businessClientId) || "",
      name: department.name,
      isActive: true,
    })),
    workflowTemplateVersions: rows.workflowTemplateVersions.map((template) => ({
      templateKey: template.templateKey,
      versionNumber: template.versionNumber,
      name: template.name,
      businessName: template.businessName,
      departmentName: template.departmentName,
      graph: template.graph || { nodes: [], edges: [] },
      documentRequirements: template.documentRequirements,
      supportedLanguages: template.supportedLanguages,
      templateSnapshot: template.templateSnapshot,
      isActive: template.isActive !== false,
      isActiveVersion: template.isActiveVersion === true,
      versionComment: template.versionComment || "",
    })),
  };

  const { error } = await supabase.rpc("save_workspace_configuration", {
    p_configuration: configuration,
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function deactivateWorkspaceAdminRecord(
  supabase: SupabaseLike,
  command: WorkspaceAdminDeactivation,
) {
  const deactivatedAt = new Date().toISOString();

  if (command.type === "business") {
    await throwIfNoUpdatedRows(
      supabase
        .from("business_units")
        .update({ is_active: false, updated_at: deactivatedAt }, { count: "exact" })
        .eq("id", command.businessId),
      "No active business matched this delete request.",
    );
    await throwIfError(
      supabase
        .from("business_departments")
        .update({ is_active: false, updated_at: deactivatedAt }, { count: "exact" })
        .eq("business_unit_id", command.businessId),
    );
    return;
  }

  if (command.type === "department") {
    await throwIfNoUpdatedRows(
      supabase
        .from("business_departments")
        .update({ is_active: false, updated_at: deactivatedAt }, { count: "exact" })
        .eq("business_unit_id", command.businessId)
        .eq("name", command.departmentName),
      "No active department matched this delete request.",
    );
    return;
  }

  await throwIfNoUpdatedRows(
    supabase
      .from("workflow_template_versions")
      .update({ is_active: false, updated_at: deactivatedAt }, { count: "exact" })
      .eq("template_key", command.templateKey)
      .eq("version_number", command.versionNumber),
    "No active template version matched this delete request.",
  );
}

export async function loadNormalizedWorkspaceState(
  supabase: SupabaseLike,
  selectedTemplateId: string,
  { includeApprovalRuntime = true }: { includeApprovalRuntime?: boolean } = {},
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
        "id,template_key,version_number,is_active,is_active_version,version_comment,name,graph,document_requirements,supported_languages,template_snapshot,business_units(name),business_departments(name)",
      )
      .order("updated_at", { ascending: false }),
  );
  const requests = includeApprovalRuntime
    ? await selectRows<RequestDbRow>(
        supabase
          .from("approval_requests")
          .select(
            "id,request_no,requester_name,requester_email,title,workflow_name,department_name,status,due_label,due_at,value_label,current_step,current_node_id,current_owner_email,pending_node_ids,pending_owner_emails,completed_node_ids,notified_node_ids,node_decisions,active_branch_id,extracted_fields,participants,last_action,task_snapshot,workflow_template_versions(template_key,version_number)",
          )
          .order("updated_at", { ascending: false }),
      )
    : [];

  if (
    !businesses.length &&
    !departments.length &&
    !templates.length &&
    !requests.length
  ) {
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
            "approval_request_id,attachment_key,file_name,document_id,document_type,document_format,workflow_node_id,storage_path,public_url,uploaded_by_email,created_at",
          )
          .in("approval_request_id", requestIds)
          .order("created_at"),
      )
    : [];
  const requestNoById = new Map(
    requests.map((request) => [request.id, request.request_no]),
  );
  const collaborationMirrors = requestIds.length
    ? await loadCollaborationMirrors(
        supabase,
        requests.map((request) => request.request_no),
      )
    : {
        collaborationRequests: [],
        sharedFulfillments: [],
        correctionRequests: [],
      };

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
    approvalRequests: requests.map((request) =>
      mapRequestRow(request, collaborationMirrors),
    ),
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
      ...(attachment.public_url ? { publicUrl: attachment.public_url } : {}),
      uploadedByEmail: attachment.uploaded_by_email,
      createdAt: attachment.created_at,
    })),
  });
}

async function loadCollaborationMirrors(
  supabase: SupabaseLike,
  requestNos: string[],
): Promise<CollaborationMirrorRows> {
  const [
    collaborationRequests,
    sharedFulfillments,
    correctionRequests,
  ] = await Promise.all([
    selectRows<CollaborationMirrorDbRow>(
      supabase
        .from("workflow_collaboration_requests")
        .select("approval_request_no,payload")
        .in("approval_request_no", requestNos),
    ),
    selectRows<CollaborationMirrorDbRow>(
      supabase
        .from("workflow_shared_fulfillments")
        .select("approval_request_no,payload")
        .in("approval_request_no", requestNos),
    ),
    selectRows<CollaborationMirrorDbRow>(
      supabase
        .from("workflow_correction_requests")
        .select("approval_request_no,payload")
        .in("approval_request_no", requestNos),
    ),
  ]);

  return {
    collaborationRequests,
    sharedFulfillments,
    correctionRequests,
  };
}

function mapTemplateRow(row: TemplateDbRow): NormalizedWorkflowTemplateVersionRow {
  const snapshot = (
    isJsonObject(row.template_snapshot)
      ? row.template_snapshot
      : {
          id: row.template_key,
          name: row.name,
          business: row.business_units?.name || "",
          department: row.business_departments?.name || "",
          documentTypes: [],
          documents: Array.isArray(row.document_requirements)
            ? row.document_requirements
            : [],
          languages: row.supported_languages || [],
          fields: [],
          steps: [],
          graph: isJsonObject(row.graph)
            ? row.graph
            : { nodes: [], edges: [] },
        }
  ) as NormalizedWorkflowTemplateVersionRow["templateSnapshot"];
  const isArchived = row.is_active === false;
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
    templateSnapshot: {
      ...snapshot,
      id:
        typeof snapshot.id === "string" && snapshot.id
          ? snapshot.id
          : row.template_key,
      name:
        typeof snapshot.name === "string" && snapshot.name
          ? snapshot.name
          : row.name,
      business:
        typeof snapshot.business === "string"
          ? snapshot.business
          : row.business_units?.name || "",
      department:
        typeof snapshot.department === "string"
          ? snapshot.department
          : row.business_departments?.name || "",
      documentTypes: Array.isArray(snapshot.documentTypes)
        ? snapshot.documentTypes
        : [],
      documents: Array.isArray(snapshot.documents)
        ? snapshot.documents
        : Array.isArray(row.document_requirements)
          ? row.document_requirements
          : [],
      languages: Array.isArray(snapshot.languages)
        ? snapshot.languages
        : row.supported_languages || [],
      fields: Array.isArray(snapshot.fields) ? snapshot.fields : [],
      steps: Array.isArray(snapshot.steps) ? snapshot.steps : [],
      graph: (isJsonObject(snapshot.graph)
        ? snapshot.graph
        : isJsonObject(row.graph)
          ? row.graph
          : { nodes: [], edges: [] }) as NormalizedWorkflowTemplateVersionRow["graph"],
      databaseVersionId: row.id,
      version: row.version_number,
      isActiveVersion: row.is_active_version === true,
      versionComment: row.version_comment || snapshot.versionComment || "",
      ...(isArchived ? { isArchived: true } : {}),
    },
    isActive: !isArchived,
    isActiveVersion: row.is_active_version === true,
    versionComment: row.version_comment || snapshot.versionComment || "",
    createdBy: "",
  };
}

function mapRequestRow(
  row: RequestDbRow,
  collaborationMirrors: CollaborationMirrorRows,
): NormalizedApprovalRequestRow {
  const snapshot = (
    isJsonObject(row.task_snapshot)
      ? row.task_snapshot
      : {
          id: row.request_no,
          title: row.title,
          workflow: row.workflow_name,
          requester: row.requester_name,
          requesterEmail: row.requester_email,
          department: row.department_name,
          status: row.status,
          due: row.due_label,
          ...(row.due_at ? { dueAt: row.due_at } : {}),
          value: row.value_label,
          currentStep: row.current_step,
          currentOwner: row.current_owner_email,
          ...(row.current_node_id ? { currentNodeId: row.current_node_id } : {}),
          pendingNodeIds: row.pending_node_ids || [],
          pendingOwners: row.pending_owner_emails || [],
          completedNodeIds: row.completed_node_ids || [],
          notifiedNodeIds: row.notified_node_ids || [],
          nodeDecisions: row.node_decisions || {},
          ...(row.active_branch_id ? { activeBranchId: row.active_branch_id } : {}),
          participants: row.participants || [],
          lastAction: row.last_action,
          extractedFields: row.extracted_fields || {},
          attachments: [],
          auditTrail: [],
        }
  ) as NormalizedApprovalRequestRow["taskSnapshot"];
  const collaborationRequests = payloadsForRequest<TaskCollaborationRequest>(
    collaborationMirrors.collaborationRequests,
    row.request_no,
  );
  const sharedFulfillments = payloadsForRequest<TaskSharedFulfillment>(
    collaborationMirrors.sharedFulfillments,
    row.request_no,
  );
  const correctionRequests = payloadsForRequest<TaskCorrectionRequest>(
    collaborationMirrors.correctionRequests,
    row.request_no,
  );
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
    taskSnapshot: {
      ...snapshot,
      ...(collaborationRequests.length ? { collaborationRequests } : {}),
      ...(sharedFulfillments.length ? { sharedFulfillments } : {}),
      ...(correctionRequests.length ? { correctionRequests } : {}),
    },
  };
}

function payloadsForRequest<T>(
  rows: CollaborationMirrorDbRow[],
  requestNo: string,
): T[] {
  return rows
    .filter((row) => row.approval_request_no === requestNo)
    .map((row) => row.payload)
    .filter(isObject) as T[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

async function throwIfNoUpdatedRows(
  query: PromiseLike<SupabaseMutationResult>,
  emptyMessage: string,
) {
  const { error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  if (!count) {
    throw new Error(emptyMessage);
  }
}
