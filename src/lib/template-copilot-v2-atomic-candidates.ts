import { z } from "zod";
import {
  templateCopilotCommittedValueSchemas,
  type TemplateCopilotFactId,
} from "./template-copilot-v2-canonical-values.ts";
import {
  deriveTemplateCopilotV2ServerEvidenceRule,
  normalizeTemplateCopilotV2Candidates,
  templateCopilotV2CandidateSchema,
  templateCopilotV2CandidateValueTypes,
  type TemplateCopilotV2Candidate,
  type TemplateCopilotV2CandidateNormalization,
  type TemplateCopilotV2CandidateRejection,
} from "./template-copilot-v2-candidates.ts";
import { templateCopilotUnicodeCodePointCount } from "./template-copilot-unicode.ts";

const text = z.string().trim().min(1).max(8_000);
const label = z.string().trim().min(1).max(200);
const quote = text.describe(
  "An exact contiguous quote inside sourceQuote for this primitive value.",
);
const sourceQuote = text.describe(
  "One exact contiguous source passage containing every evidence quote for this atom.",
);
const confidence = z.enum(["low", "medium", "high"]);
const ambiguity = z.enum(["none", "possible", "ambiguous"]);
const common = {
  sourceQuote,
  confidence,
  ambiguity,
  ambiguityNote: z.string().trim().max(500).optional(),
};

const participantValue = z
  .object({
    mode: z.enum([
      "fixed_email",
      "directory_position",
      "request_field",
      "requester",
      "unassigned_at_template",
    ]),
    value: label.optional(),
  })
  .strict();
const participantEvidence = z
  .object({ mode: quote, value: quote.optional() })
  .strict();
const fieldValue = z
  .object({
    label,
    type: z.enum([
      "text",
      "long_text",
      "number",
      "date",
      "currency",
      "email",
      "select",
      "radio",
      "checkbox",
      "table",
    ]),
    required: z.boolean(),
    options: z.array(label).max(100),
  })
  .strict();
const fieldEvidence = z
  .object({
    label: quote,
    type: quote,
    required: quote,
    options: z.array(quote).max(100),
  })
  .strict();
const attachmentValue = z
  .object({
    label,
    required: z.boolean(),
    formats: z
      .array(z.enum(["text", "pdf", "image", "excel_csv"]))
      .max(4),
    stage: label.optional(),
  })
  .strict();
const attachmentEvidence = z
  .object({
    label: quote,
    required: quote,
    formats: z.array(quote).max(4),
    stage: quote.optional(),
  })
  .strict();
const stageValue = z
  .object({
    label,
    kind: z.enum(["approval", "review", "for_information", "submission"]),
    participant: participantValue,
    sequence: z.number().int().min(1).max(100),
  })
  .strict();
const stageEvidence = z
  .object({
    label: quote,
    kind: quote,
    participant: participantEvidence,
    sequence: quote,
  })
  .strict();
const conditionValue = z
  .object({
    field: label,
    operator: z.enum(["=", "!=", ">", ">=", "<", "<=", "contains"]),
    value: z.union([text, z.number().finite()]),
    matchingRoute: label,
    otherwiseRoute: label,
  })
  .strict();
const conditionEvidence = z
  .object({
    field: quote,
    operator: quote,
    value: quote,
    matchingRoute: quote,
    otherwiseRoute: quote,
  })
  .strict();
const notificationValue = z
  .object({
    event: label,
    recipients: z.array(label).min(1).max(50),
    channel: z.enum(["in_app", "email"]),
  })
  .strict();
const notificationEvidence = z
  .object({
    event: quote,
    recipients: z.array(quote).min(1).max(50),
    channel: quote,
  })
  .strict();

function atom<
  AtomType extends string,
  FactId extends TemplateCopilotFactId,
  Value,
  Evidence,
>(
  atomType: AtomType,
  factId: z.ZodType<FactId>,
  value: z.ZodType<Value>,
  evidence: z.ZodType<Evidence>,
) {
  return z
    .object({
      atomType: z.literal(atomType),
      factId,
      value,
      evidence,
      ...common,
    })
    .strict();
}

