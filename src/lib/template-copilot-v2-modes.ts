import { z } from "zod";
import { normalizeTemplateCopilotV2Candidates, type TemplateCopilotV2Candidate } from "./template-copilot-v2-candidates.ts";
import { templateCopilotFactIds, templateCopilotCommittedValueSchemas, type TemplateCopilotFactId } from "./template-copilot-v2-canonical-values.ts";
import {
  templateCopilotV2AuthoringModes,
  type TemplateCopilotV2SourceSnapshot,
} from "./template-copilot-v2-mode-contract.ts";

export {
  templateCopilotV2AuthoringModes,
  templateCopilotV2ModeCopy,
  type TemplateCopilotV2AuthoringMode,
  type TemplateCopilotV2ModeState,
  type TemplateCopilotV2SourceSnapshot,
} from "./template-copilot-v2-mode-contract.ts";

export const templateCopilotV2ModeCommandSchema = z.object({
  expectedRevision: z.number().int().min(1),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  mode: z.enum(templateCopilotV2AuthoringModes),
  sourceVersionId: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  if (value.mode === "similar_template" && !value.sourceVersionId) context.addIssue({ code: "custom", path: ["sourceVersionId"], message: "Choose an authorized template version." });
  if (value.mode !== "similar_template" && value.sourceVersionId) context.addIssue({ code: "custom", path: ["sourceVersionId"], message: "Only similar-template mode accepts a source version." });
});

/** Maps already-explicit compatible template content into reviewable
 * candidates. It never fabricates a purpose, policy, person, or route, and
 * every mapped primitive remains leaf-evidenced against the frozen version. */
