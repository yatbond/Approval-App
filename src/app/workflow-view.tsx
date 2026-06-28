"use client";

import {
  ArrowRightLeft,
  Plus,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  getMissingRequiredCurrentNodeDocuments,
} from "@/lib/request-builder";
import {
  analyzeConditionCoverage,
  createWorkflowGraphFromTemplate,
  simulateWorkflowTemplate,
} from "@/lib/workflow-graph";
import {
  shouldHandleCanvasDeleteKey,
  shouldHandleCanvasRedoKey,
  shouldHandleCanvasUndoKey,
} from "@/lib/workflow-keyboard";
import {
  documentInputModeOptions,
  documentFormatOptions,
  formatDocumentInputMode,
  isManualFormRequirement,
} from "@/lib/workflow-documents";
import {
  getConditionContext,
  workflowNodeOptions,
} from "@/lib/workflow-condition-context";
import {
  getWorkflowHistory,
  type WorkflowHistoryById,
} from "@/lib/workflow-history";
import {
  type UserDirectoryEntry,
} from "@/lib/user-directory";
import { UserDirectoryDatalist } from "@/app/task-views";
import { ConditionBoxDetails } from "@/app/condition-box-details";
import { WorkflowTemplateLibrary } from "@/app/workflow-template-library";
import { WorkflowTemplateBuilder } from "@/app/workflow-template-builder";
import { TemplateDocumentRecognitionPanel } from "@/app/template-document-recognition-panel";
import { getWorkflowTemplateBuilderBusinessState } from "@/lib/workflow-template-builder-state";
import { WorkflowRuntimePanel } from "@/app/workflow-runtime-panel";
import { getSelectedRuntimeTask } from "@/lib/workflow-runtime-panel-state";
import { WorkflowCanvasToolbar } from "@/app/workflow-canvas-toolbar";
import { WorkflowEdgeDetails } from "@/app/workflow-edge-details";
import {
  getWorkflowUpdateSelectedEdgeRuleState,
  getWorkflowUpdateSelectedEdgeState,
} from "@/lib/workflow-edge-update-state";
import { getWorkflowCanvasSelectionState } from "@/lib/workflow-canvas-selection-state";
import { getWorkflowCanvasInstanceKey } from "@/lib/workflow-canvas-instance-state";
import { getWorkflowCanvasDeleteState } from "@/lib/workflow-canvas-delete-state";
import { getWorkflowCanvasResetState } from "@/lib/workflow-canvas-reset-state";
import {
  addWorkflowDocumentField,
  removeWorkflowDocumentField,
  updateWorkflowDocumentField,
} from "@/lib/workflow-document-field-state";
import {
  appendExtractionExamplesToTemplate,
} from "@/lib/template-recognition-state";
import {
  getWorkflowAddOutcomeTargetState,
  getWorkflowAddConditionCaseState,
  getWorkflowAddFallbackConditionCaseState,
  getWorkflowDeleteConditionCaseState,
  getWorkflowUpdateConditionCaseState,
} from "@/lib/workflow-condition-case-state";
import {
  getWorkflowConnectNodesState,
  getWorkflowCreateNodeState,
} from "@/lib/workflow-canvas-edit-state";
import { getWorkflowAddBoxDocumentState } from "@/lib/workflow-box-document-state";
import {
  getWorkflowTemplateDocumentState,
  getWorkflowUpdateDocumentRequirementState,
} from "@/lib/workflow-template-document-state";
import { getWorkflowTemplateLoadState } from "@/lib/workflow-template-load-state";
import { getWorkflowTemplateCopyState } from "@/lib/workflow-template-copy-state";
import { getWorkflowTemplateSaveState } from "@/lib/workflow-template-save-state";
import {
  formatWorkflowTemplateOptionLabel,
  getWorkflowCreateTemplateActionState,
  getWorkflowDuplicateTemplateActionState,
  getWorkflowPublishTemplateActionState,
  getWorkflowTemplateBaseOptions,
} from "@/lib/workflow-template-action-state";
import {
  defaultWorkflowEditorTab,
  workflowEditorTabs,
  type WorkflowEditorTab,
} from "@/lib/workflow-editor-tabs-state";
import { getWorkflowTemplateLifecycleState } from "@/lib/workflow-template-lifecycle-state";
import {
  getWorkflowRedoActionState,
  getWorkflowUndoActionState,
} from "@/lib/workflow-history-action-state";
import {
  getWorkflowCanvasDeleteConfirmation,
  type ConfirmationRequest,
} from "@/lib/confirmation-policy";
import {
  getWorkflowMoveNodeState,
  getWorkflowUpdateSelectedNodeState,
} from "@/lib/workflow-node-patch-state";
import type {
  ApprovalAction,
  ApprovalTask,
  BusinessUnit,
  DocumentFormat,
  WorkflowDocumentInputMode,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowHandoffCalculation,
  WorkflowHandoffProcess,
  WorkflowNodeKind,
  WorkflowRuleOperator,
  ExtractionTrainingExample,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";
import { InfoTip } from "./ui-hint";

const WorkflowCanvas = dynamic(() => import("@/app/workflow-canvas"), {
  loading: () => (
    <div className="grid h-[68vh] min-h-[420px] place-items-center rounded-md border border-white/10 bg-[#0d1013] text-sm text-neutral-500 lg:h-[calc(100vh-250px)] lg:min-h-[640px]">
      Loading canvas...
    </div>
  ),
  ssr: false,
});

const handoffFieldVisibilityOptions = [
  { value: "all", label: "All values" },
  { value: "selected", label: "Selected values" },
  { value: "hidden", label: "Hide selected" },
] as const;

const handoffDocumentVisibilityOptions = [
  { value: "all", label: "All documents" },
  { value: "required_for_node", label: "Required here" },
  { value: "selected", label: "Selected documents" },
  { value: "none", label: "No documents" },
] as const;

const handoffLayoutOptions = [
  { value: "standard", label: "Standard" },
  { value: "compact", label: "Compact" },
  { value: "comparison", label: "Compare" },
] as const;

const handoffComparisonOperators: WorkflowRuleOperator[] = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "contains",
];

const handoffProcessTypeOptions = [
  { value: "comparison", label: "Compare" },
  { value: "calculation", label: "Calculate" },
] as const;

const handoffCalculationOptions = [
  { value: "difference", label: "Difference" },
  { value: "percentage_difference", label: "% difference" },
] as const;

type HandoffProcessPatch = {
  type?: WorkflowHandoffProcess["type"];
  label?: string;
  leftField?: string;
  rightField?: string;
  operator?: WorkflowRuleOperator;
  calculation?: WorkflowHandoffCalculation;
};