export const templateCopilotV2AtomicProviderVariants = [
  atom(
    "text_fact",
    z.enum(["workflow.name", "workflow.purpose", "governance.owner"]),
    text,
    quote,
  ),
  atom(
    "policy_description",
    z.enum([
      "workflow.scope",
      "collaboration.policy",
      "visibility.policy",
    ]),
    text,
    quote,
  ),
  atom(
    "policy_rule",
    z.enum([
      "workflow.scope",
      "collaboration.policy",
      "visibility.policy",
    ]),
    text,
    quote,
  ),
  atom(
    "initiator_mode",
    z.literal("request.initiator_policy"),
    z.enum(["any_employee", "directory_role", "requester_selected"]),
    quote,
  ),
  atom(
    "initiator_description",
    z.literal("request.initiator_policy"),
    text,
    quote,
  ),
  atom("request_field", z.literal("request.fields"), fieldValue, fieldEvidence),
  atom(
    "attachment_requirement",
    z.literal("attachments.requirements"),
    attachmentValue,
    attachmentEvidence,
  ),
  atom("workflow_stage", z.literal("workflow.stages"), stageValue, stageEvidence),
  atom(
    "workflow_condition",
    z.literal("workflow.conditions"),
    conditionValue,
    conditionEvidence,
  ),
  atom(
    "rejection_action",
    z.literal("workflow.rejection_policy"),
    z.enum(["return_for_correction", "close", "route_to_stage"]),
    quote,
  ),
  atom(
    "rejection_route",
    z.literal("workflow.rejection_policy"),
    label,
    quote,
  ),
  atom(
    "default_due_hours",
    z.literal("timing.rules"),
    z.number().int().min(1).max(8760),
    quote,
  ),
  atom("escalation_description", z.literal("timing.rules"), text, quote),
  atom("escalation_rule", z.literal("timing.rules"), text, quote),
  atom(
    "notification_rule",
    z.literal("notifications.rules"),
    notificationValue,
    notificationEvidence,
  ),
  atom(
    "governance_policy",
    z.literal("governance.policies"),
    text,
    quote,
  ),
  atom(
    "retention_period",
    z.literal("governance.retention"),
    label,
    quote,
  ),
  atom(
    "retention_rationale",
    z.literal("governance.retention"),
    text,
    quote,
  ),
] as const;

export const templateCopilotV2AtomicProviderSchema = z.discriminatedUnion(
  "atomType",
  templateCopilotV2AtomicProviderVariants,
);

export const templateCopilotV2AtomicProviderOutputSchema = z
  .object({
    atoms: z.array(templateCopilotV2AtomicProviderSchema).max(64),
  })
  .strict()
  .describe(
    "Atomic source-backed observations. Each atom represents one scalar, one list item, or one policy component; sourceQuote bounds its mirrored evidence quotes.",
  );

export type TemplateCopilotV2AtomicProvider = z.infer<
  typeof templateCopilotV2AtomicProviderSchema
>;

const factsByAtomType = Object.freeze({
  text_fact: [
    "workflow.name",
    "workflow.purpose",
    "governance.owner",
  ],
  policy_description: [
    "workflow.scope",
    "collaboration.policy",
    "visibility.policy",
  ],
  policy_rule: [
    "workflow.scope",
    "collaboration.policy",
    "visibility.policy",
  ],
  initiator_mode: ["request.initiator_policy"],
  initiator_description: ["request.initiator_policy"],
  request_field: ["request.fields"],
  attachment_requirement: ["attachments.requirements"],
  workflow_stage: ["workflow.stages"],
  workflow_condition: ["workflow.conditions"],
  rejection_action: ["workflow.rejection_policy"],
  rejection_route: ["workflow.rejection_policy"],
  default_due_hours: ["timing.rules"],
  escalation_description: ["timing.rules"],
  escalation_rule: ["timing.rules"],
  notification_rule: ["notifications.rules"],
  governance_policy: ["governance.policies"],
  retention_period: ["governance.retention"],
  retention_rationale: ["governance.retention"],
} as const) satisfies Readonly<
  Record<
    TemplateCopilotV2AtomicProvider["atomType"],
    readonly TemplateCopilotFactId[]
  >
