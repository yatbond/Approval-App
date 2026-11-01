import {
  templateCopilotFactIds,
  type TemplateCopilotFactId,
} from "./template-copilot-v2-canonical-values.ts";
import type { TemplateCopilotV2CandidateRejection } from "./template-copilot-v2-candidates.ts";

export const templateCopilotV2ExtractionDiagnosticSchemaVersion = 1 as const;

export const templateCopilotV2ExtractionTerminalCodes = [
  "candidates_applied",
  "no_candidates",
  "no_usable_candidates",
  "no_new_candidates",
  "provider_failure",
] as const;

export const templateCopilotV2ExtractionRejectionDiagnosticCodes = [
  "model_schema_invalid",
  "untraceable_evidence_shape",
  "untraceable_leaf_paths",
  "untraceable_ambiguous_quote",
  "untraceable_quote_positions",
  "untraceable_source_passage",
  "untraceable_normalization",
  "untraceable_atomic_incomplete",
  "untraceable_atomic_conflict",
  "untraceable_atomic_value_invalid",
  "untraceable_atomic_candidate_invalid",
  "untraceable_out_of_section",
  "untraceable_other",
  "overlapping_span",
  "other",
] as const;

export type TemplateCopilotV2ExtractionTerminalCode =
  (typeof templateCopilotV2ExtractionTerminalCodes)[number];
export type TemplateCopilotV2ExtractionRejectionDiagnosticCode =
  (typeof templateCopilotV2ExtractionRejectionDiagnosticCodes)[number];

export type TemplateCopilotV2ExtractionDiagnostics = Readonly<{
  schemaVersion: typeof templateCopilotV2ExtractionDiagnosticSchemaVersion;
  terminalCode: TemplateCopilotV2ExtractionTerminalCode;
  acceptedCandidateCount: number;
  rejectedCandidateCount: number;
  rejectionCodeCounts: Readonly<
    Partial<
      Record<TemplateCopilotV2ExtractionRejectionDiagnosticCode, number>
    >
  >;
  rejectedFactCounts: Readonly<
    Partial<Record<TemplateCopilotFactId, number>>
  >;
}>;

const factIds = new Set<string>(templateCopilotFactIds);
const untraceableSuffixes = new Set([
  "evidence_shape",
  "leaf_paths",
  "ambiguous_quote",
  "quote_positions",
  "source_passage",
  "normalization",
  "atomic_incomplete",
  "atomic_conflict",
  "atomic_value_invalid",
  "atomic_candidate_invalid",
  "out_of_section",
]);

/**
 * Converts provider/adaptor rejection detail into bounded operational
 * metadata. Exact source text, excerpts, message IDs, JSON values, and
 * provider output are intentionally excluded.
 */
export function summarizeTemplateCopilotV2ExtractionDiagnostics({
  acceptedCandidateCount,
  rejected = [],
  terminalCode,
}: {
  acceptedCandidateCount: number;
  rejected?: readonly TemplateCopilotV2CandidateRejection[];
  terminalCode: TemplateCopilotV2ExtractionTerminalCode;
}): TemplateCopilotV2ExtractionDiagnostics {
  if (
    !Number.isSafeInteger(acceptedCandidateCount) ||
    acceptedCandidateCount < 0 ||
    acceptedCandidateCount > 64
  ) {
    throw new Error("Extraction diagnostic candidate count is invalid.");
  }
  const rejectionCodeCounts: Partial<
    Record<TemplateCopilotV2ExtractionRejectionDiagnosticCode, number>
  > = {};
  const rejectedFactCounts: Partial<Record<TemplateCopilotFactId, number>> =
    {};

  for (const rejection of rejected) {
    const code = rejectionDiagnosticCode(rejection);
    rejectionCodeCounts[code] = (rejectionCodeCounts[code] || 0) + 1;
    const factId = rejectionFactId(rejection);
    if (factId) {
      rejectedFactCounts[factId] = (rejectedFactCounts[factId] || 0) + 1;
    }
  }

  return Object.freeze({
    schemaVersion: templateCopilotV2ExtractionDiagnosticSchemaVersion,
    terminalCode,
    acceptedCandidateCount,
    rejectedCandidateCount: rejected.length,
    rejectionCodeCounts: Object.freeze(rejectionCodeCounts),
    rejectedFactCounts: Object.freeze(rejectedFactCounts),
  });
}

export function templateCopilotV2ExtractionDiagnosticTelemetryCounts(
  diagnostics: TemplateCopilotV2ExtractionDiagnostics | null,
) {
  if (!diagnostics) {
    return {
      candidates_accepted: 0,
      candidates_rejected: 0,
    };
  }
  const counts: Record<string, number> = {
    candidates_accepted: diagnostics.acceptedCandidateCount,
    candidates_rejected: diagnostics.rejectedCandidateCount,
  };
  for (const [code, count] of Object.entries(
    diagnostics.rejectionCodeCounts,
  )) {
    if (count) counts[`rejection_${code}`] = count;
  }
  for (const [factId, count] of Object.entries(
    diagnostics.rejectedFactCounts,
  )) {
    if (count) {
      counts[`rejected_fact_${factId.replaceAll(".", "_")}`] = count;
    }
  }
  return Object.freeze(counts);
}

function rejectionDiagnosticCode(
  rejection: TemplateCopilotV2CandidateRejection,
): TemplateCopilotV2ExtractionRejectionDiagnosticCode {
  if (rejection.code === "model_schema_invalid") {
    return "model_schema_invalid";
  }
  if (rejection.code === "overlapping_span") return "overlapping_span";
  if (rejection.code !== "untraceable") return "other";
  const suffix = rejection.detail.split(":").at(-1) || "";
  return untraceableSuffixes.has(suffix)
    ? (`untraceable_${suffix}` as TemplateCopilotV2ExtractionRejectionDiagnosticCode)
    : "untraceable_other";
}

function rejectionFactId(
  rejection: TemplateCopilotV2CandidateRejection,
): TemplateCopilotFactId | null {
  const candidate = rejection.detail.split(":")[0] || "";
  return factIds.has(candidate) ? (candidate as TemplateCopilotFactId) : null;
}