export function WorkflowView({
  businessDirectory,
  tasks,
  workflowTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  onDeleteTemplate,
  adminRecordError,
  onCreateTemplate,
  onUpdateTemplate,
  onActivateTemplateVersion,
  onUpdateTemplateVersionComment,
  userDirectory,
  activeUser,
  onRunWorkflowAction,
  requestConfirmation,
}: {
  businessDirectory: BusinessUnit[];
  tasks: ApprovalTask[];
  workflowTemplates: WorkflowTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: (id: string) => void;
  onDeleteTemplate: (id: string) => void | Promise<void>;
  adminRecordError?: string;
  onCreateTemplate: (template: WorkflowTemplate) => void;
  onUpdateTemplate: (template: WorkflowTemplate) => void;
  onActivateTemplateVersion: (templateId: string) => void;
  onUpdateTemplateVersionComment: (templateId: string, comment: string) => void;
  userDirectory: UserDirectoryEntry[];
  activeUser: UserDirectoryEntry;
  onRunWorkflowAction: (taskId: string, action: ApprovalAction) => void;
  requestConfirmation: (request: ConfirmationRequest) => Promise<boolean>;
}) {
  const workflow =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];
  const workflowLifecycle = getWorkflowTemplateLifecycleState(workflow || null);
  const persistedWorkflowGraph = useMemo(
    () => (workflow ? createWorkflowGraphFromTemplate(workflow) : { nodes: [], edges: [] }),
    [workflow],
  );
  const workflowGraph = persistedWorkflowGraph;
  const workflowTasks = useMemo(
    () =>
      workflow
        ? tasks.filter(
            (task) =>
              task.workflowTemplateId === workflow.id || task.workflow === workflow.name,
          )
        : [],
    [tasks, workflow],
  );
  const [selectedRuntimeTaskId, setSelectedRuntimeTaskId] = useState("");
  const runtimeTask = useMemo(
    () => getSelectedRuntimeTask(workflowTasks, selectedRuntimeTaskId),
    [selectedRuntimeTaskId, workflowTasks],
  );
  const workflowSimulation = useMemo(
    () => (workflow ? simulateWorkflowTemplate(workflow) : null),
    [workflow],
  );
  const runtimeMissingDocuments = useMemo(
    () =>
      runtimeTask && workflow
        ? getMissingRequiredCurrentNodeDocuments(runtimeTask, workflow)
        : [],
    [runtimeTask, workflow],
  );
  const activeWorkflowHistoryId = workflow?.id || "";
  const [workflowHistoryById, setWorkflowHistoryById] =
    useState<WorkflowHistoryById>({});
  const workflowHistory = getWorkflowHistory(
    workflowHistoryById,
    activeWorkflowHistoryId,
  );
  const workflowUndoStack = workflow ? workflowHistory.undoStack : [];
  const workflowRedoStack = workflow ? workflowHistory.redoStack : [];
  const lastWorkflowEdit = workflow ? workflowHistory.lastEdit : "";
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [connectFromNodeId, setConnectFromNodeId] = useState<string | null>(null);
  const [conditionOutcomeCaseId, setConditionOutcomeCaseId] = useState<string | null>(null);
  const {
    activeOutcomeTargetIds,
    connectFromNode,
    selectedGraphEdge,
    selectedGraphNode,
  } = useMemo(
    () =>
      getWorkflowCanvasSelectionState({
        graph: workflowGraph,
        selectedNodeId,
        selectedEdgeId,
        connectFromNodeId,
        conditionOutcomeCaseId,
      }),
    [
      conditionOutcomeCaseId,
      connectFromNodeId,
      selectedEdgeId,
      selectedNodeId,
      workflowGraph,
    ],
  );
  const handoffFieldNames = useMemo(
    () => (workflow ? getWorkflowHandoffFieldNames(workflow) : []),
    [workflow],
  );
  const [canvasViewResetNonce, setCanvasViewResetNonce] = useState(0);
  const canvasInstanceKey = useMemo(
    () =>
      getWorkflowCanvasInstanceKey({
        workflowId: workflow?.id || "",
        resetNonce: canvasViewResetNonce,
        graph: workflowGraph,
        runtimeTask,
      }),
    [canvasViewResetNonce, runtimeTask, workflow?.id, workflowGraph],
  );
  const [workflowEditorTab, setWorkflowEditorTab] =
    useState<WorkflowEditorTab>(defaultWorkflowEditorTab);
  const [boxDocumentType, setBoxDocumentType] = useState("Supporting document");
  const [boxDocumentFormat, setBoxDocumentFormat] =
    useState<DocumentFormat>("pdf");
  const [boxDocumentInputMode, setBoxDocumentInputMode] =
    useState<WorkflowDocumentInputMode>("upload");
  const [boxDocumentRequired, setBoxDocumentRequired] = useState(true);
  const firstBusiness = businessDirectory[0];
  const [templateName, setTemplateName] = useState("General document approval");
  const [businessId, setBusinessId] = useState(firstBusiness?.id || "");
  const { selectedBusiness } = getWorkflowTemplateBuilderBusinessState({
    businessDirectory,
    businessId,
  });
  const [departmentName, setDepartmentName] = useState(
    selectedBusiness?.departments[0] || "",
  );
  const [baseTemplateId, setBaseTemplateId] = useState("");
  const baseWorkflowTemplates = useMemo(
    () => getWorkflowTemplateBaseOptions({ templates: workflowTemplates }),
    [workflowTemplates],
  );
  const copySourceTemplates = useMemo(
    () =>
      getWorkflowTemplateBaseOptions({
        templates: workflowTemplates,
        excludeTemplateId: workflow?.id,
      }),
    [workflowTemplates, workflow?.id],
  );
  const [copySourceTemplateId, setCopySourceTemplateId] = useState("");
  const [workflowActionMessage, setWorkflowActionMessage] = useState("");
  const baseTemplate =
    baseWorkflowTemplates.find((template) => template.id === baseTemplateId) ||
    null;
  const copySourceTemplate =
    copySourceTemplates.find((template) => template.id === copySourceTemplateId) ||
    null;
  const copySourceTemplateSelectValue = copySourceTemplate?.id || "";

  function createTemplate() {
    const nextState = getWorkflowCreateTemplateActionState({
      templateName,
      selectedBusinessName: selectedBusiness?.name || null,
      departmentName,
      baseTemplate,
      existingTemplates: workflowTemplates,
    });
    if (!nextState.didCreate || !nextState.template) {
      setWorkflowActionMessage(nextState.message || "");
      return;
    }

    onCreateTemplate(nextState.template);
    setSelectedTemplateId(nextState.selectedTemplateId || nextState.template.id);
    if (nextState.workflowEditorTab) {
      setWorkflowEditorTab(nextState.workflowEditorTab);
    }
    if (nextState.shouldResetCanvasView) {
      resetCanvasView();
    }
    setWorkflowActionMessage(
      baseTemplate
        ? `Created ${nextState.template.name} from ${baseTemplate.name}.`
        : `Created blank workflow ${nextState.template.name}.`,
    );
  }

  function publishSelectedTemplate() {
    const nextState = getWorkflowPublishTemplateActionState({
      template: workflow,
    });
    if (!nextState.didCreate || !nextState.template) {
      setWorkflowActionMessage(nextState.message || "");
      return;
    }

    onCreateTemplate(nextState.template);
    setWorkflowActionMessage(`Published ${nextState.template.name}.`);
  }

  function duplicateTemplateAsDraft(template: WorkflowTemplate) {
    const nextState = getWorkflowDuplicateTemplateActionState({ template });
    if (!nextState.didCreate || !nextState.template) {
      setWorkflowActionMessage(nextState.message || "");
      return;
    }

    onCreateTemplate(nextState.template);
    setSelectedTemplateId(nextState.selectedTemplateId || nextState.template.id);
    setWorkflowEditorTab(nextState.workflowEditorTab || "canvas");
    resetCanvasView();
    setWorkflowActionMessage(`Created editable draft ${nextState.template.name}.`);
  }

  function loadTemplateIntoBuilder(template: WorkflowTemplate) {
    const nextState = getWorkflowTemplateLoadState({
      template,
      businessDirectory,
      currentBusinessId: businessId,
    });
    setTemplateName(nextState.templateName);
    if (nextState.shouldSetBusinessId) {
      setBusinessId(nextState.businessId);
    }
    setDepartmentName(nextState.departmentName);
    setSelectedTemplateId(nextState.selectedTemplateId);
    setWorkflowEditorTab(nextState.workflowEditorTab);
    if (nextState.shouldResetCanvasView) {
      resetCanvasView();
    }
  }

  function copyTemplateIntoCanvas() {
    if (!workflow) {
      return;
    }

    const nextState = getWorkflowTemplateCopyState({
      targetTemplate: workflow,
      sourceTemplate: copySourceTemplate,
    });
    if (!nextState.didCopy) {
      return;
    }

    saveWorkflowTemplate(nextState.template, nextState.label);
    setWorkflowEditorTab(nextState.workflowEditorTab);
    if (nextState.shouldResetCanvasView) {
      resetCanvasView();
    }
  }

  function saveWorkflowTemplate(
    nextTemplate: WorkflowTemplate,
    label = "Updated workflow",
  ) {
    if (!workflow) {
      return;
    }

    const previewState = getWorkflowTemplateSaveState({
      currentTemplate: workflow,
      nextTemplate,
      label,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
    });
    if (!previewState.didUpdate) {
      if (previewState.message) {
        setWorkflowActionMessage(previewState.message);
      }
      return;
    }

    setWorkflowHistoryById((historyById) => {
      const nextState = getWorkflowTemplateSaveState({
        currentTemplate: workflow,
        nextTemplate,
        label,
        historyById,
        historyId: activeWorkflowHistoryId,
      });
      return nextState.historyById;
    });
    onUpdateTemplate(nextTemplate);
    setWorkflowActionMessage(label);
  }

  function saveWorkflowGraph(nextGraph: WorkflowGraph, label = "Updated workflow") {
    if (!workflow) {
      return;
    }

    saveWorkflowTemplate({
      ...workflow,
      graph: nextGraph,
    }, label);
  }

  function createCanvasNode(kind: WorkflowNodeKind) {
    const nextState = getWorkflowCreateNodeState({
      graph: workflowGraph,
      kind,
      selectedNodeId,
    });
    saveWorkflowGraph(nextState.graph, nextState.label);
    setSelectedNodeId(nextState.selectedNodeId || null);
    setSelectedEdgeId(nextState.selectedEdgeId || null);
  }

  function connectWorkflowNodes(sourceId: string, targetId: string) {
    const nextState = getWorkflowConnectNodesState({
      graph: workflowGraph,
      sourceId,
      targetId,
    });
    if (!nextState.didUpdate) {
      return;
    }

    saveWorkflowGraph(nextState.graph, nextState.label);
    setConnectFromNodeId(nextState.connectFromNodeId || null);
    setSelectedNodeId(nextState.selectedNodeId || null);
    setSelectedEdgeId(nextState.selectedEdgeId || null);
  }

  function resetCanvasView() {
    const nextState = getWorkflowCanvasResetState({ canvasViewResetNonce });
    setSelectedNodeId(nextState.selectedNodeId);
    setSelectedEdgeId(nextState.selectedEdgeId);
    setConnectFromNodeId(nextState.connectFromNodeId);
    setConditionOutcomeCaseId(nextState.conditionOutcomeCaseId);
    setCanvasViewResetNonce(
      (nonce) =>
        getWorkflowCanvasResetState({ canvasViewResetNonce: nonce })
          .canvasViewResetNonce,
    );
  }

  function undoWorkflowChange() {
    const nextState = getWorkflowUndoActionState({
      workflow,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
      undoStack: workflowUndoStack,
    });
    if (!nextState.didUpdate || !nextState.template) {
      return;
    }

    setWorkflowHistoryById(nextState.historyById);
    onUpdateTemplate(nextState.template);
    if (nextState.shouldResetCanvas) {
      resetCanvasView();
    }
  }

  function redoWorkflowChange() {
    const nextState = getWorkflowRedoActionState({
      workflow,
      historyById: workflowHistoryById,
      historyId: activeWorkflowHistoryId,
      redoStack: workflowRedoStack,
    });
    if (!nextState.didUpdate || !nextState.template) {
      return;
    }

    setWorkflowHistoryById(nextState.historyById);
    onUpdateTemplate(nextState.template);
    if (nextState.shouldResetCanvas) {
      resetCanvasView();
    }
  }

  function addConditionCaseToSelectedBox() {
    if (!selectedGraphNode) {
      return;
    }

    const context = workflow
      ? getConditionContext(workflowGraph, workflow, selectedGraphNode)
      : null;
    const nextState = getWorkflowAddConditionCaseState({
      graph: workflowGraph,
      selectedNodeId,
      upstreamNodeIds: context?.upstreamNodes.map((node) => node.id) || [],
    });
    if (nextState.didUpdate) {
      saveWorkflowGraph(nextState.graph, nextState.label);
    }
  }

  function addFallbackConditionCaseToSelectedBox() {
    const nextState = getWorkflowAddFallbackConditionCaseState({
      graph: workflowGraph,
      selectedNodeId,
    });
    if (nextState.didUpdate) {
      saveWorkflowGraph(nextState.graph, nextState.label);
    }
  }

  function moveWorkflowNode(nodeId: string, x: number, y: number) {
    const nextState = getWorkflowMoveNodeState({
      graph: workflowGraph,
      nodeId,
      x,
      y,
    });
    saveWorkflowGraph(nextState.graph, nextState.label);
  }

  function updateSelectedNode(patch: Partial<WorkflowGraphNode>) {
    const nextState = getWorkflowUpdateSelectedNodeState({
      graph: workflowGraph,
      selectedNode: selectedGraphNode,
      patch,
    });
    if (!nextState.didUpdate) {
      return;
    }

    saveWorkflowGraph(nextState.graph, nextState.label);
  }

  function updateSelectedNodeHandoffView(
    patch: Partial<NonNullable<WorkflowGraphNode["handoffView"]>>,
  ) {
    updateSelectedNode({
      handoffView: {
        ...(selectedGraphNode?.handoffView || {}),
        ...patch,
      },
    });
  }

  function addSelectedNodeHandoffProcess() {
    if (!workflow || !selectedGraphNode) {
      return;
    }

    const fieldNames = getWorkflowHandoffFieldNames(workflow);
    const processes = selectedGraphNode.handoffView?.processes || [];
    updateSelectedNodeHandoffView({
      processes: [
        ...processes,
        {
          id: nextHandoffProcessId(processes),
          type: "comparison",
          label: "Compare",
          leftField: fieldNames[0] || "",
          operator: "=",
          rightField: fieldNames[1] || fieldNames[0] || "",
        },
      ],
    });
  }

  function updateSelectedNodeHandoffProcess(
    processId: string,
    patch: HandoffProcessPatch,
  ) {
    const processes = selectedGraphNode?.handoffView?.processes || [];
    updateSelectedNodeHandoffView({
      processes: processes.map((process) =>
        process.id === processId
          ? applyHandoffProcessPatch(process, patch)
          : process,
      ),
    });
  }

  function removeSelectedNodeHandoffProcess(processId: string) {
    const processes = selectedGraphNode?.handoffView?.processes || [];
    updateSelectedNodeHandoffView({
      processes: processes.filter((process) => process.id !== processId),
    });
  }

  function addDocumentToSelectedBox() {
    if (!workflow || !selectedGraphNode) {
      return;
    }

    const nextState = getWorkflowAddBoxDocumentState({
      template: workflow,
      selectedNodeId,
      selectedNodeLabel: selectedGraphNode.label,
      documentType: boxDocumentType,
      format: boxDocumentFormat,
      inputMode: boxDocumentInputMode,
      required: boxDocumentRequired,
    });
    if (!nextState.didUpdate || !nextState.resetForm) {
      return;
    }

    saveWorkflowTemplate(nextState.template, nextState.label);
    setBoxDocumentType(nextState.resetForm.documentType);
    setBoxDocumentFormat(nextState.resetForm.format);
    setBoxDocumentInputMode(nextState.resetForm.inputMode);
    setBoxDocumentRequired(nextState.resetForm.required);
  }

  function updateTemplateDocuments(
    updater: (documents: WorkflowTemplate["documents"]) => WorkflowTemplate["documents"],
  ) {
    if (!workflow) {
      return;
    }

    const nextDocuments = updater(workflow.documents);
    const nextState = getWorkflowTemplateDocumentState({
      template: workflow,
      documents: nextDocuments,
    });
    saveWorkflowTemplate(nextState.template, nextState.label);
  }

  function updateBoxDocumentRequirement(
    documentId: string,
    patch: Parameters<typeof getWorkflowUpdateDocumentRequirementState>[0]["patch"],
  ) {
    if (!workflow) {
      return;
    }

    const nextState = getWorkflowUpdateDocumentRequirementState({
      template: workflow,
      documentId,
      patch,
    });
    saveWorkflowTemplate(nextState.template, nextState.label);
  }

  function updateBoxDocumentField(
    documentId: string,
    fieldIndex: number,
    patch: Partial<Pick<WorkflowField, "label" | "instructions" | "required">>,
  ) {
    updateTemplateDocuments((documents) =>
      updateWorkflowDocumentField(documents, documentId, fieldIndex, patch),
    );
  }

  function addBoxDocumentField(documentId: string) {
    updateTemplateDocuments((documents) =>
      addWorkflowDocumentField(documents, documentId),
    );
  }

  function removeBoxDocumentField(documentId: string, fieldIndex: number) {
    updateTemplateDocuments((documents) =>
      removeWorkflowDocumentField(documents, documentId, fieldIndex),
    );
  }

  function addRecognizedDocumentField(
    documentId: string,
    field: WorkflowField,
    example?: ExtractionTrainingExample,
  ) {
    if (!workflow) {
      return;
    }

    const nextDocuments = workflow.documents.map((document) => {
      if (document.id !== documentId) {
        return document;
      }

      const nextField = isManualFormRequirement(document)
        ? {
            ...field,
            source: "manual" as const,
            instructions:
              field.instructions ||
              `Requester enters ${field.label} in the digital form.`,
          }
        : field;
      const hasExistingField = document.fields.some(
        (existingField) => existingField.name === nextField.name,
      );

      return {
        ...document,
        fields: hasExistingField
          ? document.fields.map((existingField) =>
              existingField.name === nextField.name
                ? {
                    ...existingField,
                    instructions:
                      nextField.instructions || existingField.instructions,
                  }
                : existingField,
            )
          : [...document.fields, nextField],
      };
    });
    const documentState = getWorkflowTemplateDocumentState({
      template: workflow,
      documents: nextDocuments,
    });
    const nextTemplate = example
      ? appendExtractionExamplesToTemplate({
          template: documentState.template,
          examples: [example],
        })
      : documentState.template;
    saveWorkflowTemplate(nextTemplate, `Added ${field.label} recognition field`);
  }

  async function deleteSelectedCanvasItem() {
    const deleteState = getWorkflowCanvasDeleteState({
      graph: workflowGraph,
      selectedNodeId,
      selectedEdgeId,
      connectFromNodeId,
    });
    if (!deleteState.didDelete) {
      return;
    }

    const itemLabel =
      selectedGraphNode?.label ||
      selectedGraphEdge?.label ||
      (selectedGraphEdge ? "selected branch" : "selected box");
    const confirmed = await requestConfirmation(
      getWorkflowCanvasDeleteConfirmation({ itemLabel }),
    );
    if (!confirmed) {
      return;
    }

    saveWorkflowGraph(deleteState.graph, deleteState.label);
    setSelectedNodeId(deleteState.selectedNodeId);
    setSelectedEdgeId(deleteState.selectedEdgeId);
    setConnectFromNodeId(deleteState.connectFromNodeId);
  }

  useEffect(() => {
    function handleCanvasKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const targetElement = target instanceof Element ? target : null;
      const isContentEditable =
        target instanceof HTMLElement
          ? target.isContentEditable ||
            Boolean(target.closest("[contenteditable='true']"))
          : false;
      const shouldUndo = shouldHandleCanvasUndoKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        hasUndoHistory: workflowUndoStack.length > 0,
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (shouldUndo) {
        event.preventDefault();
        undoWorkflowChange();
        return;
      }

      const shouldRedo = shouldHandleCanvasRedoKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        hasRedoHistory: workflowRedoStack.length > 0,
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (shouldRedo) {
        event.preventDefault();
        redoWorkflowChange();
        return;
      }

      const shouldDelete = shouldHandleCanvasDeleteKey({
        key: event.key,
        hasSelection: Boolean(selectedGraphNode || selectedGraphEdge),
        targetTagName: targetElement?.tagName,
        isContentEditable,
      });

      if (!shouldDelete) {
        return;
      }

      event.preventDefault();
      void deleteSelectedCanvasItem();
    }

    window.addEventListener("keydown", handleCanvasKeyDown);
    return () => window.removeEventListener("keydown", handleCanvasKeyDown);
  });

  function updateSelectedEdge(patch: Partial<WorkflowGraphEdge>) {
    const result = getWorkflowUpdateSelectedEdgeState({
      graph: workflowGraph,
      selectedEdge: selectedGraphEdge,
      patch,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  function updateSelectedEdgeRule(
    key: "field" | "operator" | "value",
    value: string,
  ) {
    const result = getWorkflowUpdateSelectedEdgeRuleState({
      graph: workflowGraph,
      selectedEdge: selectedGraphEdge,
      workflowFields: workflow?.fields || [],
      key,
      value,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  function updateSelectedConditionCase(
    caseId: string,
    patch: Parameters<typeof getWorkflowUpdateConditionCaseState>[0]["patch"],
  ) {
    const result = getWorkflowUpdateConditionCaseState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      caseId,
      patch,
    });
    if (!result.didUpdate) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
  }

  async function deleteSelectedConditionCase(caseId: string) {
    const result = getWorkflowDeleteConditionCaseState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      caseId,
      activeOutcomeCaseId: conditionOutcomeCaseId,
    });
    if (!result.didUpdate) {
      return;
    }

    const confirmed = await requestConfirmation(
      getWorkflowCanvasDeleteConfirmation({ itemLabel: "selected condition" }),
    );
    if (!confirmed) {
      return;
    }

    saveWorkflowGraph(result.graph, result.label);
    setConditionOutcomeCaseId(result.activeOutcomeCaseId);
  }

  function addClickedOutcomeToConditionCase(targetNodeId: string) {
    const result = getWorkflowAddOutcomeTargetState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      activeOutcomeCaseId: conditionOutcomeCaseId,
      targetNodeId,
    });
    if (!result.didUpdate) {
      return false;
    }

    saveWorkflowGraph(result.graph, result.label);
    return true;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-white/10 bg-white/[0.03]">
        <div className="border-b border-white/10 p-4">
          <h2 className="font-semibold">
            {workflow ? workflow.name : "No templates"}
          </h2>
          {workflow ? (
            <p className="text-sm text-neutral-400">
              {workflow.business} - {workflow.department}
            </p>
          ) : (
            <p className="text-sm text-neutral-400">Use Builder.</p>
          )}
          {workflow && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-300">
                Version {workflow.version || 1}
              </span>
              <span
                className={`rounded-md border px-2 py-1 ${workflowLifecycleToneClassName(
                  workflowLifecycle.statusTone,
                )}`}
              >
                {workflowLifecycle.statusLabel}
              </span>
              {workflow.publishedAt && (
                <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-400">
                  Published {new Date(workflow.publishedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          <p className="mt-2 text-sm text-neutral-400">
            {workflowLifecycle.detail}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {workflowEditorTabs.map((tab) => {
              const activeClasses =
                workflowEditorTab === tab.id
                  ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                  : "border-white/10 bg-[#121518] text-neutral-300 hover:border-white/20";
              if (tab.mobileDisabled) {
                return (
                  <div key={tab.id} className="contents">
                    <button
                      type="button"
                      disabled
                      title="Canvas editing is available on tablet and desktop screens."
                      className="min-h-11 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-500 md:hidden"
                    >
                      {tab.label}
                      <span className="ml-1 text-xs">desktop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkflowEditorTab(tab.id)}
                      title={tab.label}
                      className={`hidden min-h-11 rounded-md border px-3 py-2 text-sm transition md:inline-flex md:items-center ${activeClasses}`}
                    >
                      {tab.label}
                    </button>
                  </div>
                );
              }
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setWorkflowEditorTab(tab.id)}
                  title={tab.label}
                  className={`min-h-11 rounded-md border px-3 py-2 text-sm transition ${activeClasses}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          {adminRecordError && (
            <p className="mt-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              {adminRecordError}
            </p>
          )}
          {workflowActionMessage && (
            <p className="mt-3 rounded-md border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100">
              {workflowActionMessage}
            </p>
          )}
        </div>
        {workflow && workflowEditorTab === "canvas" && (
          <div className="p-4">
            <div className="rounded-md border border-sky-400/30 bg-sky-400/10 p-4 text-sm text-sky-100 md:hidden">
              Canvas editing needs tablet or desktop.
            </div>
            <div className="hidden md:block">
            <div className="relative min-w-0">
              <WorkflowCanvasToolbar
                connectFromNode={connectFromNode}
                selectedNode={selectedGraphNode}
                conditionOutcomeCaseId={conditionOutcomeCaseId}
                onCreateNode={createCanvasNode}
                onCancelConnect={() => setConnectFromNodeId(null)}
                onDoneOutcomePick={() => setConditionOutcomeCaseId(null)}
              />

              <WorkflowRuntimePanel
                workflowTasks={workflowTasks}
                runtimeTask={runtimeTask}
                workflowSimulation={workflowSimulation}
                runtimeMissingDocuments={runtimeMissingDocuments}
                selectedRuntimeTaskId={selectedRuntimeTaskId}
                onSelectRuntimeTask={setSelectedRuntimeTaskId}
                workflowUndoStack={workflowUndoStack}
                workflowRedoStack={workflowRedoStack}
                lastWorkflowEdit={lastWorkflowEdit}
                onUndo={undoWorkflowChange}
                onRedo={redoWorkflowChange}
                onResetView={resetCanvasView}
                onRunWorkflowAction={onRunWorkflowAction}
              />
              <div className="mb-3 flex flex-col gap-2 rounded-md border border-white/10 bg-[#121518] p-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs text-neutral-400">
                    Copy from
                  </span>
                  <select
                    value={copySourceTemplateSelectValue}
                    onChange={(event) => setCopySourceTemplateId(event.target.value)}
                    className="h-10 w-full rounded-md border border-white/10 bg-[#0d1013] px-3 text-sm outline-none focus:border-emerald-400/60"
                  >
                    <option value="">Blank workflow</option>
                    {copySourceTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {formatWorkflowTemplateOptionLabel(template)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={copyTemplateIntoCanvas}
                  title="Copy the selected template workflow into the current canvas while keeping this template's name, business, and department. Choose Blank workflow to start fresh."
                  className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20"
                >
                  <ArrowRightLeft size={15} />
                  Copy
                </button>
              </div>
              <WorkflowCanvas
                graph={workflowGraph}
                runtimeTask={runtimeTask}
                highlightedNodeIds={Array.from(activeOutcomeTargetIds)}
                selectedEdgeId={selectedEdgeId}
                canvasInstanceKey={canvasInstanceKey}
                connectFromNodeId={connectFromNodeId}
                onConnect={connectWorkflowNodes}
                onMoveNode={moveWorkflowNode}
                onNodeSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedEdgeId(null);
                }}
                onEdgeSelect={(edgeId) => {
                  setSelectedEdgeId(edgeId);
                  setSelectedNodeId(null);
                }}
                onClearSelection={() => {
                  setSelectedNodeId(null);
                  setSelectedEdgeId(null);
                }}
                onOutcomeTargetClick={addClickedOutcomeToConditionCase}
              />

              {(selectedGraphNode || selectedGraphEdge) && (
                <aside className="fixed inset-x-3 bottom-3 top-24 z-40 overflow-y-auto rounded-md border border-white/10 bg-[#121518] p-4 shadow-2xl md:absolute md:inset-y-4 md:left-auto md:right-4 md:w-[380px]">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-300">
                      {selectedGraphNode ? "Box details" : "Branch details"}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void deleteSelectedCanvasItem()}
                        disabled={selectedGraphNode?.id === "start"}
                        title={
                          selectedGraphNode?.id === "start"
                            ? "The start box cannot be deleted."
                            : "Delete the selected box or branch from the workflow canvas."
                        }
                        className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 text-xs text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <X size={13} />
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                        title="Close the details panel."
                        className="flex size-8 items-center justify-center rounded-md border border-white/10 text-neutral-300 transition hover:bg-white/5"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>

                  {selectedGraphNode && (
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Type</span>
                    <select
                      value={selectedGraphNode.kind}
                      title="Choose what this box does in the workflow: submit request, approval, review, FYI, condition, return/reject, or end."
                      onChange={(event) =>
                        updateSelectedNode({
                          kind: event.target.value as WorkflowNodeKind,
                          blocking:
                            event.target.value !== "for_information" &&
                            event.target.value !== "end" &&
                            event.target.value !== "return_reject",
                        })
                      }
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    >
                      <option value="start">Start</option>
                      {workflowNodeOptions.map((option) => (
                        <option key={option.kind} value={option.kind}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-400">Name</span>
                    <input
                      value={selectedGraphNode.label}
                      title="Display name shown inside this workflow box on the canvas."
                      onChange={(event) => updateSelectedNode({ label: event.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </label>
                  {["submit_request", "approval", "review", "for_information"].includes(
                    selectedGraphNode.kind,
                  ) && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          {selectedGraphNode.kind === "submit_request"
                            ? "Submitter name"
                            : "Person name"}
                        </span>
                        <input
                          value={selectedGraphNode.assigneeName || ""}
                          title={
                            selectedGraphNode.kind === "submit_request"
                              ? "Name of the person expected to upload documents or fill information for this submit box."
                              : "Name of the person responsible for this approval, review, or information step."
                          }
                          onChange={(event) =>
                            updateSelectedNode({ assigneeName: event.target.value })
                          }
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          {selectedGraphNode.kind === "submit_request"
                            ? "Submitter email"
                            : "Person email"}
                        </span>
                        <input
                          value={selectedGraphNode.assigneeEmail || ""}
                          title={
                            selectedGraphNode.kind === "submit_request"
                              ? "Email address that can see this submit box's assigned upload requirements."
                              : "Email address that this workflow step will route to."
                          }
                          onChange={(event) =>
                            updateSelectedNode({ assigneeEmail: event.target.value })
                          }
                          type="email"
                          list="workflow-user-directory"
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        />
                      </label>
                    </>
                  )}
                  {selectedGraphNode.kind === "submit_request" && (
                    <div className="space-y-3 rounded-md border border-sky-500/20 bg-sky-500/10 p-3">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-sky-100">
                          Submitter
                        </p>
                        <InfoTip label="The person or team required to complete this submit box's documents or form fields." />
                      </div>
                      <label className="flex items-start gap-2 text-xs text-sky-50">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={Boolean(selectedGraphNode.allowSharedFulfillment)}
                          title="When enabled, this submitter can see other submit boxes' required uploads and choose to fulfill them."
                          onChange={(event) =>
                            updateSelectedNode({
                              allowSharedFulfillment: event.target.checked,
                              requireSharedFulfillmentConfirmation:
                                event.target.checked
                                  ? selectedGraphNode.requireSharedFulfillmentConfirmation !== false
                                  : selectedGraphNode.requireSharedFulfillmentConfirmation,
                            })
                          }
                        />
                        <span className="inline-flex items-center gap-1">
                          Shared uploads
                          <InfoTip label="Lets this submitter see and fulfill other submit boxes' upload requirements." />
                        </span>
                      </label>
                      {selectedGraphNode.allowSharedFulfillment && (
                        <label className="flex items-start gap-2 text-xs text-sky-50">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={
                              selectedGraphNode.requireSharedFulfillmentConfirmation !== false
                            }
                            title="When enabled, a reviewer or initiator must confirm before a shared upload satisfies another submit box."
                            onChange={(event) =>
                              updateSelectedNode({
                                requireSharedFulfillmentConfirmation:
                                  event.target.checked,
                              })
                            }
                          />
                          <span className="inline-flex items-center gap-1">
                            Confirm shared
                            <InfoTip label="Shared uploads must be accepted by the assigned submitter or current reviewer before they count." />
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                  {selectedGraphNode.kind !== "for_information" &&
                    selectedGraphNode.kind !== "end" &&
                    selectedGraphNode.kind !== "start" &&
                    selectedGraphNode.kind !== "submit_request" && (
                      <>
                        <label className="block">
                          <span className="mb-1 block text-xs text-neutral-400">
                            Due hours
                          </span>
                          <input
                            value={selectedGraphNode.dueInHours || 24}
                            title="Number of hours before this step becomes due."
                            onChange={(event) =>
                              updateSelectedNode({
                                dueInHours:
                                  Number.parseInt(event.target.value, 10) || 0,
                              })
                            }
                            inputMode="numeric"
                            className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                          />
                        </label>
                        {["approval", "review"].includes(selectedGraphNode.kind) && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block">
                              <span className="mb-1 block text-xs text-neutral-400">
                                Escalation name
                              </span>
                              <input
                                value={selectedGraphNode.escalationName || ""}
                                title="Name of the person who receives the task if this step is overdue."
                                onChange={(event) =>
                                  updateSelectedNode({
                                    escalationName: event.target.value,
                                  })
                                }
                                className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-neutral-400">
                                Escalation email
                              </span>
                              <input
                                value={selectedGraphNode.escalationEmail || ""}
                                title="Email address that receives the task when escalation is triggered."
                                onChange={(event) =>
                                  updateSelectedNode({
                                    escalationEmail: event.target.value,
                                  })
                                }
                                type="email"
                                list="workflow-user-directory"
                                className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  {selectedGraphNode.kind === "for_information" && (
                    <label className="flex items-center gap-2 text-sm text-neutral-300">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGraphNode.acknowledgementRequired)}
                        title="Require the FYI recipient to acknowledge that they have seen this item."
                        onChange={(event) =>
                          updateSelectedNode({
                            acknowledgementRequired: event.target.checked,
                          })
                        }
                      />
                      Require ack
                    </label>
                  )}
                  {workflow &&
                    ["approval", "review", "for_information"].includes(
                      selectedGraphNode.kind,
                    ) && (
                      <div className="space-y-3 rounded-md border border-white/10 bg-[#101214] p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-neutral-300">
                              Handoff
                            </p>
                            <InfoTip label="Default is all values and documents in a standard summary." />
                          </div>
                          <p className="mt-2 rounded-md border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-xs text-amber-100">
                            Display only. Access still needs server rules.
                          </p>
                        </div>
                        <datalist id="workflow-handoff-field-names">
                          {handoffFieldNames.map((fieldName) => (
                            <option key={fieldName} value={fieldName} />
                          ))}
                        </datalist>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Values
                            </span>
                            <select
                              value={
                                selectedGraphNode.handoffView?.fieldVisibility
                                  ?.mode || "all"
                              }
                              onChange={(event) =>
                                updateSelectedNodeHandoffView({
                                  fieldVisibility: {
                                    mode: event.target
                                      .value as NonNullable<
                                      NonNullable<
                                        WorkflowGraphNode["handoffView"]
                                      >["fieldVisibility"]
                                    >["mode"],
                                    fieldNames:
                                      selectedGraphNode.handoffView
                                        ?.fieldVisibility?.fieldNames || [],
                                  },
                                })
                              }
                              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                            >
                              {handoffFieldVisibilityOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs text-neutral-400">
                              Format
                            </span>
                            <select
                              value={selectedGraphNode.handoffView?.layout || "standard"}
                              onChange={(event) =>
                                updateSelectedNodeHandoffView({
                                  layout: event.target
                                    .value as NonNullable<
                                    WorkflowGraphNode["handoffView"]
                                  >["layout"],
                                })
                              }
                              className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                            >
                              {handoffLayoutOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        {selectedGraphNode.handoffView?.fieldVisibility?.mode &&
                          selectedGraphNode.handoffView.fieldVisibility.mode !==
                            "all" && (
                            <label className="block">
                              <span className="mb-1 block text-xs text-neutral-400">
                                Value names
                              </span>
                              <input
                                value={formatHandoffNameList(
                                  selectedGraphNode.handoffView.fieldVisibility
                                    .fieldNames,
                                )}
                                onChange={(event) =>
                                  updateSelectedNodeHandoffView({
                                    fieldVisibility: {
                                      mode:
                                        selectedGraphNode.handoffView
                                          ?.fieldVisibility?.mode || "selected",
                                      fieldNames: parseHandoffNameList(
                                        event.target.value,
                                      ),
                                    },
                                  })
                                }
                                list="workflow-handoff-field-names"
                                placeholder="Amount, Supplier"
                                className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                              />
                            </label>
                          )}
                        <label className="block">
                          <span className="mb-1 block text-xs text-neutral-400">
                            Documents
                          </span>
                          <select
                            value={
                              selectedGraphNode.handoffView?.documentVisibility
                                ?.mode || "all"
                            }
                            onChange={(event) =>
                              updateSelectedNodeHandoffView({
                                documentVisibility: {
                                  mode: event.target
                                    .value as NonNullable<
                                    NonNullable<
                                      WorkflowGraphNode["handoffView"]
                                    >["documentVisibility"]
                                  >["mode"],
                                  documentIds:
                                    selectedGraphNode.handoffView
                                      ?.documentVisibility?.documentIds || [],
                                },
                              })
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                          >
                            {handoffDocumentVisibilityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {selectedGraphNode.handoffView?.documentVisibility
                          ?.mode === "selected" && (
                          <div className="space-y-2 rounded-md border border-white/10 bg-[#121518] p-2">
                            {workflow.documents.map((document) => {
                              const selectedDocumentIds =
                                selectedGraphNode.handoffView
                                  ?.documentVisibility?.documentIds || [];
                              const isSelected = selectedDocumentIds.includes(
                                document.id,
                              );

                              return (
                                <label
                                  key={document.id}
                                  className="flex items-start gap-2 text-xs text-neutral-300"
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(event) =>
                                      updateSelectedNodeHandoffView({
                                        documentVisibility: {
                                          mode: "selected",
                                          documentIds: event.target.checked
                                            ? [
                                                ...selectedDocumentIds,
                                                document.id,
                                              ]
                                            : selectedDocumentIds.filter(
                                                (id) => id !== document.id,
                                              ),
                                        },
                                      })
                                    }
                                    className="mt-0.5"
                                  />
                                  <span>{document.documentType}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <div className="space-y-2 border-t border-white/10 pt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-neutral-400">
                              Checks
                            </p>
                            <button
                              type="button"
                              onClick={addSelectedNodeHandoffProcess}
                              className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/20"
                            >
                              <Plus size={13} />
                              Add
                            </button>
                          </div>
                          {(selectedGraphNode.handoffView?.processes || []).map(
                            (process) => (
                              <div
                                key={process.id}
                                className="space-y-2 rounded-md border border-white/10 bg-[#121518] p-2"
                              >
                                <div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]">
                                  <input
                                    value={process.label}
                                    onChange={(event) =>
                                      updateSelectedNodeHandoffProcess(process.id, {
                                        label: event.target.value,
                                      })
                                    }
                                    className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                  />
                                  <select
                                    value={process.type}
                                    onChange={(event) =>
                                      updateSelectedNodeHandoffProcess(process.id, {
                                        type: event.target
                                          .value as WorkflowHandoffProcess["type"],
                                      })
                                    }
                                    className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                  >
                                    {handoffProcessTypeOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSelectedNodeHandoffProcess(process.id)
                                    }
                                    className="flex h-9 items-center justify-center rounded-md border border-white/10 px-2 text-neutral-400 transition hover:border-rose-400/40 hover:text-rose-100"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr]">
                                  <input
                                    value={process.leftField}
                                    list="workflow-handoff-field-names"
                                    onChange={(event) =>
                                      updateSelectedNodeHandoffProcess(process.id, {
                                        leftField: event.target.value,
                                      })
                                    }
                                    className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                  />
                                  {process.type === "calculation" ? (
                                    <select
                                      value={process.calculation}
                                      onChange={(event) =>
                                        updateSelectedNodeHandoffProcess(process.id, {
                                          calculation: event.target
                                            .value as WorkflowHandoffCalculation,
                                        })
                                      }
                                      className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                    >
                                      {handoffCalculationOptions.map((option) => (
                                        <option
                                          key={option.value}
                                          value={option.value}
                                        >
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <select
                                      value={process.operator}
                                      onChange={(event) =>
                                        updateSelectedNodeHandoffProcess(process.id, {
                                          operator: event.target
                                            .value as WorkflowRuleOperator,
                                        })
                                      }
                                      className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                    >
                                      {handoffComparisonOperators.map((operator) => (
                                        <option key={operator} value={operator}>
                                          {operator}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <input
                                    value={process.rightField}
                                    list="workflow-handoff-field-names"
                                    onChange={(event) =>
                                      updateSelectedNodeHandoffProcess(process.id, {
                                        rightField: event.target.value,
                                      })
                                    }
                                    className="h-9 rounded-md border border-white/10 bg-[#101214] px-2 text-xs outline-none focus:border-emerald-400/60"
                                  />
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    )}
                  {selectedGraphNode.kind === "condition" && workflow && (
                    <ConditionBoxDetails
                      context={getConditionContext(
                        workflowGraph,
                        workflow,
                        selectedGraphNode,
                      )}
                      graph={workflowGraph}
                      conditionNode={selectedGraphNode}
                      coverage={analyzeConditionCoverage(
                        workflowGraph,
                        selectedGraphNode.id,
                      )}
                      activeOutcomeCaseId={conditionOutcomeCaseId}
                      onAddCase={addConditionCaseToSelectedBox}
                      onAddFallbackCase={addFallbackConditionCaseToSelectedBox}
                      onDeleteCase={(caseId) => void deleteSelectedConditionCase(caseId)}
                      onUpdateCase={updateSelectedConditionCase}
                      onStartOutcomePick={(caseId) =>
                        setConditionOutcomeCaseId((activeCaseId) =>
                          activeCaseId === caseId ? null : caseId,
                        )
                      }
                    />
                  )}
                  {["submit_request", "approval", "review"].includes(
                    selectedGraphNode.kind,
                  ) && (
                      <div className="rounded-md border border-white/10 bg-[#101214] p-3">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-neutral-400">
                            Recognition
                          </p>
                          <InfoTip
                            label={
                              selectedGraphNode.kind === "submit_request"
                                ? "Documents configured here are shown on the Upload page before submission."
                                : "Documents configured here are requested when this workflow box is active."
                            }
                          />
                        </div>
                        <div className="mt-2 space-y-2">
                          {workflow.documents
                            .filter((document) =>
                              selectedGraphNode.documentIds?.includes(document.id),
                            )
                            .map((document) => {
                              const isManualForm = isManualFormRequirement(document);

                              return (
                                <div
                                  key={document.id}
                                  className="rounded-md border border-white/10 bg-[#121518] p-2"
                                >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <label className="block">
                                      <span className="mb-1 block text-xs text-neutral-500">
                                        Document type
                                      </span>
                                      <input
                                        value={document.documentType}
                                        title="Business meaning of this document, such as Invoice, Doctor slip, or Delivery note."
                                        onChange={(event) =>
                                          updateBoxDocumentRequirement(document.id, {
                                            documentType: event.target.value,
                                          })
                                        }
                                        className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-sm outline-none focus:border-emerald-400/60"
                                      />
                                    </label>
                                    <label className="block">
                                      <span className="mb-1 block text-xs text-neutral-500">
                                        Input method
                                      </span>
                                      <select
                                        value={document.inputMode || "upload"}
                                        title="Choose whether the requester uploads a document for OCR or fills a digital form manually."
                                        onChange={(event) =>
                                          updateBoxDocumentRequirement(document.id, {
                                            inputMode: event.target.value as WorkflowDocumentInputMode,
                                          })
                                        }
                                        className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-sm outline-none focus:border-emerald-400/60"
                                      >
                                        {documentInputModeOptions.map((option) => (
                                          <option
                                            key={option.value}
                                            value={option.value}
                                          >
                                            {option.label}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                                      <label className="block">
                                        <span className="mb-1 block text-xs text-neutral-500">
                                          {isManualForm
                                            ? "Sample format"
                                            : "Format"}
                                        </span>
                                        <select
                                          value={document.format}
                                          title="File format expected for this document upload."
                                          onChange={(event) =>
                                            updateBoxDocumentRequirement(document.id, {
                                              format: event.target.value as DocumentFormat,
                                            })
                                          }
                                          className="h-9 w-full rounded-md border border-white/10 bg-[#101214] px-2 text-sm outline-none focus:border-emerald-400/60"
                                        >
                                          {documentFormatOptions.map((option) => (
                                            <option
                                              key={option.value}
                                              value={option.value}
                                            >
                                              {option.label}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <label className="flex h-9 items-center gap-2 text-xs text-neutral-300">
                                        <input
                                          type="checkbox"
                                          checked={document.required}
                                          title="Require this document before the workflow can proceed through this box."
                                          onChange={(event) =>
                                            updateBoxDocumentRequirement(document.id, {
                                              required: event.target.checked,
                                            })
                                          }
                                        />
                                        {isManualForm ? "Required form" : "Required"}
                                      </label>
                                    </div>
                                    <p className="rounded-md border border-white/10 bg-[#101214] px-2 py-1 text-xs text-neutral-500">
                                      {formatDocumentInputMode(document.inputMode || "upload")}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateSelectedNode({
                                        documentIds: (
                                          selectedGraphNode.documentIds || []
                                        ).filter((id) => id !== document.id),
                                      })
                                    }
                                    title="Remove this document requirement from the selected box."
                                    className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/10 text-neutral-400 transition hover:border-rose-400/40 hover:text-rose-100"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                                <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
                                  <div className="rounded-md border border-sky-500/20 bg-sky-500/10 p-2">
                                    <p className="text-xs font-semibold text-sky-100">
                                      Fields
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-neutral-400">
                                        Edit fields
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => addBoxDocumentField(document.id)}
                                      title="Add another field to extract from this document."
                                      className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
                                    >
                                      <Plus size={12} />
                                      Add field
                                    </button>
                                  </div>
                                  {document.fields.map((field, fieldIndex) => (
                                    <div
                                      key={`${document.id}-${field.name}-${fieldIndex}`}
                                      className="space-y-2 rounded-md border border-white/10 bg-[#101214] p-2"
                                    >
                                      <div className="flex items-center gap-2">
                                        <input
                                          value={field.label}
                                          title="Field name shown to users, such as Amount, Invoice date, or Quantity."
                                          onChange={(event) =>
                                            updateBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                              { label: event.target.value },
                                            )
                                          }
                                          className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-[#121518] px-2 text-sm outline-none focus:border-emerald-400/60"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                            )
                                          }
                                          title="Remove this extracted field from the document requirement."
                                          className="flex size-8 shrink-0 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20"
                                        >
                                          <X size={13} />
                                        </button>
                                      </div>
                                      <input
                                        value={field.instructions}
                                        title="Instruction for the extractor, for example where to find the value or how to interpret it."
                                        onChange={(event) =>
                                          updateBoxDocumentField(
                                            document.id,
                                            fieldIndex,
                                            { instructions: event.target.value },
                                          )
                                        }
                                        placeholder="Instruction"
                                        className="h-9 w-full rounded-md border border-white/10 bg-[#121518] px-2 text-xs outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                                      />
                                      <label className="flex items-center gap-2 text-xs text-neutral-400">
                                        <input
                                          type="checkbox"
                                          checked={field.required}
                                          title="Require this extracted field to be present before continuing."
                                          onChange={(event) =>
                                            updateBoxDocumentField(
                                              document.id,
                                              fieldIndex,
                                              { required: event.target.checked },
                                            )
                                          }
                                        />
                                        Required field
                                      </label>
                                    </div>
                                  ))}
                                  {!document.fields.length && (
                                    <p className="text-xs text-neutral-500">
                                  No fields yet.
                                    </p>
                                  )}
                                  <TemplateDocumentRecognitionPanel
                                    document={document}
                                    template={workflow}
                                    onAddField={(field, example) =>
                                      addRecognizedDocumentField(
                                        document.id,
                                        field,
                                        example,
                                      )
                                    }
                                  />
                                </div>
                              </div>
                              );
                            })}
                          {!selectedGraphNode.documentIds?.length && (
                            <p className="text-xs text-neutral-500">
                              No documents yet.
                            </p>
                          )}
                        </div>
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                          <input
                            value={boxDocumentType}
                            title="Name the new document requirement to add to this box."
                            onChange={(event) => setBoxDocumentType(event.target.value)}
                            placeholder="Type, e.g. Doctor slip"
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                          />
                          <select
                            value={boxDocumentInputMode}
                            title="Choose whether this requirement is a requester upload or a manual digital form."
                            onChange={(event) =>
                              setBoxDocumentInputMode(
                                event.target.value as WorkflowDocumentInputMode,
                              )
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                          >
                            {documentInputModeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={boxDocumentFormat}
                            title="Choose the file format expected for the new document requirement."
                            onChange={(event) =>
                              setBoxDocumentFormat(event.target.value as DocumentFormat)
                            }
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none focus:border-emerald-400/60"
                          >
                            {documentFormatOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm text-neutral-300">
                            <input
                              type="checkbox"
                              checked={boxDocumentRequired}
                              title="Mark the new requirement as mandatory for this box."
                              onChange={(event) =>
                                setBoxDocumentRequired(event.target.checked)
                              }
                            />
                            {boxDocumentInputMode === "manual_form"
                              ? "Required form"
                              : "Required upload"}
                          </label>
                          <button
                            type="button"
                            onClick={addDocumentToSelectedBox}
                            title="Add this input requirement to the selected workflow box."
                            className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-emerald-400/40 bg-emerald-400/12 px-3 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20"
                          >
                            <Plus size={15} />
                            Add requirement
                          </button>
                        </div>
                      </div>
                  )}
                    </div>
                  )}

                  {selectedGraphEdge && (
                    <WorkflowEdgeDetails
                      edge={selectedGraphEdge}
                      workflowFields={workflow.fields}
                      onUpdateEdge={updateSelectedEdge}
                      onUpdateEdgeRule={updateSelectedEdgeRule}
                    />
                  )}
                </aside>
              )}
              <UserDirectoryDatalist
                id="workflow-user-directory"
                users={userDirectory}
              />
            </div>
            <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={publishSelectedTemplate}
                disabled={!workflowLifecycle.canPublish}
                title={workflowLifecycle.publishTitle}
                className="flex min-h-10 w-full items-center justify-center rounded-md border border-sky-400/40 bg-sky-400/12 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {workflowLifecycle.publishLabel}
              </button>
            </div>
            </div>
          </div>
        )}

        {workflowEditorTab === "library" && (
          <WorkflowTemplateLibrary
            workflowTemplates={workflowTemplates}
            selectedTemplateId={workflow?.id || ""}
            onSelectTemplate={setSelectedTemplateId}
            onLoadTemplate={loadTemplateIntoBuilder}
            onDuplicateTemplate={duplicateTemplateAsDraft}
            onDeleteTemplate={onDeleteTemplate}
            onActivateTemplateVersion={onActivateTemplateVersion}
            onUpdateTemplateVersionComment={onUpdateTemplateVersionComment}
            activeUserEmail={activeUser.email}
            activeUserRole={activeUser.role}
          />
        )}
      </section>

      {workflowEditorTab === "builder" && (
        <WorkflowTemplateBuilder
          templateName={templateName}
          setTemplateName={setTemplateName}
          businessDirectory={businessDirectory}
          businessId={businessId}
          setBusinessId={setBusinessId}
          departmentName={departmentName}
          setDepartmentName={setDepartmentName}
          baseTemplateId={baseTemplateId}
          setBaseTemplateId={setBaseTemplateId}
          baseTemplates={baseWorkflowTemplates}
          onCreateTemplate={createTemplate}
        />
      )}
    </div>
  );
}

function workflowLifecycleToneClassName(statusTone: string) {
  if (statusTone === "published") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }
  if (statusTone === "archived") {
    return "border-neutral-500/30 bg-neutral-500/10 text-neutral-300";
  }
  if (statusTone === "empty") {
    return "border-white/10 bg-white/[0.04] text-neutral-400";
  }
  return "border-amber-400/30 bg-amber-400/10 text-amber-100";
}

function getWorkflowHandoffFieldNames(template: WorkflowTemplate) {
  const fieldNames = [
    ...template.fields.map((field) => field.label || field.name),
    ...template.documents.flatMap((document) =>
      document.fields.map((field) => field.label || field.name),
    ),
  ];

  return Array.from(
    new Set(fieldNames.map((fieldName) => fieldName.trim()).filter(Boolean)),
  );
}

function parseHandoffNameList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatHandoffNameList(value?: string[]) {
  return (value || []).join(", ");
}

function nextHandoffProcessId(processes: WorkflowHandoffProcess[]) {
  let index = processes.length + 1;
  let id = `handoff-check-${index}`;
  const existingIds = new Set(processes.map((process) => process.id));

  while (existingIds.has(id)) {
    index += 1;
    id = `handoff-check-${index}`;
  }

  return id;
}

function applyHandoffProcessPatch(
  process: WorkflowHandoffProcess,
  patch: HandoffProcessPatch,
): WorkflowHandoffProcess {
  const type = patch.type || process.type;
  const label = patch.label ?? process.label;
  const leftField = patch.leftField ?? process.leftField;
  const rightField = patch.rightField ?? process.rightField;

  if (type === "calculation") {
    return {
      id: process.id,
      type,
      label,
      leftField,
      rightField,
      calculation:
        patch.calculation ||
        (process.type === "calculation" ? process.calculation : "difference"),
    };
  }

  return {
    id: process.id,
    type,
    label,
    leftField,
    rightField,
    operator:
      patch.operator || (process.type === "comparison" ? process.operator : "="),
  };
}