>;

/** Narrows the provider-visible union to atom kinds relevant to this section.
 * Shared atom kinds can still contain several statically declared fact IDs,
 * so the adapter independently enforces the exact allowed fact set. */
export function templateCopilotV2AtomicProviderOutputSchemaForFacts(
  allowedFactIds: readonly TemplateCopilotFactId[],
): z.ZodType<{ atoms: TemplateCopilotV2AtomicProvider[] }> {
  const allowed = new Set(allowedFactIds);
  const variants = templateCopilotV2AtomicProviderVariants.flatMap((variant) => {
    const atomType = variant.shape.atomType.value;
    const allowedVariantFacts = factsByAtomType[atomType].filter((factId) =>
      allowed.has(factId),
    );
    if (!allowedVariantFacts.length) return [];
    const factIdSchema =
      allowedVariantFacts.length === 1
        ? z.literal(allowedVariantFacts[0])
        : z.enum(
            allowedVariantFacts as [
              TemplateCopilotFactId,
              ...TemplateCopilotFactId[],
            ],
          );
    return [variant.extend({ factId: factIdSchema })];
  });
  if (!variants.length) {
    throw new Error("The extraction section has no provider atom variants.");
  }
  const schema = z.discriminatedUnion(
    "atomType",
    variants as unknown as [
      (typeof templateCopilotV2AtomicProviderVariants)[number],
      ...(typeof templateCopilotV2AtomicProviderVariants)[number][],
    ],
  );
  return z
    .object({ atoms: z.array(schema).max(64) })
    .strict()
    .describe(
      "Section-scoped atomic source-backed observations. The server enforces the exact allowed fact IDs.",
    ) as z.ZodType<{ atoms: TemplateCopilotV2AtomicProvider[] }>;
}

/** Re-runs the hostile-output normalizer across independently recovered facts
 * so cross-fact overlap and dedupe rules remain identical to one primary
 * provider response. */
export function mergeTemplateCopilotV2AtomicCandidateNormalizations({
  normalizations,
  message,
  messageId,
}: {
  normalizations: readonly TemplateCopilotV2CandidateNormalization[];
  message: string;
  messageId: string;
}): TemplateCopilotV2CandidateNormalization {
  const combined = normalizeTemplateCopilotV2Candidates({
    output: {
      candidates: normalizations.flatMap((result) => result.candidates),
    },
    messages: { [messageId]: message },
  });
  return Object.freeze({
    candidates: combined.candidates,
    rejected: Object.freeze(
      [
        ...normalizations.flatMap((result) => result.rejected),
        ...combined.rejected,
      ].sort((left, right) =>
        `${left.code}:${left.detail}`.localeCompare(
          `${right.code}:${right.detail}`,
        ),
      ),
    ),
  });
}

type QuoteLeaf = Readonly<{
  path: string;
  exactText: string;
  startCodePoint: number;
  endCodePoint: number;
}>;
type ValidatedAtom = Readonly<{
  atom: TemplateCopilotV2AtomicProvider;
  sourceStart: number;
  sourceEnd: number;
  leaves: readonly QuoteLeaf[];
}>;
export type TemplateCopilotV2AtomicSourceScope = Readonly<{
  startCodeUnit: number;
  endCodeUnit: number;
}>;
type Assembly = Readonly<{
  factId: TemplateCopilotFactId;
  value: unknown;
  atoms: readonly ValidatedAtom[];
  paths: readonly (readonly string[])[];
}>;

/** Adapts independent provider atoms into the existing review-only fact
 * candidates. Invalid atoms and incomplete fact assemblies are rejected
 * locally; valid atoms for other facts remain available for human review. */
