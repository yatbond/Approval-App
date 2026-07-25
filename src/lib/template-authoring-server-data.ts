import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalPayloadHash } from "./approval-api-contracts.ts";
import type {
  CreateTemplateFamilyCommand,
  CreateTemplateDraftCommand,
  ReplaceTemplateDraftCommand,
  ReviewTemplatePublishCommand,
} from "./template-authoring-api-contracts.ts";
import type { ApprovalRuntimeProfile } from "./approval-runtime.ts";
import type {
  TemplateDefinitionV1,
  TemplateRequirementsDossierV1,
} from "./template-authoring-contracts.ts";
import { workflowTemplateFromDefinition } from "./template-authoring-definition.ts";
import type { TemplateAuthoringValidationSummary } from "./template-authoring-validation.ts";

type RpcOutcome = {
  outcome?: string;
  [key: string]: unknown;
};

export async function loadTemplateAuthoringCreateFamilyReceipt({
  service,
  actorId,
  idempotencyKey,
}: {
  service: SupabaseClient;
  actorId: string;
  idempotencyKey: string;
}) {
  const { data, error } = await service
    .from("template_authoring_command_receipts")
    .select("family_id,draft_id,result")
    .eq("actor_id", actorId)
    .eq("operation", "create_family")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listTemplateAuthoringFamilies({
  session,
  status,
  limit,
}: {
  session: SupabaseClient;
  status: "active" | "archived" | "all";
  limit: number;
}) {
  let query = session
    .from("template_authoring_families")
    .select(
      "id,family_key,name,business_unit_id,department_id,status,created_by,latest_published_version_id,created_at,updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadTemplateAuthoringDraft(
  session: SupabaseClient,
  draftId: string,
) {
  const { data, error } = await session
    .from("template_authoring_drafts")
    .select(
      "id,family_id,revision,status,dossier,definition,change_reason,created_by,updated_by,created_at,updated_at,published_version_id",
    )
    .eq("id", draftId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createTemplateAuthoringFamily({
  service,
  actor,
  command,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  command: CreateTemplateFamilyCommand;
}) {
  return executeRpc(
    service,
    "create_template_authoring_family",
    {
      p_actor_id: actor.id,
      p_idempotency_key: command.idempotencyKey,
      p_payload_hash: canonicalPayloadHash(command),
      p_family_key: command.familyKey,
      p_name: command.name,
      p_business_unit_id: command.businessUnitId,
      p_department_id: command.departmentId,
      p_dossier: command.dossier,
      p_definition: command.definition,
      p_change_reason: command.changeReason,
    },
  );
}

export async function replaceTemplateAuthoringDraft({
  service,
  actor,
  draftId,
  command,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  draftId: string;
  command: ReplaceTemplateDraftCommand;
}) {
  return executeRpc(
    service,
    "replace_template_authoring_draft",
    {
      p_actor_id: actor.id,
      p_draft_id: draftId,
      p_expected_revision: command.expectedRevision,
      p_idempotency_key: command.idempotencyKey,
      p_payload_hash: canonicalPayloadHash(command),
      p_dossier: command.dossier,
      p_definition: command.definition,
      p_change_reason: command.changeReason,
    },
  );
}

export async function createTemplateAuthoringDraft({
  service,
  actor,
  familyId,
  command,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  familyId: string;
  command: CreateTemplateDraftCommand;
}) {
  return executeRpc(
    service,
    "create_template_authoring_draft",
    {
      p_actor_id: actor.id,
      p_family_id: familyId,
      p_idempotency_key: command.idempotencyKey,
      p_payload_hash: canonicalPayloadHash(command),
      p_dossier: command.dossier,
      p_definition: command.definition,
      p_change_reason: command.changeReason,
    },
  );
}

export async function requestTemplateAuthoringPublish({
  service,
  actor,
  draftId,
  expectedRevision,
  idempotencyKey,
  requestNote,
  validation,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  draftId: string;
  expectedRevision: number;
  idempotencyKey: string;
  requestNote: string;
  validation: TemplateAuthoringValidationSummary;
}) {
  const payload = { draftId, expectedRevision, idempotencyKey, requestNote };
  return executeRpc(
    service,
    "request_template_authoring_publish",
    {
      p_actor_id: actor.id,
      p_draft_id: draftId,
      p_expected_revision: expectedRevision,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: canonicalPayloadHash(payload),
      p_request_note: requestNote,
      p_validation_summary: validation,
    },
  );
}

export async function reviewTemplateAuthoringPublish({
  service,
  actor,
  publishRequestId,
  command,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  publishRequestId: string;
  command: ReviewTemplatePublishCommand;
}) {
  return executeRpc(
    service,
    "review_template_authoring_publish",
    {
      p_actor_id: actor.id,
      p_publish_request_id: publishRequestId,
      p_decision: command.decision,
      p_review_note: command.reviewNote,
      p_idempotency_key: command.idempotencyKey,
      p_payload_hash: canonicalPayloadHash(command),
    },
  );
}

export async function publishTemplateAuthoringDraft({
  service,
  actor,
  publishRequestId,
  idempotencyKey,
}: {
  service: SupabaseClient;
  actor: ApprovalRuntimeProfile;
  publishRequestId: string;
  idempotencyKey: string;
}) {
  return executeRpc(
    service,
    "publish_template_authoring_draft",
    {
      p_actor_id: actor.id,
      p_publish_request_id: publishRequestId,
      p_idempotency_key: idempotencyKey,
      p_payload_hash: canonicalPayloadHash({ publishRequestId, idempotencyKey }),
    },
  );
}

export async function findInactiveFixedTemplateEmails({
  service,
  definition,
}: {
  service: SupabaseClient;
  definition: TemplateDefinitionV1;
}) {
  const template = workflowTemplateFromDefinition(definition);
  const configuredEmails = Array.from(
    new Set(
      (template.graph?.nodes || [])
        .flatMap((node) => [
          node.assigneeEmailFixed ? node.assigneeEmail : undefined,
          node.escalationEmailFixed ? node.escalationEmail : undefined,
        ])
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().toLowerCase()),
    ),
  );
  if (!configuredEmails.length) return [];
  const { data, error } = await service
    .from("profiles")
    .select("email")
    .eq("is_active", true)
    .in("email", configuredEmails);
  if (error) throw error;
  const activeEmails = new Set(
    (data || []).map((profile) => String(profile.email).toLowerCase()),
  );
  return configuredEmails.filter((configured) => !activeEmails.has(configured));
}

export function parseStoredAuthoringDraft(value: unknown): {
  dossier: TemplateRequirementsDossierV1;
  definition: TemplateDefinitionV1;
  revision: number;
} | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    !row.dossier ||
    !row.definition ||
    typeof row.revision !== "number"
  ) {
    return null;
  }
  return {
    dossier: row.dossier as TemplateRequirementsDossierV1,
    definition: row.definition as TemplateDefinitionV1,
    revision: row.revision,
  };
}

async function executeRpc(
  service: SupabaseClient,
  functionName: string,
  parameters: Record<string, unknown>,
): Promise<RpcOutcome> {
  const { data, error } = await service.rpc(functionName, parameters);
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Invalid ${functionName} response.`);
  }
  return data as RpcOutcome;
}
