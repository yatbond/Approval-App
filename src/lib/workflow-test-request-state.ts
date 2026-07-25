import { createApprovalTaskFromTemplate } from "./request-builder.ts";
import type {
  ApprovalTask,
  WorkflowField,
  WorkflowGraphNode,
  WorkflowTemplate,
} from "./types.ts";
import { validateWorkflowTemplate } from "./workflow-graph.ts";
import type { TaskNotification } from "./workflow-system.ts";

const workflowTestIdPrefix = "TEST-";
const participantNodeKinds = new Set<WorkflowGraphNode["kind"]>([
  "submit_request",
  "approval",
  "review",
  "for_information",
]);

export type WorkflowTestRequestResult = {
  didCreate: boolean;
  tasks: ApprovalTask[];
  task?: ApprovalTask;
  notification?: TaskNotification;
  message: string;
};

export function isWorkflowTestTask(task: Pick<ApprovalTask, "id">) {
  return task.id.startsWith(workflowTestIdPrefix);
}

export function getWorkflowTestTasks(
  tasks: ApprovalTask[],
  template: WorkflowTemplate | undefined,
) {
  if (!template) {
    return [];
  }

  return tasks.filter(
    (task) =>
      isWorkflowTestTask(task) &&
      (task.workflowTemplateId === template.id || task.workflow === template.name),
  );
}

export function getWorkflowTestRequiredAction(task: ApprovalTask) {
  if (task.status === "returned") {
    return "Amend and resubmit the test request, or cancel it.";
  }
  if (task.status === "approved") {
    return "No action is required. The test reached the end of the workflow.";
  }
  if (task.status === "cancelled") {
    return "No action is required. The test request was cancelled.";
  }
  return "Review the current position and choose Approve or Reject.";
}

export function buildWorkflowTestNotification(
  task: ApprovalTask,
): TaskNotification {
  const needsAction = !["approved", "cancelled"].includes(task.status);
  const currentPosition = task.currentOwner
    ? task.currentStep
    : task.status === "approved"
      ? "Workflow completed"
      : task.currentStep;
  const arrivedFrom = getIncomingPositionLabel(task);
  const requiredAction = getWorkflowTestRequiredAction(task);
  const latestEvent = task.auditTrail.at(-1)?.detail || task.lastAction;

  return {
    id: `${task.id}-test-${task.auditTrail.at(-1)?.id || task.status}`,
    title: needsAction ? "Workflow test action required" : "Workflow test updated",
    body: `Test request for ${task.workflow} is now at ${currentPosition}. ${requiredAction}`,
    time: task.auditTrail.at(-1)?.timestamp || task.due,
    unread: needsAction,
    requestId: task.id,
    recipientEmail: task.requesterEmail,
    kind: needsAction ? "action_required" : "originator_update",
    targetTab: needsAction ? "queue" : "tracking",
    details: [
      { label: "Workflow", value: task.workflow },
      { label: "Current position", value: currentPosition },
      ...(arrivedFrom ? [{ label: "Arrived from", value: arrivedFrom }] : []),
      { label: "Status", value: formatTestStatus(task.status) },
      { label: "Required action", value: requiredAction },
      { label: "Latest decision or update", value: latestEvent },
    ],
  };
}