export function adaptTemplateCopilotV2AtomicProviderCandidates({
  output,
  message,
  messageId,
  allowedFactIds,
  sourceScopes,
}: {
  output: unknown;
  message: string;
  messageId: string;
  allowedFactIds?: readonly TemplateCopilotFactId[];
  sourceScopes?: readonly TemplateCopilotV2AtomicSourceScope[];
}): TemplateCopilotV2CandidateNormalization {
  const parsed = templateCopilotV2AtomicProviderOutputSchema.safeParse(output);
  if (!parsed.success) {
    return failure(
      "model_schema_invalid",
      parsed.error.issues
        .slice(0, 12)
        .map((issue) => issue.path.join(".") || "$")
        .join("|"),
    );
  }
  const rejected: TemplateCopilotV2CandidateRejection[] = [];
  const allowedFacts = allowedFactIds
    ? new Set<TemplateCopilotFactId>(allowedFactIds)
    : null;
  if (sourceScopes && sourceScopes.length !== parsed.data.atoms.length) {
    return failure("model_schema_invalid", "source_scope_cardinality");
  }
  if (
    sourceScopes?.some(
      (scope) =>
        !Number.isSafeInteger(scope.startCodeUnit) ||
        !Number.isSafeInteger(scope.endCodeUnit) ||
        scope.startCodeUnit < 0 ||
        scope.endCodeUnit <= scope.startCodeUnit ||
        scope.endCodeUnit > message.length,
    )
  ) {
    return failure("model_schema_invalid", "source_scope_invalid");
  }
  const validAtoms = parsed.data.atoms.flatMap((supplied, index) => {
    if (allowedFacts && !allowedFacts.has(supplied.factId)) {
      rejected.push({
        code: "untraceable",
        detail: `${supplied.factId}:out_of_section`,
      });
      return [];
    }
    const validated = validateAtom(supplied, message, sourceScopes?.[index]);
    if ("rejection" in validated) {
      rejected.push(validated.rejection);
      return [];
    }
    return [validated.atom];
  });
  const assemblies = assembleAtoms(validAtoms, rejected);
  const candidates = assemblies.flatMap((assembly) => {
    const candidate = candidateFromAssembly(assembly, message, messageId);
    if ("rejection" in candidate) {
      rejected.push(candidate.rejection);
      return [];
    }
    return [candidate.candidate];
  });
  const normalized = normalizeTemplateCopilotV2Candidates({
    output: { candidates },
    messages: { [messageId]: message },
  });
  return Object.freeze({
    candidates: normalized.candidates,
    rejected: Object.freeze(
      [...rejected, ...normalized.rejected].sort((left, right) =>
        `${left.code}:${left.detail}`.localeCompare(
          `${right.code}:${right.detail}`,
        ),
      ),
    ),
  });
}

