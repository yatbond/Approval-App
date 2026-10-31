import { spawn } from "node:child_process";
import {
  createTemplateCopilotV2Ledger,
  templateCopilotV2LedgerSchema,
} from "../src/lib/template-copilot-facts.ts";
import {
  normalizeTemplateCopilotV2Candidates,
  projectTemplateCopilotV2Candidates,
} from "../src/lib/template-copilot-v2-candidates.ts";
import { getTemplateCopilotV2InterviewState } from "../src/lib/template-copilot-question-library.ts";

const container =
  process.env.LOCAL_POSTGRES_CONTAINER?.trim() ||
  "supabase_db_Approval_Workflow_Phase1_DB_Test";
const ownerId = "93000000-0000-4000-8000-000000000001";
const otherId = "93000000-0000-4000-8000-000000000002";
const documentSessionId = "93000000-0000-4000-8000-000000000011";
const rollbackSessionId = "93000000-0000-4000-8000-000000000012";
const specialSessionId = "93000000-0000-4000-8000-000000000013";
const sourceMessageId = "modecmd:111111111111111111111111";
const rollbackMessageId = "modecmd:222222222222222222222222";
const sourceText = "Synthetic Purchase Approval";
const flag = { enabled: true };
const scope = {
  businessUnitId: "11111111-1111-4111-8111-111111111111",
  businessName: "Synthetic Business",
  departmentId: "22222222-2222-4222-8222-222222222222",
  departmentName: "Synthetic Department",
  locale: "en",
  questionLibraryVersion: "v2.2",
};

const baseLedger = createTemplateCopilotV2Ledger(scope, flag);
const normalized = normalizeTemplateCopilotV2Candidates({
  output: {
    candidates: [
      {
        factId: "workflow.name",
        valueType: "text",
        value: sourceText,
        originalWording: sourceText,
        evidence: [
          {
            path: "/",
            messageId: sourceMessageId,
            startCodePoint: 0,
            endCodePoint: Array.from(sourceText).length,
            exactText: sourceText,
          },
        ],
        confidence: "high",
        ambiguity: "none",
      },
    ],
  },
  messages: { [sourceMessageId]: sourceText },
});
if (normalized.candidates.length !== 1) {
  throw new Error("The document regression candidate fixture is invalid.");
}
const candidateLedger = projectTemplateCopilotV2Candidates({
  ledger: baseLedger,
  candidates: normalized.candidates,
}).ledger;
const document = {
  id: "req-11111111111111111111111111111111",
  fileName: "synthetic-requirements.txt",
  sha256: "b".repeat(64),
  text: sourceText,
  safety: "sanitized_untrusted_text",
};
const documentLedger = templateCopilotV2LedgerSchema.parse({
  ...candidateLedger,
  requirementDocumentExtracts: [document],
});
const specialDecisionId = "decision.workflow.name.name";
const specialLedger = templateCopilotV2LedgerSchema.parse({
  ...baseLedger,
  atomicDecisions: {
    [specialDecisionId]: {
      kind: "unknown",
      answer: "unknown",
      display: "Not sure",
      provenance: [
        {
          kind: "human_editor",
          sourceId: "special:reviewed-library-defer",
          sourceMessageIds: [],
        },
      ],
      answeredAt: "2026-07-30T00:00:00.000Z",
    },
  },
});
const specialInterview = getTemplateCopilotV2InterviewState(specialLedger);
if (!specialInterview.nextQuestion) {
  throw new Error("The reviewed-library special fixture has no next question.");
}