export function createWorkflowTestRequestState({
  tasks,
  template,
  testerEmail,
  startedByEmail,
  now = new Date(),
}: {
  tasks: ApprovalTask[];
  template: WorkflowTemplate;
  testerEmail: string;
  startedByEmail: string;
  now?: Date;
}): WorkflowTestRequestResult {
  const normalizedTesterEmail = testerEmail.trim().toLowerCase();
  if (!isEmail(normalizedTesterEmail)) {
    return {
      didCreate: false,
      tasks,
      message: "Enter a valid tester email address.",
    };
  }

  const validationErrors = validateWorkflowTemplate(template).filter(
    (issue) => issue.severity === "error",
  );
  if (validationErrors.length) {
    return {
      didCreate: false,
      tasks,
      message: "Resolve the workflow validation errors before starting a test.",
    };
  }

  const assignedTemplate = assignWorkflowTestParticipants(
    template,
    normalizedTesterEmail,
  );
  const taskId = `${workflowTestIdPrefix}${now.getTime()}`;
  const task = createApprovalTaskFromTemplate({
    id: taskId,
    now,
    requester: {
      name: normalizedTesterEmail.split("@")[0] || "Workflow tester",
      email: normalizedTesterEmail,
    },
    template: assignedTemplate,
    sourceFileName: "Routing test",
    extractedFields: buildWorkflowTestValues(assignedTemplate, now),
  });
  const testTask: ApprovalTask = {
    ...task,
    title: `[TEST] ${template.name}`,
    workflowTemplateVersion: assignedTemplate.version || 1,
    value: "Routing test",
    lastAction: `Test started by ${startedByEmail}`,
    auditTrail: task.auditTrail.map((event, index) =>
      index === 0
        ? {
            ...event,
            actor: startedByEmail,
            actorEmail: startedByEmail,
            detail: `Workflow test started for ${normalizedTesterEmail}.`,
          }
        : event,
    ),
  };
  const nextTasks = [
    testTask,
    ...tasks.filter(
      (existingTask) =>
        !(
          isWorkflowTestTask(existingTask) &&
          (existingTask.workflowTemplateId === template.id ||
            existingTask.workflow === template.name)
        ),
    ),
  ];

  return {
    didCreate: true,
    tasks: nextTasks,
    task: testTask,
    notification: buildWorkflowTestNotification(testTask),
    message: `Test request created. Sending instructions to ${normalizedTesterEmail}.`,
  };
}

function assignWorkflowTestParticipants(
  template: WorkflowTemplate,
  testerEmail: string,
): WorkflowTemplate {
  return {
    ...template,
    graph: template.graph
      ? {
          ...template.graph,
          nodes: template.graph.nodes.map((node) =>
            participantNodeKinds.has(node.kind)
              ? {
                  ...node,
                  assigneeEmail: testerEmail,
                  assigneeEmailFixed: true,
                  ...(["approval", "review"].includes(node.kind)
                    ? {
                        escalationEmail: testerEmail,
                        escalationEmailFixed: true,
                      }
                    : {}),
                }
              : node,
          ),
        }
      : template.graph,
    steps: template.steps.map((step) => ({
      ...step,
      approverEmail: testerEmail,
      escalationEmail: testerEmail,
    })),
  };
}

function buildWorkflowTestValues(template: WorkflowTemplate, now: Date) {
  const fields = [
    ...template.fields,
    ...template.documents.flatMap((document) => document.fields),
  ];

  return Object.fromEntries(
    fields.map((field) => [field.name || field.label, getWorkflowTestValue(field, now)]),
  );
}

function getWorkflowTestValue(field: WorkflowField, now: Date) {
  if (field.type === "date") {
    return now.toISOString().slice(0, 10);
  }
  if (field.type === "number" || field.type === "currency") {
    return "100";
  }
  if (field.type === "email") {
    return "tester@example.com";
  }
  if (["select", "radio", "checkbox"].includes(field.type)) {
    return field.options?.find((option) => option.trim()) || "Test option";
  }
  return `Test ${field.label}`;
}

function getIncomingPositionLabel(task: ApprovalTask) {
  const graph = task.workflowTemplateSnapshot?.graph;
  if (!graph || !task.currentNodeId) {
    return "";
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.edges
    .filter(
      (edge) =>
        edge.targetId === task.currentNodeId && edge.branchType !== "for_information",
    )
    .map((edge) => nodeById.get(edge.sourceId)?.label)
    .filter((label): label is string => Boolean(label))
    .join(" + ");
}

function formatTestStatus(status: ApprovalTask["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