function validateAtom(
  atom: TemplateCopilotV2AtomicProvider,
  message: string,
  sourceScope?: TemplateCopilotV2AtomicSourceScope,
):
  | Readonly<{ atom: ValidatedAtom }>
  | Readonly<{ rejection: TemplateCopilotV2CandidateRejection }> {
  const scopedMessage = sourceScope
    ? message.slice(sourceScope.startCodeUnit, sourceScope.endCodeUnit)
    : message;
  const passages = allOffsets(scopedMessage, atom.sourceQuote);
  if (passages.length !== 1) {
    return reject(atom.factId, "ambiguous_quote");
  }
  const relativeLeaves = quoteLeaves(atom.value, atom.evidence);
  if (!relativeLeaves?.length) return reject(atom.factId, "evidence_shape");
  const positions = new Map<number, number>();
  for (const [exactText, group] of Map.groupBy(
    relativeLeaves,
    (leaf) => leaf.exactText,
  )) {
    const offsets = allOffsets(atom.sourceQuote, exactText);
    if (offsets.length !== group.length) {
      return reject(atom.factId, "ambiguous_quote");
    }
    group.forEach((leaf, index) =>
      positions.set(relativeLeaves.indexOf(leaf), offsets[index]),
    );
  }
  const sourceStart =
    (sourceScope?.startCodeUnit || 0) + passages[0];
  const sourceEnd = sourceStart + atom.sourceQuote.length;
  const leaves = relativeLeaves.flatMap((leaf, index) => {
    const relativeStart = positions.get(index);
    if (relativeStart === undefined) return [];
    const absoluteStart = sourceStart + relativeStart;
    return [{
      path: leaf.path,
      exactText: leaf.exactText,
      startCodePoint: templateCopilotUnicodeCodePointCount(
        message.slice(0, absoluteStart),
      ),
      endCodePoint:
        templateCopilotUnicodeCodePointCount(message.slice(0, absoluteStart)) +
        templateCopilotUnicodeCodePointCount(leaf.exactText),
    }];
  });
  if (leaves.length !== relativeLeaves.length) {
    return reject(atom.factId, "quote_positions");
  }
  if (
    leaves.some((leaf, index) =>
      leaves
        .slice(index + 1)
        .some(
          (other) =>
            leaf.startCodePoint < other.endCodePoint &&
            other.startCodePoint < leaf.endCodePoint,
        ),
    )
  ) {
    return reject(atom.factId, "overlapping_span", "overlapping_span");
  }
  if (
    leaves.some((leaf) => {
      const context = atomEvidenceContext(atom, leaf.path);
      return (
        deriveTemplateCopilotV2ServerEvidenceRule({
          factId: atom.factId,
          value: context.value,
          path: context.path,
          exactText: leaf.exactText,
        }) === null
      );
    })
  ) {
    return reject(atom.factId, "normalization");
  }
  return {
    atom: Object.freeze({ atom, sourceStart, sourceEnd, leaves }),
  };
}

function atomEvidenceContext(
  atom: TemplateCopilotV2AtomicProvider,
  leafPath: string,
) {
  if (atom.atomType === "text_fact") {
    return { value: atom.value, path: "/" };
  }
  if (atom.atomType === "policy_description") {
    return {
      value: { description: atom.value, rules: [] },
      path: "/description",
    };
  }
  if (atom.atomType === "policy_rule") {
    return {
      value: { description: "server-validation-placeholder", rules: [atom.value] },
      path: "/rules/0",
    };
  }
  if (atom.atomType === "initiator_mode") {
    return {
      value: { mode: atom.value, description: "server-validation-placeholder" },
      path: "/mode",
    };
  }
  if (atom.atomType === "initiator_description") {
    return {
      value: { mode: "any_employee", description: atom.value },
      path: "/description",
    };
  }
  if (
    atom.atomType === "request_field" ||
    atom.atomType === "attachment_requirement" ||
    atom.atomType === "workflow_stage" ||
    atom.atomType === "workflow_condition" ||
    atom.atomType === "notification_rule"
  ) {
    return {
      value: [atom.value],
      path: leafPath === "/" ? "/0" : `/0${leafPath}`,
    };
  }
  if (atom.atomType === "rejection_action") {
    return {
      value: {
        action: atom.value,
        ...(atom.value === "route_to_stage"
          ? { route: "server-validation-placeholder" }
          : {}),
      },
      path: "/action",
    };
  }
  if (atom.atomType === "rejection_route") {
    return {
      value: { action: "route_to_stage", route: atom.value },
      path: "/route",
    };
  }
  if (atom.atomType === "default_due_hours") {
    return { value: { defaultDueHours: atom.value }, path: "/defaultDueHours" };
  }
  if (atom.atomType === "escalation_description") {
    return {
      value: { escalation: { description: atom.value, rules: [] } },
      path: "/escalation/description",
    };
  }
  if (atom.atomType === "escalation_rule") {
    return {
      value: {
        escalation: {
          description: "server-validation-placeholder",
          rules: [atom.value],
        },
      },
      path: "/escalation/rules/0",
    };
  }
  if (atom.atomType === "governance_policy") {
    return { value: [atom.value], path: "/0" };
  }
  if (atom.atomType === "retention_period") {
    return { value: { period: atom.value }, path: "/period" };
  }
  return {
    value: {
      period: "server-validation-placeholder",
      rationale: atom.value,
    },
    path: "/rationale",
  };
}