export function candidatesFromTemplateCopilotV2SourceSnapshot(source: TemplateCopilotV2SourceSnapshot): readonly TemplateCopilotV2Candidate[] {
  const snapshot = record(source.templateSnapshot, "template snapshot");
  const candidateValues: Partial<Record<TemplateCopilotFactId, unknown>> = {};
  if (typeof snapshot.name === "string" && snapshot.name.trim()) candidateValues["workflow.name"] = snapshot.name.trim();
  const fields = array(snapshot.fields).map((item) => record(item, "field")).flatMap((item) => {
    const candidate = { label: typeof item.label === "string" ? item.label.trim() : "", type: item.type, required: item.required, options: Array.isArray(item.options) ? item.options.filter((value): value is string => typeof value === "string") : [] };
    return candidate.label && templateCopilotCommittedValueSchemas["request.fields"].safeParse([candidate]).success ? [candidate] : [];
  });
  if (fields.length && templateCopilotCommittedValueSchemas["request.fields"].safeParse(fields).success) candidateValues["request.fields"] = fields;
  const attachments = array(snapshot.documents).flatMap((item) => {
    const document = optionalRecord(item);
    const candidate = {
      label: typeof document?.documentType === "string" ? document.documentType.trim() : "",
      required: document?.required,
      formats: typeof document?.format === "string" ? [document.format] : [],
    };
    return candidate.label && templateCopilotCommittedValueSchemas["attachments.requirements"].safeParse([candidate]).success
      ? [candidate]
      : [];
  });
  if (attachments.length) candidateValues["attachments.requirements"] = attachments;
  const linearNodes = orderedLinearSourceNodes(snapshot);
  const actionableNodes = linearNodes?.filter((node) => sourceStageKinds[String(node.kind)]) || [];
  const stages = actionableNodes.map(sourceStageCandidate);
  if (stages.length && stages.every((stage) => stage !== null)) {
    candidateValues["workflow.stages"] = stages.map((stage, index) => ({ ...stage, sequence: index + 1 }));
  }
  const dueHours = actionableNodes.map((node) => node.dueInHours);
  if (
    dueHours.length
    && dueHours.every((value): value is number => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 8_760)
    && dueHours.every((value) => value === dueHours[0])
  ) {
    candidateValues["timing.rules"] = { defaultDueHours: dueHours[0] };
  }
  // Other source structures remain intentionally unmapped when their runtime
  // shape cannot prove the stricter canonical meaning without interpretation.
  const sourceMessageId = `template-version:${source.versionId}`;
  const evidenceDocument = deterministicSourceEvidenceDocument(candidateValues);
  const raw = templateCopilotFactIds.flatMap((factId) => {
    const value = candidateValues[factId];
    const originalWording = evidenceDocument.lines.get(factId);
    if (value === undefined || !originalWording || !templateCopilotCommittedValueSchemas[factId].safeParse(value).success) return [];
    const evidence = sourceEvidenceForValue(evidenceDocument.sourceText, sourceMessageId, factId, value);
    return evidence && evidence.length <= 200
      ? [{ factId, valueType: sourceValueType[factId], value, originalWording, confidence: "high", ambiguity: "none", evidence } satisfies TemplateCopilotV2Candidate]
      : [];
  });
  // Source import deliberately uses the identical hostile-output normalizer
  // as model extraction. This rejects any candidate whose leaf evidence no
  // longer proves its typed value instead of treating a template as trusted.
  return raw.flatMap((candidate) =>
    normalizeTemplateCopilotV2Candidates({
      output: { candidates: [candidate] },
      messages: { [sourceMessageId]: evidenceDocument.sourceText },
    }).candidates
  );
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function record(value: unknown, label: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${label}.`); return value as Record<string, unknown>; }
function optionalRecord(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }

const sourceStageKinds: Record<string, "approval" | "review" | "for_information" | "submission"> = {
  approval: "approval",
  review: "review",
  for_information: "for_information",
  submit_request: "submission",
};

function sourceStageCandidate(node: Record<string, unknown>) {
  const kind = sourceStageKinds[String(node.kind)];
  if (!kind || typeof node.label !== "string" || !node.label.trim()) return null;
  if (kind === "submission") {
    return { label: node.label.trim(), kind, participant: { mode: "requester" as const } };
  }
  if (
    node.assigneeEmailFixed === true
    && typeof node.assigneeEmail === "string"
    && node.assigneeEmail.trim()
  ) {
    return {
      label: node.label.trim(),
      kind,
      participant: { mode: "fixed_email" as const, value: node.assigneeEmail.trim() },
    };
  }
  return null;
}

/** A flat stage fact cannot represent branches, joins, disconnected nodes, or
 * correction loops. Import stages only when the frozen graph proves one
 * complete linear path; otherwise omit the fact rather than changing meaning. */
function orderedLinearSourceNodes(snapshot: Record<string, unknown>) {
  const graph = optionalRecord(snapshot.graph);
  const nodes = array(graph?.nodes).flatMap((value) => {
    const node = optionalRecord(value);
    return node && typeof node.id === "string" ? [node] : [];
  });
  if (!nodes.length) return null;
  if (nodes.length === 1) return nodes;
  const byId = new Map(nodes.map((node) => [String(node.id), node]));
  if (byId.size !== nodes.length) return null;
  const outgoing = new Map<string, string>();
  const incoming = new Map<string, string>();
  for (const value of array(graph?.edges)) {
    const edge = optionalRecord(value);
    if (
      !edge
      || typeof edge.sourceId !== "string"
      || typeof edge.targetId !== "string"
      || !byId.has(edge.sourceId)
      || !byId.has(edge.targetId)
      || outgoing.has(edge.sourceId)
      || incoming.has(edge.targetId)
    ) return null;
    outgoing.set(edge.sourceId, edge.targetId);
    incoming.set(edge.targetId, edge.sourceId);
  }
  if (outgoing.size !== nodes.length - 1 || incoming.size !== nodes.length - 1) return null;
  const starts = nodes.filter((node) => !incoming.has(String(node.id)));
  if (starts.length !== 1) return null;
  const visited = new Set<string>();
  const ordered: Record<string, unknown>[] = [];
  let id: string | undefined = String(starts[0].id);
  while (id !== undefined) {
    if (visited.has(id)) return null;
    visited.add(id);
    const node = byId.get(id);
    if (!node) return null;
    ordered.push(node);
    id = outgoing.get(id);
  }
  return ordered.length === nodes.length ? ordered : null;
}

/** A bounded deterministic evidence document is reconstructed from the
 * persisted version. Each candidate's original wording is its exact <=8k fact
 * line, while the shared source remains within the 80k evidence offset bound. */
function deterministicSourceEvidenceDocument(values: Partial<Record<TemplateCopilotFactId, unknown>>) {
  const lines = new Map<TemplateCopilotFactId, string>();
  let sourceText = "";
  for (const factId of templateCopilotFactIds) {
    if (values[factId] === undefined) continue;
    const line = `${factId}:${stableJson(values[factId])}`;
    if (Array.from(line).length > 8_000) continue;
    const next = sourceText ? `${sourceText}\n${line}` : line;
    if (Array.from(next).length > 80_000) continue;
    lines.set(factId, line);
    sourceText = next;
  }
  return { lines, sourceText };
}
function sourceEvidenceForValue(sourceText: string, messageId: string, factId: TemplateCopilotFactId, value: unknown) {
  const prefix = `${factId}:`;
  const prefixOffset = sourceText.indexOf(prefix);
  if (prefixOffset < 0) return null;
  const leaves = primitiveLeaves(value);
  const evidence: TemplateCopilotV2Candidate["evidence"] = [];
  let cursor = prefixOffset + prefix.length;
  for (const leaf of leaves) {
    const encoded = typeof leaf.value === "string" ? leaf.value : JSON.stringify(leaf.value);
    const start = sourceText.indexOf(encoded, cursor);
    if (start < 0) return null;
    evidence.push({ path: leaf.path, messageId, startCodePoint: Array.from(sourceText.slice(0, start)).length, endCodePoint: Array.from(sourceText.slice(0, start + encoded.length)).length, exactText: encoded, normalizationRule: typeof leaf.value === "string" ? "exact" : undefined });
    cursor = start + encoded.length;
  }
  return evidence;
}
function primitiveLeaves(value: unknown, path = ""): Array<{ path: string; value: string | number | boolean | null }> {
  if (value === null || typeof value !== "object") return [{ path: path || "/", value: value as string | number | boolean | null }];
  if (Array.isArray(value)) return value.flatMap((item, index) => primitiveLeaves(item, `${path}/${index}`));
  return Object.keys(value as Record<string, unknown>).sort().flatMap((key) => primitiveLeaves((value as Record<string, unknown>)[key], `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`));
}
function stableJson(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; const object = value as Record<string, unknown>; return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`; }

const sourceValueType: Record<TemplateCopilotFactId, TemplateCopilotV2Candidate["valueType"]> = {
  "workflow.name": "text", "workflow.purpose": "text", "workflow.scope": "policy", "request.initiator_policy": "initiator_policy", "request.fields": "fields", "attachments.requirements": "attachments", "workflow.stages": "stages", "workflow.conditions": "conditions", "workflow.rejection_policy": "rejection_policy", "collaboration.policy": "policy", "timing.rules": "timing_rules", "visibility.policy": "policy", "notifications.rules": "notifications", "governance.owner": "text", "governance.policies": "policy", "governance.retention": "retention",
};
