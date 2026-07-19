import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
assert.ok(["seed", "verify"].includes(mode), "Expected seed or verify mode.");

const url = requiredEnv("LOCAL_SUPABASE_URL");
const serviceRoleKey = requiredEnv("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
const service = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fixture = {
  requesterEmail: "phase1-migration-requester@example.com",
  actorEmail: "phase1-migration-actor@example.com",
  missingParticipantEmail: "phase1-missing-participant@example.com",
  missingOwnerEmail: "phase1-missing-owner@example.com",
  requestNo: "PHASE1-MIGRATION-RESOLVED",
  unresolvedRequestNo: "PHASE1-MIGRATION-UNRESOLVED",
  templateKey: "phase1-migration-template",
  attachmentUrl: "https://files.example.com/phase1-migration.pdf",
  password: "Phase1-Migration-Aa1!",
};

if (mode === "seed") {
  await seedLegacyRows();
  console.log("Legacy migration fixture seeded.");
} else {
  await verifyBackfill();
  console.log("Authoritative migration backfill verified.");
}

async function seedLegacyRows() {
  const requester = await createUser(fixture.requesterEmail, "Migration Requester");
  const actor = await createUser(fixture.actorEmail, "Migration Actor");

  const { error: profileError } = await service.from("profiles").insert([
    {
      id: requester.id,
      email: requester.email,
      full_name: "Migration Requester",
      role: "requester",
      is_admin: false,
      is_active: true,
    },
    {
      id: actor.id,
      email: actor.email,
      full_name: "Migration Actor",
      role: "approver",
      is_admin: false,
      is_active: true,
    },
  ]);
  assert.ifError(profileError);

  const { data: business, error: businessError } = await service
    .from("business_units")
    .insert({ name: "Migration Business", is_active: true })
    .select("id")
    .single();
  assert.ifError(businessError);

  const { data: department, error: departmentError } = await service
    .from("business_departments")
    .insert({
      business_unit_id: business.id,
      name: "Migration Department",
      is_active: true,
    })
    .select("id")
    .single();
  assert.ifError(departmentError);

  const { data: template, error: templateError } = await service
    .from("workflow_template_versions")
    .insert({
      template_key: fixture.templateKey,
      version_number: 1,
      name: "Migration Template",
      business_unit_id: business.id,
      department_id: department.id,
      graph: { nodes: [], edges: [] },
      document_requirements: [],
      supported_languages: ["en"],
      template_snapshot: "malformed legacy snapshot",
      created_by: requester.id,
    })
    .select("id")
    .single();
  assert.ifError(templateError);

  const rows = [
    {
      request_no: fixture.requestNo,
      workflow_template_version_id: template.id,
      requester_id: null,
      requester_name: "Migration Requester",
      requester_email: fixture.requesterEmail,
      title: "Resolved migration request",
      workflow_name: "Migration Template",
      department_name: "Migration Department",
      status: "overdue",
      due_label: "Yesterday",
      current_node_id: "approval-1",
      current_owner_email: fixture.actorEmail,
      current_step: "Approval",
      value_label: "HKD 500",
      last_action: "Submitted",
      pending_node_ids: ["approval-1"],
      pending_owner_emails: [fixture.actorEmail],
      participants: [fixture.actorEmail, fixture.missingParticipantEmail],
      task_snapshot: ["malformed", "legacy", "task"],
    },
    {
      request_no: fixture.unresolvedRequestNo,
      workflow_template_version_id: template.id,
      requester_id: null,
      requester_name: "Migration Requester",
      requester_email: fixture.requesterEmail,
      title: "Unresolved migration request",
      workflow_name: "Migration Template",
      department_name: "Migration Department",
      status: "pending",
      due_label: "Tomorrow",
      current_node_id: "approval-1",
      current_owner_email: fixture.missingOwnerEmail,
      current_step: "Approval",
      value_label: "HKD 750",
      last_action: "Submitted",
      pending_node_ids: ["approval-1"],
      pending_owner_emails: [fixture.missingOwnerEmail],
      participants: [fixture.missingOwnerEmail],
      task_snapshot: { id: fixture.unresolvedRequestNo },
    },
  ];
  const { data: requests, error: requestError } = await service
    .from("approval_requests")
    .insert(rows)
    .select("id,request_no");
  assert.ifError(requestError);

  const resolved = requests.find((request) => request.request_no === fixture.requestNo);
  assert.ok(resolved);
  const { error: eventError } = await service.from("approval_request_events").insert({
    approval_request_id: resolved.id,
    event_key: "legacy-event-1",
    action: "assigned",
    actor_id: requester.id,
    actor_name: "Migration Requester",
    actor_email: fixture.requesterEmail,
    detail: "Legacy request assigned.",
    target_email: fixture.actorEmail,
  });
  assert.ifError(eventError);

  const { error: attachmentError } = await service
    .from("approval_request_attachments")
    .insert({
      approval_request_id: resolved.id,
      attachment_key: "legacy-attachment-1",
      file_name: "migration.pdf",
      document_type: "Migration document",
      document_format: "pdf",
      storage_path: "migration/migration.pdf",
      public_url: fixture.attachmentUrl,
      uploaded_by: requester.id,
      uploaded_by_email: fixture.requesterEmail,
    });
  assert.ifError(attachmentError);
}

async function verifyBackfill() {
  const { data: profiles, error: profileError } = await service
    .from("profiles")
    .select("id,email")
    .in("email", [fixture.requesterEmail, fixture.actorEmail]);
  assert.ifError(profileError);
  const profileByEmail = new Map(profiles.map((profile) => [profile.email, profile]));

  const { data: requests, error: requestError } = await service
    .from("approval_requests")
    .select(
      "id,request_no,requester_id,current_owner_id,current_owner_email,schema_version,state_version,task_snapshot,pinned_template_snapshot",
    )
    .in("request_no", [fixture.requestNo, fixture.unresolvedRequestNo]);
  assert.ifError(requestError);
  const requestByNo = new Map(requests.map((request) => [request.request_no, request]));
  const resolved = requestByNo.get(fixture.requestNo);
  const unresolved = requestByNo.get(fixture.unresolvedRequestNo);
  assert.ok(resolved);
  assert.ok(unresolved);

  assert.equal(resolved.requester_id, profileByEmail.get(fixture.requesterEmail).id);
  assert.equal(resolved.current_owner_id, profileByEmail.get(fixture.actorEmail).id);
  assert.equal(resolved.schema_version, 1);
  assert.equal(resolved.state_version, 0);
  assert.equal(resolved.task_snapshot.schemaVersion, 1);
  assert.equal(resolved.task_snapshot.id, fixture.requestNo);
  assert.equal(resolved.pinned_template_snapshot.schemaVersion, 1);
  assert.equal(resolved.pinned_template_snapshot.templateKey, fixture.templateKey);

  assert.equal(unresolved.requester_id, profileByEmail.get(fixture.requesterEmail).id);
  assert.equal(unresolved.current_owner_id, null);
  assert.equal(unresolved.current_owner_email, fixture.missingOwnerEmail);

  const { data: participants, error: participantError } = await service
    .from("approval_request_participants")
    .select("profile_id,participant_role,workflow_node_id")
    .eq("approval_request_id", resolved.id);
  assert.ifError(participantError);
  assert.ok(
    participants.some(
      (participant) =>
        participant.profile_id === profileByEmail.get(fixture.requesterEmail).id &&
        participant.participant_role === "requester",
    ),
  );
  assert.ok(
    participants.some(
      (participant) =>
        participant.profile_id === profileByEmail.get(fixture.actorEmail).id &&
        participant.participant_role === "owner" &&
        participant.workflow_node_id === "approval-1",
    ),
  );

  const { data: issues, error: issueError } = await service
    .from("approval_migration_issues")
    .select("entity_id,field_name,legacy_value,reason");
  assert.ifError(issueError);
  assert.ok(
    issues.some(
      (issue) =>
        issue.entity_id === resolved.id &&
        issue.field_name === "participants" &&
        issue.legacy_value === fixture.missingParticipantEmail,
    ),
  );
  assert.ok(
    issues.some(
      (issue) =>
        issue.entity_id === unresolved.id &&
        issue.field_name === "current_owner_email" &&
        issue.legacy_value === fixture.missingOwnerEmail,
    ),
  );

  const { data: events, error: eventError } = await service
    .from("approval_request_events")
    .select("id,event_type,request_version")
    .eq("approval_request_id", resolved.id);
  assert.ifError(eventError);
  assert.deepEqual(events.map(({ event_type, request_version }) => ({
    event_type,
    request_version,
  })), [{ event_type: "assigned", request_version: 0 }]);

  const { data: attachment, error: attachmentError } = await service
    .from("approval_request_attachments")
    .select("public_url")
    .eq("approval_request_id", resolved.id)
    .single();
  assert.ifError(attachmentError);
  assert.equal(attachment.public_url, fixture.attachmentUrl);
}

async function createUser(email, fullName) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: fixture.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  assert.ifError(error);
  assert.ok(data.user);
  return data.user;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