function assembleAtoms(
  atoms: readonly ValidatedAtom[],
  rejected: TemplateCopilotV2CandidateRejection[],
): readonly Assembly[] {
  const byFact = Map.groupBy(atoms, (item) => item.atom.factId);
  const output: Assembly[] = [];
  for (const [factId, factAtoms] of byFact) {
    const ordered = [...factAtoms].sort(
      (left, right) =>
        left.sourceStart - right.sourceStart ||
        left.atom.atomType.localeCompare(right.atom.atomType),
    );
    const one = (atomType: string) =>
      ordered.filter((item) => item.atom.atomType === atomType);
    const push = (
      value: unknown,
      selected: readonly ValidatedAtom[],
      paths: readonly (readonly string[])[],
    ) => output.push({ factId, value, atoms: selected, paths });

    if (
      factId === "workflow.name" ||
      factId === "workflow.purpose" ||
      factId === "governance.owner"
    ) {
      const selected = one("text_fact");
      if (selected.length !== 1) {
        rejected.push(incomplete(factId, selected.length > 1));
      } else {
        push(selected[0].atom.value, selected, [["/"]]);
      }
      continue;
    }
    if (
      factId === "workflow.scope" ||
      factId === "collaboration.policy" ||
      factId === "visibility.policy"
    ) {
      const descriptions = one("policy_description");
      const rules = one("policy_rule");
      if (descriptions.length !== 1) {
        rejected.push(incomplete(factId, descriptions.length > 1));
      } else {
        push(
          {
            description: descriptions[0].atom.value,
            rules: rules.map((item) => item.atom.value),
          },
          [descriptions[0], ...rules],
          [
            ["/description"],
            ...rules.map((_, index) => [`/rules/${index}`]),
          ],
        );
      }
      continue;
    }
    if (factId === "request.initiator_policy") {
      const modes = one("initiator_mode");
      const descriptions = one("initiator_description");
      if (modes.length !== 1 || descriptions.length !== 1) {
        rejected.push(
          incomplete(
            factId,
            modes.length > 1 || descriptions.length > 1,
          ),
        );
      } else {
        push(
          {
            mode: modes[0].atom.value,
            description: descriptions[0].atom.value,
          },
          [modes[0], descriptions[0]],
          [["/mode"], ["/description"]],
        );
      }
      continue;
    }
    if (factId === "request.fields") {
      pushArray(factId, one("request_field"), push);
      continue;
    }
    if (factId === "attachments.requirements") {
      pushArray(factId, one("attachment_requirement"), push);
      continue;
    }
    if (factId === "workflow.stages") {
      pushArray(factId, one("workflow_stage"), push);
      continue;
    }
    if (factId === "workflow.conditions") {
      pushArray(factId, one("workflow_condition"), push);
      continue;
    }
    if (factId === "notifications.rules") {
      pushArray(factId, one("notification_rule"), push);
      continue;
    }
    if (factId === "governance.policies") {
      pushArray(factId, one("governance_policy"), push);
      continue;
    }
    if (factId === "workflow.rejection_policy") {
      const actions = one("rejection_action");
      const routes = one("rejection_route");
      if (
        actions.length !== 1 ||
        routes.length > 1 ||
        (actions[0]?.atom.value === "route_to_stage" && routes.length !== 1) ||
        (actions[0]?.atom.value !== "route_to_stage" && routes.length !== 0)
      ) {
        rejected.push(
          incomplete(
            factId,
            actions.length > 1 ||
              routes.length > 1 ||
              (actions.length === 1 &&
                actions[0].atom.value !== "route_to_stage" &&
                routes.length > 0),
          ),
        );
      } else {
        const selected =
          actions[0].atom.value === "route_to_stage"
            ? [actions[0], routes[0]]
            : [actions[0]];
        push(
          {
            action: actions[0].atom.value,
            ...(routes[0] && actions[0].atom.value === "route_to_stage"
              ? { route: routes[0].atom.value }
              : {}),
          },
          selected,
          selected.length === 2 ? [["/action"], ["/route"]] : [["/action"]],
        );
      }
      continue;
    }
    if (factId === "timing.rules") {
      const due = one("default_due_hours");
      const descriptions = one("escalation_description");
      const rules = one("escalation_rule");
      if (
        due.length > 1 ||
        descriptions.length > 1 ||
        (rules.length > 0 && descriptions.length !== 1) ||
        (due.length === 0 && descriptions.length === 0)
      ) {
        rejected.push(
          incomplete(
            factId,
            due.length > 1 || descriptions.length > 1,
          ),
        );
      } else {
        const selected = [
          ...due,
          ...descriptions,
          ...(descriptions.length ? rules : []),
        ];
        push(
          {
            ...(due[0] ? { defaultDueHours: due[0].atom.value } : {}),
            ...(descriptions[0]
              ? {
                  escalation: {
                    description: descriptions[0].atom.value,
                    rules: rules.map((item) => item.atom.value),
                  },
                }
              : {}),
          },
          selected,
          [
            ...(due[0] ? [["/defaultDueHours"]] : []),
            ...(descriptions[0] ? [["/escalation/description"]] : []),
            ...rules.map((_, index) => [`/escalation/rules/${index}`]),
          ],
        );
      }
      continue;
    }
    if (factId === "governance.retention") {
      const periods = one("retention_period");
      const rationales = one("retention_rationale");
      if (periods.length !== 1 || rationales.length > 1) {
        rejected.push(
          incomplete(factId, periods.length > 1 || rationales.length > 1),
        );
      } else {
        const selected = [periods[0], ...rationales];
        push(
          {
            period: periods[0].atom.value,
            ...(rationales[0]
              ? { rationale: rationales[0].atom.value }
              : {}),
          },
          selected,
          rationales[0] ? [["/period"], ["/rationale"]] : [["/period"]],
        );
      }
    }
  }
  return output;
}

