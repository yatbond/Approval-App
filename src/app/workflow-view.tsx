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
  documentFormatOptions,
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
  getWorkflowCreateTemplateActionState,
  getWorkflowDuplicateTemplateActionState,
  getWorkflowPublishTemplateActionState,
} from "@/lib/workflow-template-action-state";
import {
  defaultWorkflowEditorTab,
  workflowEditorTabs,
  type WorkflowEditorTab,
} from "@/lib/workflow-editor-tabs-state";
import { workflowPublishAction } from "@/lib/workflow-publish-action-state";
import {
  getWorkflowRedoActionState,
  getWorkflowUndoActionState,
} from "@/lib/workflow-history-action-state";
import {
  getWorkflowMoveNodeState,
  getWorkflowUpdateSelectedNodeState,
} from "@/lib/workflow-node-patch-state";
import type {
  ApprovalAction,
  ApprovalTask,
  BusinessUnit,
  DocumentFormat,
  WorkflowGraph,
  WorkflowGraphEdge,
  WorkflowGraphNode,
  WorkflowNodeKind,
  WorkflowField,
  WorkflowTemplate,
} from "@/lib/types";

const WorkflowCanvas = dynamic(() => import("@/app/workflow-canvas"), {
  loading: () => (
    <div className="grid h-[68vh] min-h-[420px] place-items-center rounded-md border border-white/10 bg-[#0d1013] text-sm text-neutral-500 lg:h-[calc(100vh-250px)] lg:min-h-[640px]">
      Loading workflow canvas...
    </div>
  ),
  ssr: false,
});

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
  userDirectory,
  activeUser,
  onRunWorkflowAction,
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
  userDirectory: UserDirectoryEntry[];
  activeUser: UserDirectoryEntry;
  onRunWorkflowAction: (taskId: string, action: ApprovalAction) => void;
}) {
  const workflow =
    workflowTemplates.find((template) => template.id === selectedTemplateId) ||
    workflowTemplates[0];
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
  const copySourceTemplates = useMemo(
    () => workflowTemplates.filter((template) => template.id !== workflow?.id),
    [workflowTemplates, workflow?.id],
  );
  const [copySourceTemplateId, setCopySourceTemplateId] = useState("");
  const [workflowActionMessage, setWorkflowActionMessage] = useState("");
  const copySourceTemplate =
    copySourceTemplates.find((template) => template.id === copySourceTemplateId) ||
    copySourceTemplates[0] ||
    null;
  const copySourceTemplateSelectValue = copySourceTemplate?.id || "";

  function createTemplate() {
    const nextState = getWorkflowCreateTemplateActionState({
      templateName,
      selectedBusinessName: selectedBusiness?.name || null,
      departmentName,
    });
    if (!nextState.didCreate || !nextState.template) {
      return;
    }

    onCreateTemplate(nextState.template);
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
    if (!workflow || !copySourceTemplate) {
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
      required: boxDocumentRequired,
    });
    if (!nextState.didUpdate || !nextState.resetForm) {
      return;
    }

    saveWorkflowTemplate(nextState.template, nextState.label);
    setBoxDocumentType(nextState.resetForm.documentType);
    setBoxDocumentFormat(nextState.resetForm.format);
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

  function deleteSelectedCanvasItem() {
    const deleteState = getWorkflowCanvasDeleteState({
      graph: workflowGraph,
      selectedNodeId,
      selectedEdgeId,
      connectFromNodeId,
    });
    if (!deleteState.didDelete) {
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
      deleteSelectedCanvasItem();
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

  function deleteSelectedConditionCase(caseId: string) {
    const result = getWorkflowDeleteConditionCaseState({
      graph: workflowGraph,
      selectedNodeId: selectedGraphNode?.id || null,
      caseId,
      activeOutcomeCaseId: conditionOutcomeCaseId,
    });
    if (!result.didUpdate) {
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
            {workflow ? workflow.name : "No workflow templates yet"}
          </h2>
          <p className="text-sm text-neutral-400">
            {workflow
              ? `${workflow.business} - ${workflow.department} - ${workflow.documentTypes.join(", ")}`
              : "Create the first template from the builder."}
          </p>
          {workflow && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-300">
                Version {workflow.version || 1}
              </span>
              <span
                className={`rounded-md border px-2 py-1 ${
                  workflow.isDraft === false
                    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                    : "border-amber-400/30 bg-amber-400/10 text-amber-100"
                }`}
              >
                {workflow.isDraft === false ? "Published" : "Draft"}
              </span>
              {workflow.publishedAt && (
                <span className="rounded-md border border-white/10 bg-[#121518] px-2 py-1 text-neutral-400">
                  Published {new Date(workflow.publishedAt).toLocaleString()}
                </span>
              )}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {workflowEditorTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setWorkflowEditorTab(tab.id)}
                className={`min-h-9 rounded-md border px-3 py-2 text-sm transition ${
                  workflowEditorTab === tab.id
                    ? "border-emerald-400/40 bg-emerald-400/12 text-emerald-100"
                    : "border-white/10 bg-[#121518] text-neutral-300 hover:border-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
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
              {copySourceTemplates.length > 0 && (
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-white/10 bg-[#121518] p-3 sm:flex-row sm:items-end">
                  <label className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs text-neutral-400">
                      Copy workflow from template
                    </span>
                    <select
                      value={copySourceTemplateSelectValue}
                      onChange={(event) => setCopySourceTemplateId(event.target.value)}
                      className="h-10 w-full rounded-md border border-white/10 bg-[#0d1013] px-3 text-sm outline-none focus:border-emerald-400/60"
                    >
                      {copySourceTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={copyTemplateIntoCanvas}
                    disabled={!copySourceTemplate}
                    title="Copy the selected template workflow into the current canvas while keeping this template's name, business, and department."
                    className="flex min-h-10 items-center justify-center gap-2 rounded-md border border-sky-400/40 bg-sky-400/12 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ArrowRightLeft size={15} />
                    Copy into canvas
                  </button>
                </div>
              )}
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
                        onClick={deleteSelectedCanvasItem}
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
                    <span className="mb-1 block text-xs text-neutral-400">Box type</span>
                    <select
                      value={selectedGraphNode.kind}
                      title="Choose what this box does in the workflow: approval, review, FYI, condition, return/reject, or end."
                      onChange={(event) =>
                        updateSelectedNode({
                          kind: event.target.value as WorkflowNodeKind,
                          blocking: event.target.value !== "for_information",
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
                    <span className="mb-1 block text-xs text-neutral-400">Box name</span>
                    <input
                      value={selectedGraphNode.label}
                      title="Display name shown inside this workflow box on the canvas."
                      onChange={(event) => updateSelectedNode({ label: event.target.value })}
                      className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                    />
                  </label>
                  {["approval", "review", "for_information"].includes(
                    selectedGraphNode.kind,
                  ) && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          Person name
                        </span>
                        <input
                          value={selectedGraphNode.assigneeName || ""}
                          title="Name of the person responsible for this approval, review, or information step."
                          onChange={(event) =>
                            updateSelectedNode({ assigneeName: event.target.value })
                          }
                          className="h-10 w-full rounded-md border border-white/10 bg-[#101214] px-3 text-sm outline-none focus:border-emerald-400/60"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs text-neutral-400">
                          Person email
                        </span>
                        <input
                          value={selectedGraphNode.assigneeEmail || ""}
                          title="Email address that this workflow step will route to."
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
                  {selectedGraphNode.kind !== "for_information" &&
                    selectedGraphNode.kind !== "end" && (
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
                      Acknowledgement required
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm text-neutral-300">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedGraphNode.blocking)}
                      disabled={selectedGraphNode.kind === "for_information"}
                      title="When enabled, the workflow waits here before continuing. FYI boxes are non-blocking."
                      onChange={(event) =>
                        updateSelectedNode({ blocking: event.target.checked })
                      }
                    />
                    Blocking step
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setConnectFromNodeId(selectedGraphNode.id);
                      setSelectedEdgeId(null);
                    }}
                    title="Start drawing a connection from this box to another box on the canvas."
                    className={`flex min-h-10 w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                      connectFromNodeId === selectedGraphNode.id
                        ? "border-sky-400/50 bg-sky-400/15 text-sky-100"
                        : "border-sky-400/40 bg-sky-400/12 text-sky-100 hover:bg-sky-400/20"
                    }`}
                  >
                    <ArrowRightLeft size={15} />
                    {connectFromNodeId === selectedGraphNode.id
                      ? "Click target box"
                      : "Connect from this box"}
                  </button>
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
                      onDeleteCase={deleteSelectedConditionCase}
                      onUpdateCase={updateSelectedConditionCase}
                      onStartOutcomePick={(caseId) =>
                        setConditionOutcomeCaseId((activeCaseId) =>
                          activeCaseId === caseId ? null : caseId,
                        )
                      }
                    />
                  )}
                  {["approval", "review"].includes(selectedGraphNode.kind) && (
                      <div className="rounded-md border border-white/10 bg-[#101214] p-3">
                        <p className="text-xs font-semibold text-neutral-400">
                          Recognition setup for this box
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Template fields configured here become the required fields that the Upload page reviews first.
                        </p>
                        <div className="mt-2 space-y-2">
                          {workflow.documents
                            .filter((document) =>
                              selectedGraphNode.documentIds?.includes(document.id),
                            )
                            .map((document) => (
                              <div
                                key={document.id}
                                className="rounded-md border border-white/10 bg-[#121518] p-2"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <label className="block">
                                      <span className="mb-1 block text-[11px] text-neutral-500">
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
                                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                                      <label className="block">
                                        <span className="mb-1 block text-[11px] text-neutral-500">
                                          Document format
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
                                        Required
                                      </label>
                                    </div>
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
                                      Step 1: Required template fields
                                    </p>
                                    <p className="mt-1 text-[11px] text-sky-100/70">
                                      These fields guide OCR and appear first when a request document is uploaded.
                                    </p>
                                  </div>
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold text-neutral-400">
                                        Step 2: Add / correct fields
                                      </p>
                                      <p className="mt-1 text-[11px] text-neutral-500">
                                        Add field names and extraction instructions for this document type.
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => addBoxDocumentField(document.id)}
                                      title="Add another field to extract from this document."
                                      className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-sky-400/40 bg-sky-400/12 px-2 text-xs text-sky-100 transition hover:bg-sky-400/20"
                                    >
                                      <Plus size={12} />
                                      Add template field
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
                                        placeholder="Extraction instruction"
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
                                      No template fields configured. Add at least one field so the Upload page knows what to extract.
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          {!selectedGraphNode.documentIds?.length && (
                            <p className="text-xs text-neutral-500">
                              No documents are required at this box yet.
                            </p>
                          )}
                        </div>
                        <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                          <input
                            value={boxDocumentType}
                            title="Name the new document requirement to add to this box."
                            onChange={(event) => setBoxDocumentType(event.target.value)}
                            placeholder="Document type, e.g. Doctor slip"
                            className="h-10 w-full rounded-md border border-white/10 bg-[#121518] px-3 text-sm outline-none placeholder:text-neutral-600 focus:border-emerald-400/60"
                          />
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
                              title="Mark the new document requirement as mandatory for this box."
                              onChange={(event) =>
                                setBoxDocumentRequired(event.target.checked)
                              }
                            />
                            Required upload
                          </label>
                          <button
                            type="button"
                            onClick={addDocumentToSelectedBox}
                            title="Add this document upload requirement to the selected workflow box."
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
                title={workflowPublishAction.title}
                className="flex min-h-10 w-full items-center justify-center rounded-md border border-sky-400/40 bg-sky-400/12 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 sm:w-auto"
              >
                {workflowPublishAction.label}
              </button>
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
          onCreateTemplate={createTemplate}
        />
      )}
    </div>
  );
}