const sql = `
begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('${ownerId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewed-library-owner@example.com','',now(),now(),now()),
  ('${otherId}','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reviewed-library-other@example.com','',now(),now(),now())
on conflict (id) do nothing;

insert into public.profiles (id,email,full_name,role,is_admin,is_active) values
  ('${ownerId}','reviewed-library-owner@example.com','Reviewed Library Owner','originator',false,true),
  ('${otherId}','reviewed-library-other@example.com','Reviewed Library Other','participant',false,true)
on conflict (id) do update set is_active=true;

create or replace function pg_temp.block_reviewed_library_session_update()
returns trigger language plpgsql as $trigger$
begin
  -- Allow the inner extraction to advance revision and insert its immutable
  -- receipt, then suppress only the compound command's document-retention
  -- update. The outer exception must roll the whole compound transaction back.
  if old.revision = 1 and new.revision = 2 then
    return new;
  end if;
  return null;
end;
$trigger$;

create trigger block_reviewed_library_session_update
before update on public.template_copilot_sessions
for each row
when (new.id = '${rollbackSessionId}'::uuid)
execute function pg_temp.block_reviewed_library_session_update();

do $test$
declare
  base_ledger jsonb := $json$${JSON.stringify(baseLedger)}$json$::jsonb;
  document_ledger jsonb := $json$${JSON.stringify(documentLedger)}$json$::jsonb;
  special_ledger jsonb := $json$${JSON.stringify(specialLedger)}$json$::jsonb;
  document_detail jsonb := jsonb_build_object(
    'assistantMessage','Source-backed synthetic candidate retained.',
    'document',jsonb_build_object(
      'id','${document.id}',
      'fileName','${document.fileName}',
      'sha256','${document.sha256}',
      'safety','${document.safety}'
    )
  );
  result jsonb;
  stored_ledger jsonb;
  stored_revision bigint;
  caught boolean := false;
begin
  assert position('v2.2' in pg_get_functiondef(
    'private.template_copilot_v2_dependency_graph(text)'::regprocedure
  )) > 0, 'reviewed dependency graph patch is absent';
  assert position('candidate_ledger' in pg_get_functiondef(
    'public.finalize_template_copilot_v2_mode_command(uuid,uuid,text,text,uuid,text,text,jsonb,text,jsonb)'::regprocedure
  )) > 0, 'document candidate patch is absent';

  insert into public.template_copilot_sessions(id,owner_id,status,revision,ledger)
  values('${documentSessionId}','${ownerId}','interviewing',1,base_ledger);
  insert into public.template_copilot_messages(
    session_id,owner_id,client_message_id,role,content,structured_detail
  ) values (
    '${documentSessionId}','${ownerId}','${sourceMessageId}','user',
    '${sourceText}','{"kind":"document"}'::jsonb
  );
  insert into public.template_copilot_v2_mode_commands(
    session_id,idempotency_key,owner_id,command_hash,expected_revision,
    mode,state,claim_token,claim_expires_at,source_message_id,source_kind
  ) values (
    '${documentSessionId}','reviewed-library-document','${ownerId}','${"c".repeat(64)}',1,
    'describe_everything','prepared','93000000-0000-4000-8000-000000000021',
    clock_timestamp()+interval '2 minutes','${sourceMessageId}','document'
  );

  result := public.finalize_template_copilot_v2_mode_command(
    '${ownerId}','${documentSessionId}','reviewed-library-document',
    '${"c".repeat(64)}','93000000-0000-4000-8000-000000000021',
    'applied','describe_everything',document_ledger,'${"d".repeat(64)}',
    document_detail
  );
  assert result->>'outcome' = 'applied', 'document candidate did not apply';
  assert (result->>'revision')::bigint = 2, 'document candidate revision drift';
  assert jsonb_array_length(result->'ledger'->'requirementDocumentExtracts') = 1,
    'document was not retained';
  assert jsonb_array_length(result->'ledger'->'extractionEvidence'->'candidates') = 1,
    'candidate was not retained';

  result := public.finalize_template_copilot_v2_mode_command(
    '${ownerId}','${documentSessionId}','reviewed-library-document',
    '${"c".repeat(64)}','93000000-0000-4000-8000-000000000021',
    'applied','describe_everything',document_ledger,'${"d".repeat(64)}',
    document_detail
  );
  assert result->>'outcome' = 'replayed', 'exact document replay was not idempotent';
  assert (result->>'revision')::bigint = 2, 'document replay advanced revision';
  assert jsonb_array_length(result->'ledger'->'requirementDocumentExtracts') = 1,
    'document replay duplicated the source';

  result := public.finalize_template_copilot_v2_mode_command(
    '${otherId}','${documentSessionId}','reviewed-library-document',
    '${"c".repeat(64)}','93000000-0000-4000-8000-000000000021',
    'applied','describe_everything',document_ledger,'${"d".repeat(64)}',
    document_detail
  );
  assert result->>'outcome' = 'not_found', 'cross-owner document result was disclosed';

  insert into public.template_copilot_sessions(id,owner_id,status,revision,ledger)
  values('${rollbackSessionId}','${ownerId}','interviewing',1,base_ledger);
  insert into public.template_copilot_messages(
    session_id,owner_id,client_message_id,role,content,structured_detail
  ) values (
    '${rollbackSessionId}','${ownerId}','${rollbackMessageId}','user',
    '${sourceText}','{"kind":"document"}'::jsonb
  );
  insert into public.template_copilot_v2_mode_commands(
    session_id,idempotency_key,owner_id,command_hash,expected_revision,
    mode,state,claim_token,claim_expires_at,source_message_id,source_kind
  ) values (
    '${rollbackSessionId}','reviewed-library-rollback','${ownerId}','${"e".repeat(64)}',1,
    'describe_everything','prepared','93000000-0000-4000-8000-000000000022',
    clock_timestamp()+interval '2 minutes','${rollbackMessageId}','document'
  );

  begin
    perform public.finalize_template_copilot_v2_mode_command(
      '${ownerId}','${rollbackSessionId}','reviewed-library-rollback',
      '${"e".repeat(64)}','93000000-0000-4000-8000-000000000022',
      'applied','describe_everything',
      jsonb_set(
        replace(document_ledger::text,'${sourceMessageId}','${rollbackMessageId}')::jsonb,
        '{requirementDocumentExtracts,0,id}',
        '"req-22222222222222222222222222222222"'::jsonb
      ),
      '${"f".repeat(64)}',
      jsonb_set(
        document_detail,
        '{document,id}',
        '"req-22222222222222222222222222222222"'::jsonb
      )
    );
  exception when others then
    caught := sqlerrm = 'template_copilot_v2_document_session_finalize_missing';
  end;
  assert caught, 'missing receipt finalization did not fail closed';
  select ledger,revision into stored_ledger,stored_revision
  from public.template_copilot_sessions where id='${rollbackSessionId}';
  assert stored_revision = 1, 'failed document finalization advanced revision';
  assert jsonb_array_length(stored_ledger->'requirementDocumentExtracts') = 0,
    'failed document finalization retained its source';
  assert not exists (
    select 1 from public.template_copilot_v2_operation_receipts
    where session_id='${rollbackSessionId}'
  ), 'failed document finalization retained a receipt';
  assert (
    select state from public.template_copilot_v2_mode_commands
    where session_id='${rollbackSessionId}'
      and idempotency_key='reviewed-library-rollback'
  ) = 'prepared', 'failed document finalization changed command state';

  insert into public.template_copilot_sessions(id,owner_id,status,revision,ledger)
  values('${specialSessionId}','${ownerId}','interviewing',1,base_ledger);
  result := public.apply_template_copilot_v2_special_decision(
    '${ownerId}','${specialSessionId}',1,'reviewed-library-defer',
    '${"a".repeat(64)}','defer',true,'${specialDecisionId}',array[]::text[],
    special_ledger,'Not sure','Deferred; continue with the next independent question.',
    '{"schemaVersion":2,"operation":"defer","decisionId":"${specialDecisionId}"}'::jsonb,
    jsonb_build_object(
      'schemaVersion',2,'operation','defer','decisionId','${specialDecisionId}',
      'status','${specialInterview.state}',
      'nextQuestionId','${specialInterview.nextQuestion.questionId}'
    )
  );
  assert result->>'outcome' = 'applied', 'v2.2 defer did not apply';
  assert result->'ledger'->'atomicDecisions'->'${specialDecisionId}'->>'kind' = 'unknown',
    'v2.2 defer did not retain the special decision';
end;
$test$;

drop trigger block_reviewed_library_session_update
on public.template_copilot_sessions;
rollback;
`;

await new Promise((resolve, reject) => {
  const child = spawn(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { cwd: process.cwd(), env: process.env, stdio: ["pipe", "inherit", "inherit"] },
  );
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) resolve();
    else {
      reject(
        new Error(
          `Reviewed-library database regression failed with ${
            signal ? `signal ${signal}` : `exit code ${code}`
          }.`,
        ),
      );
    }
  });
  child.stdin.end(sql);
});

console.log("template_copilot_v2_reviewed_library_db=PASS");