function pushArray(
  factId: TemplateCopilotFactId,
  atoms: readonly ValidatedAtom[],
  push: (
    value: unknown,
    selected: readonly ValidatedAtom[],
    paths: readonly (readonly string[])[],
  ) => void,
) {
  if (!atoms.length) return;
  push(
    atoms.map((item) => item.atom.value),
    atoms,
    atoms.map((item, index) =>
      item.leaves.map((leaf) =>
        leaf.path === "/" ? `/${index}` : `/${index}${leaf.path}`,
      ),
    ),
  );
  void factId;
}

function candidateFromAssembly(
  assembly: Assembly,
  message: string,
  messageId: string,
):
  | Readonly<{ candidate: TemplateCopilotV2Candidate }>
  | Readonly<{ rejection: TemplateCopilotV2CandidateRejection }> {
  const representative = [...assembly.atoms].sort(
    (left, right) =>
      left.sourceStart - right.sourceStart || left.sourceEnd - right.sourceEnd,
  )[0];
  const originalWording = representative
    ? message.slice(representative.sourceStart, representative.sourceEnd)
    : "";
  if (
    !originalWording.trim() ||
    templateCopilotUnicodeCodePointCount(originalWording) > 8_000
  ) {
    return reject(assembly.factId, "source_passage");
  }
  const parsedValue =
    templateCopilotCommittedValueSchemas[assembly.factId].safeParse(
      assembly.value,
    );
  if (!parsedValue.success) {
    return reject(assembly.factId, "atomic_value_invalid");
  }
  const canonicalValue = parsedValue.data;
  const evidence = assembly.atoms.flatMap((item, atomIndex) =>
    item.leaves.map((leaf, leafIndex) => {
      const path = assembly.paths[atomIndex]?.[leafIndex];
      if (!path) return null;
      const normalizationRule = deriveTemplateCopilotV2ServerEvidenceRule({
        factId: assembly.factId,
        value: canonicalValue,
        path,
        exactText: leaf.exactText,
      });
      if (normalizationRule === null) return null;
      return {
        path,
        messageId,
        startCodePoint: leaf.startCodePoint,
        endCodePoint: leaf.endCodePoint,
        exactText: leaf.exactText,
        ...(normalizationRule ? { normalizationRule } : {}),
      };
    }),
  );
  if (evidence.some((item) => item === null)) {
    return reject(assembly.factId, "normalization");
  }
  const confidenceValue = worstConfidence(
    assembly.atoms.map((item) => item.atom.confidence),
  );
  const ambiguityValue = worstAmbiguity(
    assembly.atoms.map((item) => item.atom.ambiguity),
  );
  const ambiguityNote = [
    ...new Set(
      assembly.atoms.flatMap((item) =>
        item.atom.ambiguityNote ? [item.atom.ambiguityNote] : [],
      ),
    ),
  ]
    .join("; ")
    .slice(0, 500);
  const candidate = {
    factId: assembly.factId,
    valueType: templateCopilotV2CandidateValueTypes[assembly.factId],
    value: canonicalValue,
    originalWording,
    evidence: evidence as TemplateCopilotV2Candidate["evidence"],
    confidence: confidenceValue,
    ambiguity: ambiguityValue,
    ...(ambiguityNote ? { ambiguityNote } : {}),
  } as TemplateCopilotV2Candidate;
  const parsedCandidate = templateCopilotV2CandidateSchema.safeParse(candidate);
  if (!parsedCandidate.success) {
    return reject(assembly.factId, "atomic_candidate_invalid");
  }
  return { candidate: parsedCandidate.data };
}

