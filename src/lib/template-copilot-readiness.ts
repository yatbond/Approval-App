import {
  templateCopilotFactDefinitions,
  templateCopilotFactIds,
  type TemplateCopilotFactId,
  type TemplateCopilotV2Ledger,
} from "./template-copilot-facts.ts";

export type TemplateCopilotReadinessState = "ready" | "blocked" | "not_ready";
export type TemplateCopilotReadinessGapCode =
  | "unresolved" | "unknown" | "candidate_requires_confirmation" | "conflicting" | "invalid_not_applicable" | "dependency_unresolved" | "compiler_invalid" | "published_revision_mismatch";
export type TemplateCopilotReadinessGap = Readonly<{ factId?: TemplateCopilotFactId; code: TemplateCopilotReadinessGapCode; blockingLevel: "draft" | "publication" | "activation"; dependsOn?: readonly TemplateCopilotFactId[] }>;
export type TemplateCopilotReadiness = Readonly<{
  draft: TemplateCopilotReadinessState; publication: TemplateCopilotReadinessState; activation: TemplateCopilotReadinessState;
  gaps: readonly TemplateCopilotReadinessGap[];
}>;

export function getTemplateCopilotReadiness(ledger: TemplateCopilotV2Ledger, options: { compilerValid?: boolean; publishedRevisionMatches?: boolean } = {}): TemplateCopilotReadiness {
  const gaps: TemplateCopilotReadinessGap[] = [];
  for (const factId of templateCopilotFactIds) {
    const fact = ledger.facts[factId];
    const definition = templateCopilotFactDefinitions[factId];
    if (fact.status === "not_applicable") continue;
    const dependencyGaps = definition.dependsOn.filter((dependency) => ledger.facts[dependency].status !== "committed" && ledger.facts[dependency].status !== "not_applicable");
    if (dependencyGaps.length) {
      gaps.push({ factId, code: "dependency_unresolved", blockingLevel: level(definition.blockingLevel), dependsOn: dependencyGaps });
    }
    const code = statusGapCode(fact.status);
    if (code) gaps.push({ factId, code, blockingLevel: level(definition.blockingLevel) });
  }
  if (options.compilerValid !== true) gaps.push({ code: "compiler_invalid", blockingLevel: "publication" });
  // Activation is intentionally never inferred from interview facts. A later
  // lifecycle action must prove that the exact revision was published.
  if (options.publishedRevisionMatches !== true) gaps.push({ code: "published_revision_mismatch", blockingLevel: "activation" });
  const draftGaps = gaps.filter((gap) => gap.blockingLevel === "draft");
  const publicationGaps = gaps.filter((gap) => gap.blockingLevel === "draft" || gap.blockingLevel === "publication");
  const activationGaps = gaps;
  return Object.freeze({ draft: state(draftGaps), publication: state(publicationGaps), activation: state(activationGaps), gaps: Object.freeze(gaps) });
}

function statusGapCode(status: TemplateCopilotV2Ledger["facts"][TemplateCopilotFactId]["status"]): TemplateCopilotReadinessGapCode | null {
  if (status === "committed") return null;
  if (status === "candidate") return "candidate_requires_confirmation";
  if (status === "conflicting") return "conflicting";
  if (status === "unknown") return "unknown";
  if (status === "not_applicable") return null;
  return "unresolved";
}
function level(level: "none" | "draft" | "publication") { return level === "draft" ? "draft" as const : "publication" as const; }
function state(gaps: readonly TemplateCopilotReadinessGap[]): TemplateCopilotReadinessState { return gaps.length === 0 ? "ready" : gaps.some((gap) => gap.code === "conflicting") ? "blocked" : "not_ready"; }