function quoteLeaves(
  value: unknown,
  evidence: unknown,
  path = "",
): Array<{ path: string; exactText: string }> | null {
  if (value === null || typeof value !== "object") {
    return typeof evidence === "string"
      ? [{ path: path || "/", exactText: evidence }]
      : null;
  }
  if (Array.isArray(value)) {
    if (!Array.isArray(evidence) || evidence.length !== value.length) return null;
    const children = value.map((item, index) =>
      quoteLeaves(item, evidence[index], `${path}/${index}`),
    );
    return children.some((item) => item === null)
      ? null
      : (children.flat() as Array<{ path: string; exactText: string }>);
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const quotes = evidence as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== Object.keys(quotes).length ||
    keys.some((key) => !(key in quotes))
  ) {
    return null;
  }
  const children = keys.map((key) =>
    quoteLeaves(
      record[key],
      quotes[key],
      `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
    ),
  );
  return children.some((item) => item === null)
    ? null
    : (children.flat() as Array<{ path: string; exactText: string }>);
}

function allOffsets(value: string, needle: string) {
  const offsets: number[] = [];
  for (
    let offset = value.indexOf(needle);
    offset >= 0;
    offset = value.indexOf(needle, offset + 1)
  ) {
    offsets.push(offset);
  }
  return offsets;
}

function incomplete(factId: TemplateCopilotFactId, conflict: boolean) {
  return {
    code: "untraceable" as const,
    detail: `${factId}:${conflict ? "atomic_conflict" : "atomic_incomplete"}`,
  };
}

function reject(
  factId: TemplateCopilotFactId,
  detail: string,
  code: TemplateCopilotV2CandidateRejection["code"] = "untraceable",
) {
  return {
    rejection: { code, detail: `${factId}:${detail}` },
  } as const;
}

function failure(
  code: TemplateCopilotV2CandidateRejection["code"],
  detail: string,
) {
  return Object.freeze({
    candidates: Object.freeze([]),
    rejected: Object.freeze([{ code, detail }]),
  });
}

function worstConfidence(values: readonly ("low" | "medium" | "high")[]) {
  return values.includes("low")
    ? ("low" as const)
    : values.includes("medium")
      ? ("medium" as const)
      : ("high" as const);
}

function worstAmbiguity(
  values: readonly ("none" | "possible" | "ambiguous")[],
) {
  return values.includes("ambiguous")
    ? ("ambiguous" as const)
    : values.includes("possible")
      ? ("possible" as const)
      : ("none" as const);
}
