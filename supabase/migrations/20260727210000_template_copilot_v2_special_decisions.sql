-- Locked, server-projected defer / N/A / reopen decisions. This migration
-- validates a narrow ledger delta and independently derives the exact reopen
-- closure from the immutable v2.0 question-library dependency graph.
alter table public.template_copilot_v2_audit_events
  drop constraint if exists template_copilot_v2_audit_events_operation_check;
alter table public.template_copilot_v2_audit_events
  add constraint template_copilot_v2_audit_events_operation_check
  check (operation in ('create_session','record_candidate','human_commit','mark_unknown','mark_not_applicable','resolve_conflict','legacy_upgrade','atomic_answer','special_decision'));

-- This private immutable graph contains every one of the 316 v2.0 decisions.
-- Each value is the sorted union of that question's prerequisite and
-- applicability decision IDs. Tests mechanically compare this exact JSON
-- against the pinned TypeScript library, including all per-target closures.
create or replace function private.template_copilot_v2_dependency_graph(
  p_library_version text
) returns table(decision_id text, dependency_decision_ids text[])
language sql
immutable
security invoker
set search_path = ''
as $$
  with pinned(graph) as (
    select
      -- TEMPLATE_COPILOT_V2_DEPENDENCY_GRAPH_BEGIN
      $v2_dependency_graph${"decision.workflow.name.name":[],"decision.workflow.purpose.purpose":[],"decision.workflow.scope.included":[],"decision.workflow.scope.excluded":[],"decision.request.initiator_policy.who_can_start":[],"decision.request.initiator_policy.initiator_roles":["decision.request.initiator_policy.who_can_start"],"decision.request.fields.first_required_field":[],"decision.attachments.requirements.needed":[],"decision.attachments.requirements.first_file":["decision.attachments.requirements.needed"],"decision.workflow.stages.first_stage":[],"decision.workflow.stages.first_stage_person_mode":["decision.workflow.stages.first_stage"],"decision.workflow.stages.first_stage_person_detail":["decision.workflow.stages.first_stage_person_mode"],"decision.workflow.stages.stage_2_needed":["decision.workflow.stages.first_stage_person_mode"],"decision.workflow.stages.stage_2_name":["decision.workflow.stages.stage_2_needed"],"decision.workflow.stages.stage_2_person_mode":["decision.workflow.stages.stage_2_name","decision.workflow.stages.stage_2_needed"],"decision.workflow.stages.stage_2_person_detail":["decision.workflow.stages.stage_2_person_mode"],"decision.workflow.stages.add_another_02":["decision.workflow.stages.stage_2_needed","decision.workflow.stages.stage_2_person_mode"],"decision.workflow.conditions.needed":[],"decision.workflow.conditions.field":["decision.workflow.conditions.needed"],"decision.workflow.conditions.comparison":["decision.workflow.conditions.field","decision.workflow.conditions.needed"],"decision.workflow.conditions.value":["decision.workflow.conditions.comparison","decision.workflow.conditions.needed"],"decision.workflow.conditions.matching_action":["decision.workflow.conditions.needed","decision.workflow.conditions.value"],"decision.workflow.conditions.other_action":["decision.workflow.conditions.matching_action","decision.workflow.conditions.needed"],"decision.workflow.rejection_policy.after_rejection":[],"decision.collaboration.policy.another_person_upload":[],"decision.collaboration.policy.corrected_file_check":[],"decision.collaboration.policy.correction_checker":["decision.collaboration.policy.corrected_file_check"],"decision.timing.rules.due_time":[],"decision.timing.rules.reminder_time":[],"decision.timing.rules.overdue_action":[],"decision.visibility.policy.who_can_view":[],"decision.notifications.rules.needed":[],"decision.notifications.rules.event":["decision.notifications.rules.needed"],"decision.notifications.rules.recipient":["decision.notifications.rules.event","decision.notifications.rules.needed"],"decision.notifications.rules.channel":["decision.notifications.rules.needed","decision.notifications.rules.recipient"],"decision.governance.owner.owning_department":[],"decision.governance.policies.reviewer":[],"decision.governance.policies.policy_name":[],"decision.governance.retention.retention":[],"decision.request.fields.add_another_01":["decision.request.fields.first_required_field"],"decision.request.fields.field_02":["decision.request.fields.add_another_01"],"decision.request.fields.add_another_02":["decision.request.fields.field_02"],"decision.request.fields.field_03":["decision.request.fields.add_another_02"],"decision.request.fields.add_another_03":["decision.request.fields.field_03"],"decision.request.fields.field_04":["decision.request.fields.add_another_03"],"decision.request.fields.add_another_04":["decision.request.fields.field_04"],"decision.request.fields.field_05":["decision.request.fields.add_another_04"],"decision.request.fields.add_another_05":["decision.request.fields.field_05"],"decision.request.fields.field_06":["decision.request.fields.add_another_05"],"decision.request.fields.add_another_06":["decision.request.fields.field_06"],"decision.request.fields.field_07":["decision.request.fields.add_another_06"],"decision.request.fields.add_another_07":["decision.request.fields.field_07"],"decision.request.fields.field_08":["decision.request.fields.add_another_07"],"decision.request.fields.add_another_08":["decision.request.fields.field_08"],"decision.request.fields.field_09":["decision.request.fields.add_another_08"],"decision.request.fields.add_another_09":["decision.request.fields.field_09"],"decision.request.fields.field_10":["decision.request.fields.add_another_09"],"decision.request.fields.add_another_10":["decision.request.fields.field_10"],"decision.request.fields.field_11":["decision.request.fields.add_another_10"],"decision.request.fields.add_another_11":["decision.request.fields.field_11"],"decision.request.fields.field_12":["decision.request.fields.add_another_11"],"decision.request.fields.add_another_12":["decision.request.fields.field_12"],"decision.request.fields.field_13":["decision.request.fields.add_another_12"],"decision.request.fields.add_another_13":["decision.request.fields.field_13"],"decision.request.fields.field_14":["decision.request.fields.add_another_13"],"decision.request.fields.add_another_14":["decision.request.fields.field_14"],"decision.request.fields.field_15":["decision.request.fields.add_another_14"],"decision.request.fields.add_another_15":["decision.request.fields.field_15"],"decision.request.fields.field_16":["decision.request.fields.add_another_15"],"decision.request.fields.add_another_16":["decision.request.fields.field_16"],"decision.request.fields.field_17":["decision.request.fields.add_another_16"],"decision.request.fields.add_another_17":["decision.request.fields.field_17"],"decision.request.fields.field_18":["decision.request.fields.add_another_17"],"decision.request.fields.add_another_18":["decision.request.fields.field_18"],"decision.request.fields.field_19":["decision.request.fields.add_another_18"],"decision.request.fields.add_another_19":["decision.request.fields.field_19"],"decision.request.fields.field_20":["decision.request.fields.add_another_19"],"decision.attachments.requirements.add_another_01":["decision.attachments.requirements.first_file","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_02":["decision.attachments.requirements.add_another_01"],"decision.attachments.requirements.add_another_02":["decision.attachments.requirements.file_02","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_03":["decision.attachments.requirements.add_another_02"],"decision.attachments.requirements.add_another_03":["decision.attachments.requirements.file_03","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_04":["decision.attachments.requirements.add_another_03"],"decision.attachments.requirements.add_another_04":["decision.attachments.requirements.file_04","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_05":["decision.attachments.requirements.add_another_04"],"decision.attachments.requirements.add_another_05":["decision.attachments.requirements.file_05","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_06":["decision.attachments.requirements.add_another_05"],"decision.attachments.requirements.add_another_06":["decision.attachments.requirements.file_06","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_07":["decision.attachments.requirements.add_another_06"],"decision.attachments.requirements.add_another_07":["decision.attachments.requirements.file_07","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_08":["decision.attachments.requirements.add_another_07"],"decision.attachments.requirements.add_another_08":["decision.attachments.requirements.file_08","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_09":["decision.attachments.requirements.add_another_08"],"decision.attachments.requirements.add_another_09":["decision.attachments.requirements.file_09","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_10":["decision.attachments.requirements.add_another_09"],"decision.attachments.requirements.add_another_10":["decision.attachments.requirements.file_10","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_11":["decision.attachments.requirements.add_another_10"],"decision.attachments.requirements.add_another_11":["decision.attachments.requirements.file_11","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_12":["decision.attachments.requirements.add_another_11"],"decision.attachments.requirements.add_another_12":["decision.attachments.requirements.file_12","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_13":["decision.attachments.requirements.add_another_12"],"decision.attachments.requirements.add_another_13":["decision.attachments.requirements.file_13","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_14":["decision.attachments.requirements.add_another_13"],"decision.attachments.requirements.add_another_14":["decision.attachments.requirements.file_14","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_15":["decision.attachments.requirements.add_another_14"],"decision.attachments.requirements.add_another_15":["decision.attachments.requirements.file_15","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_16":["decision.attachments.requirements.add_another_15"],"decision.attachments.requirements.add_another_16":["decision.attachments.requirements.file_16","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_17":["decision.attachments.requirements.add_another_16"],"decision.attachments.requirements.add_another_17":["decision.attachments.requirements.file_17","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_18":["decision.attachments.requirements.add_another_17"],"decision.attachments.requirements.add_another_18":["decision.attachments.requirements.file_18","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_19":["decision.attachments.requirements.add_another_18"],"decision.attachments.requirements.add_another_19":["decision.attachments.requirements.file_19","decision.attachments.requirements.needed"],"decision.attachments.requirements.file_20":["decision.attachments.requirements.add_another_19"],"decision.workflow.stages.stage_03_name":["decision.workflow.stages.add_another_02"],"decision.workflow.stages.stage_03_person_mode":["decision.workflow.stages.stage_03_name"],"decision.workflow.stages.stage_03_person_detail":["decision.workflow.stages.stage_03_person_mode"],"decision.workflow.stages.add_another_03":["decision.workflow.stages.stage_03_person_mode"],"decision.workflow.stages.stage_04_name":["decision.workflow.stages.add_another_03"],"decision.workflow.stages.stage_04_person_mode":["decision.workflow.stages.stage_04_name"],"decision.workflow.stages.stage_04_person_detail":["decision.workflow.stages.stage_04_person_mode"],"decision.workflow.stages.add_another_04":["decision.workflow.stages.stage_04_person_mode"],"decision.workflow.stages.stage_05_name":["decision.workflow.stages.add_another_04"],"decision.workflow.stages.stage_05_person_mode":["decision.workflow.stages.stage_05_name"],"decision.workflow.stages.stage_05_person_detail":["decision.workflow.stages.stage_05_person_mode"],"decision.workflow.stages.add_another_05":["decision.workflow.stages.stage_05_person_mode"],"decision.workflow.stages.stage_06_name":["decision.workflow.stages.add_another_05"],"decision.workflow.stages.stage_06_person_mode":["decision.workflow.stages.stage_06_name"],"decision.workflow.stages.stage_06_person_detail":["decision.workflow.stages.stage_06_person_mode"],"decision.workflow.stages.add_another_06":["decision.workflow.stages.stage_06_person_mode"],"decision.workflow.stages.stage_07_name":["decision.workflow.stages.add_another_06"],"decision.workflow.stages.stage_07_person_mode":["decision.workflow.stages.stage_07_name"],"decision.workflow.stages.stage_07_person_detail":["decision.workflow.stages.stage_07_person_mode"],"decision.workflow.stages.add_another_07":["decision.workflow.stages.stage_07_person_mode"],"decision.workflow.stages.stage_08_name":["decision.workflow.stages.add_another_07"],"decision.workflow.stages.stage_08_person_mode":["decision.workflow.stages.stage_08_name"],"decision.workflow.stages.stage_08_person_detail":["decision.workflow.stages.stage_08_person_mode"],"decision.workflow.stages.add_another_08":["decision.workflow.stages.stage_08_person_mode"],"decision.workflow.stages.stage_09_name":["decision.workflow.stages.add_another_08"],"decision.workflow.stages.stage_09_person_mode":["decision.workflow.stages.stage_09_name"],"decision.workflow.stages.stage_09_person_detail":["decision.workflow.stages.stage_09_person_mode"],"decision.workflow.stages.add_another_09":["decision.workflow.stages.stage_09_person_mode"],"decision.workflow.stages.stage_10_name":["decision.workflow.stages.add_another_09"],"decision.workflow.stages.stage_10_person_mode":["decision.workflow.stages.stage_10_name"],"decision.workflow.stages.stage_10_person_detail":["decision.workflow.stages.stage_10_person_mode"],"decision.workflow.stages.add_another_10":["decision.workflow.stages.stage_10_person_mode"],"decision.workflow.stages.stage_11_name":["decision.workflow.stages.add_another_10"],"decision.workflow.stages.stage_11_person_mode":["decision.workflow.stages.stage_11_name"],"decision.workflow.stages.stage_11_person_detail":["decision.workflow.stages.stage_11_person_mode"],"decision.workflow.stages.add_another_11":["decision.workflow.stages.stage_11_person_mode"],"decision.workflow.stages.stage_12_name":["decision.workflow.stages.add_another_11"],"decision.workflow.stages.stage_12_person_mode":["decision.workflow.stages.stage_12_name"],"decision.workflow.stages.stage_12_person_detail":["decision.workflow.stages.stage_12_person_mode"],"decision.workflow.stages.add_another_12":["decision.workflow.stages.stage_12_person_mode"],"decision.workflow.stages.stage_13_name":["decision.workflow.stages.add_another_12"],"decision.workflow.stages.stage_13_person_mode":["decision.workflow.stages.stage_13_name"],"decision.workflow.stages.stage_13_person_detail":["decision.workflow.stages.stage_13_person_mode"],"decision.workflow.stages.add_another_13":["decision.workflow.stages.stage_13_person_mode"],"decision.workflow.stages.stage_14_name":["decision.workflow.stages.add_another_13"],"decision.workflow.stages.stage_14_person_mode":["decision.workflow.stages.stage_14_name"],"decision.workflow.stages.stage_14_person_detail":["decision.workflow.stages.stage_14_person_mode"],"decision.workflow.stages.add_another_14":["decision.workflow.stages.stage_14_person_mode"],"decision.workflow.stages.stage_15_name":["decision.workflow.stages.add_another_14"],"decision.workflow.stages.stage_15_person_mode":["decision.workflow.stages.stage_15_name"],"decision.workflow.stages.stage_15_person_detail":["decision.workflow.stages.stage_15_person_mode"],"decision.workflow.stages.add_another_15":["decision.workflow.stages.stage_15_person_mode"],"decision.workflow.stages.stage_16_name":["decision.workflow.stages.add_another_15"],"decision.workflow.stages.stage_16_person_mode":["decision.workflow.stages.stage_16_name"],"decision.workflow.stages.stage_16_person_detail":["decision.workflow.stages.stage_16_person_mode"],"decision.workflow.stages.add_another_16":["decision.workflow.stages.stage_16_person_mode"],"decision.workflow.stages.stage_17_name":["decision.workflow.stages.add_another_16"],"decision.workflow.stages.stage_17_person_mode":["decision.workflow.stages.stage_17_name"],"decision.workflow.stages.stage_17_person_detail":["decision.workflow.stages.stage_17_person_mode"],"decision.workflow.stages.add_another_17":["decision.workflow.stages.stage_17_person_mode"],"decision.workflow.stages.stage_18_name":["decision.workflow.stages.add_another_17"],"decision.workflow.stages.stage_18_person_mode":["decision.workflow.stages.stage_18_name"],"decision.workflow.stages.stage_18_person_detail":["decision.workflow.stages.stage_18_person_mode"],"decision.workflow.stages.add_another_18":["decision.workflow.stages.stage_18_person_mode"],"decision.workflow.stages.stage_19_name":["decision.workflow.stages.add_another_18"],"decision.workflow.stages.stage_19_person_mode":["decision.workflow.stages.stage_19_name"],"decision.workflow.stages.stage_19_person_detail":["decision.workflow.stages.stage_19_person_mode"],"decision.workflow.stages.add_another_19":["decision.workflow.stages.stage_19_person_mode"],"decision.workflow.stages.stage_20_name":["decision.workflow.stages.add_another_19"],"decision.workflow.stages.stage_20_person_mode":["decision.workflow.stages.stage_20_name"],"decision.workflow.stages.stage_20_person_detail":["decision.workflow.stages.stage_20_person_mode"],"decision.workflow.conditions.add_another_01":["decision.workflow.conditions.needed","decision.workflow.conditions.other_action"],"decision.workflow.conditions.condition_02_field":["decision.workflow.conditions.add_another_01"],"decision.workflow.conditions.condition_02_comparison":["decision.workflow.conditions.condition_02_field"],"decision.workflow.conditions.condition_02_value":["decision.workflow.conditions.condition_02_comparison"],"decision.workflow.conditions.condition_02_matching":["decision.workflow.conditions.condition_02_value"],"decision.workflow.conditions.condition_02_otherwise":["decision.workflow.conditions.condition_02_matching"],"decision.workflow.conditions.add_another_02":["decision.workflow.conditions.condition_02_otherwise"],"decision.workflow.conditions.condition_03_field":["decision.workflow.conditions.add_another_02"],"decision.workflow.conditions.condition_03_comparison":["decision.workflow.conditions.condition_03_field"],"decision.workflow.conditions.condition_03_value":["decision.workflow.conditions.condition_03_comparison"],"decision.workflow.conditions.condition_03_matching":["decision.workflow.conditions.condition_03_value"],"decision.workflow.conditions.condition_03_otherwise":["decision.workflow.conditions.condition_03_matching"],"decision.workflow.conditions.add_another_03":["decision.workflow.conditions.condition_03_otherwise"],"decision.workflow.conditions.condition_04_field":["decision.workflow.conditions.add_another_03"],"decision.workflow.conditions.condition_04_comparison":["decision.workflow.conditions.condition_04_field"],"decision.workflow.conditions.condition_04_value":["decision.workflow.conditions.condition_04_comparison"],"decision.workflow.conditions.condition_04_matching":["decision.workflow.conditions.condition_04_value"],"decision.workflow.conditions.condition_04_otherwise":["decision.workflow.conditions.condition_04_matching"],"decision.workflow.conditions.add_another_04":["decision.workflow.conditions.condition_04_otherwise"],"decision.workflow.conditions.condition_05_field":["decision.workflow.conditions.add_another_04"],"decision.workflow.conditions.condition_05_comparison":["decision.workflow.conditions.condition_05_field"],"decision.workflow.conditions.condition_05_value":["decision.workflow.conditions.condition_05_comparison"],"decision.workflow.conditions.condition_05_matching":["decision.workflow.conditions.condition_05_value"],"decision.workflow.conditions.condition_05_otherwise":["decision.workflow.conditions.condition_05_matching"],"decision.workflow.conditions.add_another_05":["decision.workflow.conditions.condition_05_otherwise"],"decision.workflow.conditions.condition_06_field":["decision.workflow.conditions.add_another_05"],"decision.workflow.conditions.condition_06_comparison":["decision.workflow.conditions.condition_06_field"],"decision.workflow.conditions.condition_06_value":["decision.workflow.conditions.condition_06_comparison"],"decision.workflow.conditions.condition_06_matching":["decision.workflow.conditions.condition_06_value"],"decision.workflow.conditions.condition_06_otherwise":["decision.workflow.conditions.condition_06_matching"],"decision.workflow.conditions.add_another_06":["decision.workflow.conditions.condition_06_otherwise"],"decision.workflow.conditions.condition_07_field":["decision.workflow.conditions.add_another_06"],"decision.workflow.conditions.condition_07_comparison":["decision.workflow.conditions.condition_07_field"],"decision.workflow.conditions.condition_07_value":["decision.workflow.conditions.condition_07_comparison"],"decision.workflow.conditions.condition_07_matching":["decision.workflow.conditions.condition_07_value"],"decision.workflow.conditions.condition_07_otherwise":["decision.workflow.conditions.condition_07_matching"],"decision.workflow.conditions.add_another_07":["decision.workflow.conditions.condition_07_otherwise"],"decision.workflow.conditions.condition_08_field":["decision.workflow.conditions.add_another_07"],"decision.workflow.conditions.condition_08_comparison":["decision.workflow.conditions.condition_08_field"],"decision.workflow.conditions.condition_08_value":["decision.workflow.conditions.condition_08_comparison"],"decision.workflow.conditions.condition_08_matching":["decision.workflow.conditions.condition_08_value"],"decision.workflow.conditions.condition_08_otherwise":["decision.workflow.conditions.condition_08_matching"],"decision.workflow.conditions.add_another_08":["decision.workflow.conditions.condition_08_otherwise"],"decision.workflow.conditions.condition_09_field":["decision.workflow.conditions.add_another_08"],"decision.workflow.conditions.condition_09_comparison":["decision.workflow.conditions.condition_09_field"],"decision.workflow.conditions.condition_09_value":["decision.workflow.conditions.condition_09_comparison"],"decision.workflow.conditions.condition_09_matching":["decision.workflow.conditions.condition_09_value"],"decision.workflow.conditions.condition_09_otherwise":["decision.workflow.conditions.condition_09_matching"],"decision.workflow.conditions.add_another_09":["decision.workflow.conditions.condition_09_otherwise"],"decision.workflow.conditions.condition_10_field":["decision.workflow.conditions.add_another_09"],"decision.workflow.conditions.condition_10_comparison":["decision.workflow.conditions.condition_10_field"],"decision.workflow.conditions.condition_10_value":["decision.workflow.conditions.condition_10_comparison"],"decision.workflow.conditions.condition_10_matching":["decision.workflow.conditions.condition_10_value"],"decision.workflow.conditions.condition_10_otherwise":["decision.workflow.conditions.condition_10_matching"],"decision.notifications.rules.add_another_01":["decision.notifications.rules.channel","decision.notifications.rules.needed"],"decision.notifications.rules.notification_02_event":["decision.notifications.rules.add_another_01"],"decision.notifications.rules.notification_02_recipient":["decision.notifications.rules.notification_02_event"],"decision.notifications.rules.notification_02_channel":["decision.notifications.rules.notification_02_recipient"],"decision.notifications.rules.add_another_02":["decision.notifications.rules.notification_02_channel"],"decision.notifications.rules.notification_03_event":["decision.notifications.rules.add_another_02"],"decision.notifications.rules.notification_03_recipient":["decision.notifications.rules.notification_03_event"],"decision.notifications.rules.notification_03_channel":["decision.notifications.rules.notification_03_recipient"],"decision.notifications.rules.add_another_03":["decision.notifications.rules.notification_03_channel"],"decision.notifications.rules.notification_04_event":["decision.notifications.rules.add_another_03"],"decision.notifications.rules.notification_04_recipient":["decision.notifications.rules.notification_04_event"],"decision.notifications.rules.notification_04_channel":["decision.notifications.rules.notification_04_recipient"],"decision.notifications.rules.add_another_04":["decision.notifications.rules.notification_04_channel"],"decision.notifications.rules.notification_05_event":["decision.notifications.rules.add_another_04"],"decision.notifications.rules.notification_05_recipient":["decision.notifications.rules.notification_05_event"],"decision.notifications.rules.notification_05_channel":["decision.notifications.rules.notification_05_recipient"],"decision.notifications.rules.add_another_05":["decision.notifications.rules.notification_05_channel"],"decision.notifications.rules.notification_06_event":["decision.notifications.rules.add_another_05"],"decision.notifications.rules.notification_06_recipient":["decision.notifications.rules.notification_06_event"],"decision.notifications.rules.notification_06_channel":["decision.notifications.rules.notification_06_recipient"],"decision.notifications.rules.add_another_06":["decision.notifications.rules.notification_06_channel"],"decision.notifications.rules.notification_07_event":["decision.notifications.rules.add_another_06"],"decision.notifications.rules.notification_07_recipient":["decision.notifications.rules.notification_07_event"],"decision.notifications.rules.notification_07_channel":["decision.notifications.rules.notification_07_recipient"],"decision.notifications.rules.add_another_07":["decision.notifications.rules.notification_07_channel"],"decision.notifications.rules.notification_08_event":["decision.notifications.rules.add_another_07"],"decision.notifications.rules.notification_08_recipient":["decision.notifications.rules.notification_08_event"],"decision.notifications.rules.notification_08_channel":["decision.notifications.rules.notification_08_recipient"],"decision.notifications.rules.add_another_08":["decision.notifications.rules.notification_08_channel"],"decision.notifications.rules.notification_09_event":["decision.notifications.rules.add_another_08"],"decision.notifications.rules.notification_09_recipient":["decision.notifications.rules.notification_09_event"],"decision.notifications.rules.notification_09_channel":["decision.notifications.rules.notification_09_recipient"],"decision.notifications.rules.add_another_09":["decision.notifications.rules.notification_09_channel"],"decision.notifications.rules.notification_10_event":["decision.notifications.rules.add_another_09"],"decision.notifications.rules.notification_10_recipient":["decision.notifications.rules.notification_10_event"],"decision.notifications.rules.notification_10_channel":["decision.notifications.rules.notification_10_recipient"],"decision.notifications.rules.add_another_10":["decision.notifications.rules.notification_10_channel"],"decision.notifications.rules.notification_11_event":["decision.notifications.rules.add_another_10"],"decision.notifications.rules.notification_11_recipient":["decision.notifications.rules.notification_11_event"],"decision.notifications.rules.notification_11_channel":["decision.notifications.rules.notification_11_recipient"],"decision.notifications.rules.add_another_11":["decision.notifications.rules.notification_11_channel"],"decision.notifications.rules.notification_12_event":["decision.notifications.rules.add_another_11"],"decision.notifications.rules.notification_12_recipient":["decision.notifications.rules.notification_12_event"],"decision.notifications.rules.notification_12_channel":["decision.notifications.rules.notification_12_recipient"],"decision.notifications.rules.add_another_12":["decision.notifications.rules.notification_12_channel"],"decision.notifications.rules.notification_13_event":["decision.notifications.rules.add_another_12"],"decision.notifications.rules.notification_13_recipient":["decision.notifications.rules.notification_13_event"],"decision.notifications.rules.notification_13_channel":["decision.notifications.rules.notification_13_recipient"],"decision.notifications.rules.add_another_13":["decision.notifications.rules.notification_13_channel"],"decision.notifications.rules.notification_14_event":["decision.notifications.rules.add_another_13"],"decision.notifications.rules.notification_14_recipient":["decision.notifications.rules.notification_14_event"],"decision.notifications.rules.notification_14_channel":["decision.notifications.rules.notification_14_recipient"],"decision.notifications.rules.add_another_14":["decision.notifications.rules.notification_14_channel"],"decision.notifications.rules.notification_15_event":["decision.notifications.rules.add_another_14"],"decision.notifications.rules.notification_15_recipient":["decision.notifications.rules.notification_15_event"],"decision.notifications.rules.notification_15_channel":["decision.notifications.rules.notification_15_recipient"],"decision.notifications.rules.add_another_15":["decision.notifications.rules.notification_15_channel"],"decision.notifications.rules.notification_16_event":["decision.notifications.rules.add_another_15"],"decision.notifications.rules.notification_16_recipient":["decision.notifications.rules.notification_16_event"],"decision.notifications.rules.notification_16_channel":["decision.notifications.rules.notification_16_recipient"],"decision.notifications.rules.add_another_16":["decision.notifications.rules.notification_16_channel"],"decision.notifications.rules.notification_17_event":["decision.notifications.rules.add_another_16"],"decision.notifications.rules.notification_17_recipient":["decision.notifications.rules.notification_17_event"],"decision.notifications.rules.notification_17_channel":["decision.notifications.rules.notification_17_recipient"],"decision.notifications.rules.add_another_17":["decision.notifications.rules.notification_17_channel"],"decision.notifications.rules.notification_18_event":["decision.notifications.rules.add_another_17"],"decision.notifications.rules.notification_18_recipient":["decision.notifications.rules.notification_18_event"],"decision.notifications.rules.notification_18_channel":["decision.notifications.rules.notification_18_recipient"],"decision.notifications.rules.add_another_18":["decision.notifications.rules.notification_18_channel"],"decision.notifications.rules.notification_19_event":["decision.notifications.rules.add_another_18"],"decision.notifications.rules.notification_19_recipient":["decision.notifications.rules.notification_19_event"],"decision.notifications.rules.notification_19_channel":["decision.notifications.rules.notification_19_recipient"],"decision.notifications.rules.add_another_19":["decision.notifications.rules.notification_19_channel"],"decision.notifications.rules.notification_20_event":["decision.notifications.rules.add_another_19"],"decision.notifications.rules.notification_20_recipient":["decision.notifications.rules.notification_20_event"],"decision.notifications.rules.notification_20_channel":["decision.notifications.rules.notification_20_recipient"]}$v2_dependency_graph$::jsonb
      -- TEMPLATE_COPILOT_V2_DEPENDENCY_GRAPH_END
  )
  select
    node.key,
    array(
      select dependency.value
      from jsonb_array_elements_text(node.value) as dependency(value)
      order by dependency.value
    )
  from pinned
  cross join lateral jsonb_each(pinned.graph) as node(key, value)
  where p_library_version = 'v2.0';
$$;
revoke all on function private.template_copilot_v2_dependency_graph(text)
from public, anon, authenticated, service_role;

-- Every owned-session special attempt is auditable without retaining hostile
-- raw identifiers. Invalid keys/hashes are irreversibly normalized to bounded
-- deterministic digests that still group repeated attempts.
create or replace function private.audit_template_copilot_v2_special_attempt(
  p_session_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_command_hash text,
  p_revision bigint,
  p_outcome text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_idempotency_key text;
  safe_command_hash text;
  safe_outcome text;
begin
  safe_idempotency_key := case
    when p_idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
      then p_idempotency_key
    else 'reject:' || md5(coalesce(p_idempotency_key, '<null>'))
  end;
  safe_command_hash := case
    when p_command_hash ~ '^[0-9a-f]{64}$'
      then p_command_hash
    else
      md5('special-command-1:' || coalesce(p_command_hash, '<null>')) ||
      md5('special-command-2:' || coalesce(p_command_hash, '<null>'))
  end;
  safe_outcome := case
    when p_outcome = any(array[
      'invalid_command',
      'idempotency_conflict',
      'stale_revision',
      'invalid_transition',
      'replayed_exact'
    ]) then p_outcome
    else 'invalid_command'
  end;
  insert into public.template_copilot_v2_audit_events(
    session_id, owner_id, idempotency_key, command_hash, operation,
    before_revision, after_revision, outcome, detail
  ) values (
    p_session_id,
    p_owner_id,
    safe_idempotency_key,
    safe_command_hash,
    'special_decision',
    p_revision,
    p_revision,
    safe_outcome,
    jsonb_build_object('schemaVersion', 2, 'attempt', safe_outcome)
  );
end;
$$;
revoke all on function private.audit_template_copilot_v2_special_attempt(uuid,uuid,text,text,bigint,text)
from public, anon, authenticated, service_role;

-- Service-only owner-first receipt preflight. A missing/other-owner session is
-- resolved before the idempotency key is inspected, even when the browser
-- actor is an Admin with broader read visibility. Each owned terminal
-- preflight outcome emits exactly one audit event; "missing" emits none so the
-- following mutation remains the sole event for that request.
drop function if exists public.reconcile_template_copilot_v2_special_decision(uuid,uuid,text,text);
create function public.reconcile_template_copilot_v2_special_decision(
  p_actor_id uuid,
  p_session_id uuid,
  p_idempotency_key text,
  p_command_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  r public.template_copilot_v2_operation_receipts%rowtype;
  current_snapshot jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;

  -- Deliberately indistinguishable and unaudited: never reveal whether a key
  -- exists for a session the actor does not own.
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if coalesce(p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$', true) then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  current_snapshot := jsonb_build_object(
    'sessionId', s.id,
    'revision', s.revision,
    'status', s.status,
    'ledger', s.ledger
  );
  select *
  into r
  from public.template_copilot_v2_operation_receipts
  where session_id = p_session_id
    and idempotency_key = p_idempotency_key;
  if not found then
    return current_snapshot || jsonb_build_object('outcome', 'missing');
  end if;
  if r.command_hash is distinct from p_command_hash then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'idempotency_conflict'
    );
    return current_snapshot || jsonb_build_object('outcome', 'idempotency_conflict');
  end if;

  perform private.audit_template_copilot_v2_special_attempt(
    p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
    s.revision, 'replayed_exact'
  );
  return current_snapshot || jsonb_build_object('outcome', 'committed');
end;
$$;
revoke all on function public.reconcile_template_copilot_v2_special_decision(uuid,uuid,text,text)
from public, anon, authenticated;
grant execute on function public.reconcile_template_copilot_v2_special_decision(uuid,uuid,text,text)
to service_role;

drop function if exists public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,text,text[],jsonb);
drop function if exists public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,text,text[],jsonb,text,text,jsonb,jsonb);
drop function if exists public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb);
create function public.apply_template_copilot_v2_special_decision(
  p_actor_id uuid,
  p_session_id uuid,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_command_hash text,
  p_operation text,
  p_projection_valid boolean,
  p_decision_id text,
  p_removed_decision_ids text[],
  p_ledger jsonb,
  p_user_message text,
  p_assistant_message text,
  p_user_detail jsonb,
  p_assistant_detail jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.template_copilot_sessions%rowtype;
  r public.template_copilot_v2_operation_receipts%rowtype;
  response jsonb;
  before_revision bigint;
  decision jsonb;
  source_decision jsonb;
  provenance jsonb;
  answered_at timestamptz;
  user_created_at timestamptz;
  assistant_created_at timestamptz;
  source_keys text[];
  target_keys text[];
  supplied_removed_decision_ids text[];
  expected_removed_decision_ids text[];
  graph_node_count bigint;

  ledger_library_version text;
  session_library_version text;
  decision_kind text;
  decision_answer text;
  decision_display text;
  decision_reason text;
  decision_answered_at_text text;
  source_decision_kind text;
  provenance_kind text;
  provenance_source_id text;

  user_operation text;
  user_decision_id text;
  user_reason text;
  assistant_operation text;
  assistant_decision_id text;
  assistant_status text;
  assistant_next_question_id text;
  reason_length integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select *
  into s
  from public.template_copilot_sessions
  where id = p_session_id
  for update;

  -- Missing and other-owner sessions remain indistinguishable and unaudited.
  if not found or s.owner_id is distinct from p_actor_id then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if p_actor_id is null
     or p_session_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or coalesce(p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$', true)
     or coalesce(p_command_hash !~ '^[0-9a-f]{64}$', true)
     or coalesce(p_operation = any(array['defer', 'not_applicable', 'reopen']), false) = false
     or p_projection_valid is null then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  -- Exact receipt replay precedes mutable-payload validation.
  select *
  into r
  from public.template_copilot_v2_operation_receipts
  where session_id = p_session_id
    and idempotency_key = p_idempotency_key;
  if found then
    if r.command_hash is distinct from p_command_hash then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'idempotency_conflict'
      );
      return jsonb_build_object('outcome', 'idempotency_conflict');
    end if;
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'replayed_exact'
    );
    return r.response || jsonb_build_object(
      'outcome', 'replayed',
      'sessionId', s.id,
      'revision', s.revision,
      'status', s.status,
      'ledger', s.ledger
    );
  end if;

  if s.revision is distinct from p_expected_revision then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'stale_revision'
    );
    return jsonb_build_object(
      'outcome', 'stale_revision',
      'currentRevision', s.revision
    );
  end if;

  if s.status is distinct from 'interviewing' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(s.ledger) is distinct from 'object' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(s.ledger->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(s.ledger->'questionLibraryVersion') is distinct from 'string'
     or jsonb_typeof(s.ledger->'atomicDecisions') is distinct from 'object' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  session_library_version := s.ledger->>'questionLibraryVersion';
  if s.ledger->'schemaVersion' is distinct from '2'::jsonb
     or session_library_version is distinct from 'v2.0' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  -- A false projection flag is an explicit non-mutating sentinel from the
  -- application. Classify it only after authoritative revision/session checks
  -- and before inspecting any candidate ledger or transcript placeholders.
  if p_projection_valid is false then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if coalesce(p_decision_id !~ '^decision\.[a-z][a-z0-9_.-]{2,95}$', true)
     or length(coalesce(p_user_message, '')) not between 1 and 600
     or length(coalesce(p_assistant_message, '')) not between 1 and 16000 then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;

  -- Top-level shapes precede all size and child access.
  if jsonb_typeof(p_ledger) is distinct from 'object'
     or jsonb_typeof(p_user_detail) is distinct from 'object'
     or jsonb_typeof(p_assistant_detail) is distinct from 'object' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if octet_length(p_ledger::text) > 12582912
     -- 500 Unicode code points can require 2,000 UTF-8 bytes before the
     -- bounded JSON field names and escaping overhead are added.
     or octet_length(p_user_detail::text) > 4096
     or octet_length(p_assistant_detail::text) > 2048 then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if jsonb_typeof(p_ledger->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p_ledger->'questionLibraryVersion') is distinct from 'string'
     or jsonb_typeof(p_ledger->'atomicDecisions') is distinct from 'object' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  ledger_library_version := p_ledger->>'questionLibraryVersion';
  if p_ledger->'schemaVersion' is distinct from '2'::jsonb
     or ledger_library_version is distinct from 'v2.0' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_command'
    );
    return jsonb_build_object('outcome', 'invalid_command');
  end if;
  if (p_ledger - 'atomicDecisions') is distinct from (s.ledger - 'atomicDecisions') then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  select count(*)
  into graph_node_count
  from private.template_copilot_v2_dependency_graph(session_library_version);
  if graph_node_count is distinct from 316
     or not exists (
       select 1
       from private.template_copilot_v2_dependency_graph(session_library_version) graph
       where graph.decision_id = p_decision_id
     ) then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  select coalesce(array_agg(source_key.key order by source_key.key), array[]::text[])
  into source_keys
  from jsonb_object_keys(s.ledger->'atomicDecisions') as source_key(key);
  select coalesce(array_agg(target_key.key order by target_key.key), array[]::text[])
  into target_keys
  from jsonb_object_keys(p_ledger->'atomicDecisions') as target_key(key);

  if coalesce(array_ndims(p_removed_decision_ids), 1) > 1
     or coalesce(array_length(p_removed_decision_ids, 1), 0) <>
       coalesce(array_length(array(
         select distinct removed_item.item
         from unnest(coalesce(p_removed_decision_ids, array[]::text[])) as removed_item(item)
       ), 1), 0)
     or exists (
       select 1
       from unnest(coalesce(p_removed_decision_ids, array[]::text[])) as removed_item(item)
       where removed_item.item is null
          or coalesce(removed_item.item !~ '^decision\.[a-z][a-z0-9_.-]{2,95}$', true)
     ) then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  select coalesce(array_agg(removed_item.item order by removed_item.item), array[]::text[])
  into supplied_removed_decision_ids
  from unnest(coalesce(p_removed_decision_ids, array[]::text[])) as removed_item(item);

  if p_operation = any(array['defer', 'not_applicable']) then
    if cardinality(supplied_removed_decision_ids) <> 0
       or (s.ledger->'atomicDecisions') ? p_decision_id
       or not (p_ledger->'atomicDecisions' ? p_decision_id)
       or cardinality(target_keys) <> cardinality(source_keys) + 1
       or (p_ledger->'atomicDecisions' - p_decision_id)
            is distinct from s.ledger->'atomicDecisions' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;

    decision := p_ledger->'atomicDecisions'->p_decision_id;
    if jsonb_typeof(decision) is distinct from 'object' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    if jsonb_typeof(decision->'kind') is distinct from 'string'
       or jsonb_typeof(decision->'answer') is distinct from 'string'
       or jsonb_typeof(decision->'display') is distinct from 'string'
       or jsonb_typeof(decision->'answeredAt') is distinct from 'string'
       or jsonb_typeof(decision->'provenance') is distinct from 'array' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    decision_kind := decision->>'kind';
    decision_answer := decision->>'answer';
    decision_display := decision->>'display';
    decision_answered_at_text := decision->>'answeredAt';

    if jsonb_array_length(decision->'provenance') is distinct from 1 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    provenance := decision->'provenance'->0;
    if jsonb_typeof(provenance) is distinct from 'object' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    if jsonb_typeof(provenance->'kind') is distinct from 'string'
       or jsonb_typeof(provenance->'sourceId') is distinct from 'string'
       or jsonb_typeof(provenance->'sourceMessageIds') is distinct from 'array' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    provenance_kind := provenance->>'kind';
    provenance_source_id := provenance->>'sourceId';
    if jsonb_array_length(provenance->'sourceMessageIds') is distinct from 0
       or provenance_kind is distinct from 'human_editor'
       or provenance_source_id is distinct from ('special:' || p_idempotency_key)
       or (provenance - array['kind','sourceId','sourceMessageIds']) is distinct from '{}'::jsonb
       or (select count(*) from jsonb_object_keys(provenance)) is distinct from 3 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;

    if decision_answered_at_text !~
       '^(([0-9][0-9][2468][048]|[0-9][0-9][13579][26]|[0-9][0-9]0[48]|([02468][48]|[2468]0)00|[13579][26]00)-02-29|([0-9]{3}[1-9]|[0-9]{2}[1-9][0-9]|[0-9][1-9][0-9]{2}|[1-9][0-9]{3})-((0[13578]|1[02])-(0[1-9]|[12][0-9]|3[01])|(0[469]|11)-(0[1-9]|[12][0-9]|30)|(02)-(0[1-9]|1[0-9]|2[0-8])))T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?(Z|[+-]([01][0-9]|2[0-3]):[0-5][0-9])$' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    begin
      if right(decision_answered_at_text, 1) = 'Z' then
        answered_at := decision_answered_at_text::timestamptz;
      else
        -- PostgreSQL's native numeric time-zone parser stops at 15:59 even
        -- though RFC3339 and the canonical Zod contract allow 23:59. Parse
        -- the already-validated local timestamp natively, then apply the
        -- bounded numeric offset relative to UTC without depending on the
        -- database session's TimeZone.
        answered_at := (
          left(
            decision_answered_at_text,
            length(decision_answered_at_text) - 6
          )::timestamp at time zone 'UTC'
        ) - make_interval(
          hours => (
            case
              when substring(
                decision_answered_at_text
                from length(decision_answered_at_text) - 5
                for 1
              ) = '+' then 1
              else -1
            end
          ) * substring(
            decision_answered_at_text
            from length(decision_answered_at_text) - 4
            for 2
          )::integer,
          mins => (
            case
              when substring(
                decision_answered_at_text
                from length(decision_answered_at_text) - 5
                for 1
              ) = '+' then 1
              else -1
            end
          ) * right(decision_answered_at_text, 2)::integer
        );
      end if;
    exception when others then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end;

    if length(decision_display) not between 1 and 500 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    if p_operation = 'defer' then
      if decision_kind is distinct from 'unknown'
         or decision_answer is distinct from 'unknown'
         or decision ? 'reason'
         or (decision - array['kind','answer','display','provenance','answeredAt']) is distinct from '{}'::jsonb
         or (select count(*) from jsonb_object_keys(decision)) is distinct from 5 then
        perform private.audit_template_copilot_v2_special_attempt(
          p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
          s.revision, 'invalid_transition'
        );
        return jsonb_build_object('outcome', 'invalid_transition');
      end if;
    else
      -- v2.0 exposes N/A only for this explicitly optional pinned question.
      if p_decision_id is distinct from 'decision.workflow.scope.excluded'
         or jsonb_typeof(decision->'reason') is distinct from 'string' then
        perform private.audit_template_copilot_v2_special_attempt(
          p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
          s.revision, 'invalid_transition'
        );
        return jsonb_build_object('outcome', 'invalid_transition');
      end if;
      decision_reason := decision->>'reason';
      reason_length := length(decision_reason);
      if decision_kind is distinct from 'not_applicable'
         or decision_answer is distinct from 'not_applicable'
         or reason_length not between 1 and 500
         or (decision - array['kind','answer','display','reason','provenance','answeredAt']) is distinct from '{}'::jsonb
         or (select count(*) from jsonb_object_keys(decision)) is distinct from 6 then
        perform private.audit_template_copilot_v2_special_attempt(
          p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
          s.revision, 'invalid_transition'
        );
        return jsonb_build_object('outcome', 'invalid_transition');
      end if;
    end if;
  else
    if not (s.ledger->'atomicDecisions' ? p_decision_id) then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    source_decision := s.ledger->'atomicDecisions'->p_decision_id;
    if jsonb_typeof(source_decision) is distinct from 'object'
       or jsonb_typeof(source_decision->'kind') is distinct from 'string' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    source_decision_kind := source_decision->>'kind';
    if coalesce(source_decision_kind = any(array['unknown','not_applicable']), false) = false then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;

    -- Database-authoritative reverse transitive closure over both dependency
    -- edge kinds, intersected with decisions that currently exist.
    with recursive reverse_closure(decision_id) as (
      select p_decision_id
      union
      select graph.decision_id
      from reverse_closure closure
      join private.template_copilot_v2_dependency_graph(session_library_version) graph
        on closure.decision_id = any(graph.dependency_decision_ids)
    )
    select coalesce(
      array_agg(closure.decision_id order by closure.decision_id)
        filter (where s.ledger->'atomicDecisions' ? closure.decision_id),
      array[]::text[]
    )
    into expected_removed_decision_ids
    from reverse_closure closure;

    if supplied_removed_decision_ids is distinct from expected_removed_decision_ids then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    if exists (
         select 1
         from unnest(expected_removed_decision_ids) as removed(removed_id)
         where p_ledger->'atomicDecisions' ? removed.removed_id
       )
       or exists (
         select 1
         from jsonb_object_keys(s.ledger->'atomicDecisions') as existing(existing_id)
         where not (existing.existing_id = any(expected_removed_decision_ids))
           and (
             not (p_ledger->'atomicDecisions' ? existing.existing_id)
             or p_ledger->'atomicDecisions'->existing.existing_id
                  is distinct from s.ledger->'atomicDecisions'->existing.existing_id
           )
       )
       or exists (
         select 1
         from jsonb_object_keys(p_ledger->'atomicDecisions') as target(target_id)
         where not (s.ledger->'atomicDecisions' ? target.target_id)
       )
       or cardinality(target_keys) <>
            cardinality(source_keys) - cardinality(expected_removed_decision_ids) then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  end if;

  -- Strict transcript detail contracts. Numeric schemaVersion is never
  -- text-coerced, and each string is gated before extraction or comparison.
  if (p_user_detail - array['schemaVersion','operation','decisionId','reason']) is distinct from '{}'::jsonb
     or (p_assistant_detail - array['schemaVersion','operation','decisionId','status','nextQuestionId']) is distinct from '{}'::jsonb then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  if jsonb_typeof(p_user_detail->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p_user_detail->'operation') is distinct from 'string'
     or jsonb_typeof(p_user_detail->'decisionId') is distinct from 'string'
     or jsonb_typeof(p_assistant_detail->'schemaVersion') is distinct from 'number'
     or jsonb_typeof(p_assistant_detail->'operation') is distinct from 'string'
     or jsonb_typeof(p_assistant_detail->'decisionId') is distinct from 'string'
     or jsonb_typeof(p_assistant_detail->'status') is distinct from 'string' then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;
  user_operation := p_user_detail->>'operation';
  user_decision_id := p_user_detail->>'decisionId';
  assistant_operation := p_assistant_detail->>'operation';
  assistant_decision_id := p_assistant_detail->>'decisionId';
  assistant_status := p_assistant_detail->>'status';

  if p_user_detail->'schemaVersion' is distinct from '2'::jsonb
     or p_assistant_detail->'schemaVersion' is distinct from '2'::jsonb
     or user_operation is distinct from p_operation
     or user_decision_id is distinct from p_decision_id
     or assistant_operation is distinct from p_operation
     or assistant_decision_id is distinct from p_decision_id
     or coalesce(assistant_status = any(array['question','blocked','complete']), false) = false then
    perform private.audit_template_copilot_v2_special_attempt(
      p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
      s.revision, 'invalid_transition'
    );
    return jsonb_build_object('outcome', 'invalid_transition');
  end if;

  if p_operation = 'not_applicable' then
    if jsonb_typeof(p_user_detail->'reason') is distinct from 'string' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    user_reason := p_user_detail->>'reason';
    if user_reason is distinct from decision_reason
       or right(p_user_message, length(decision_reason)) is distinct from decision_reason
       or (select count(*) from jsonb_object_keys(p_user_detail)) is distinct from 4 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  else
    if p_user_detail ? 'reason'
       or (select count(*) from jsonb_object_keys(p_user_detail)) is distinct from 3 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  end if;

  if assistant_status = 'question' then
    if jsonb_typeof(p_assistant_detail->'nextQuestionId') is distinct from 'string' then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
    assistant_next_question_id := p_assistant_detail->>'nextQuestionId';
    if assistant_next_question_id !~ '^v2\.[a-z][a-z0-9_.-]{2,95}$'
       or (select count(*) from jsonb_object_keys(p_assistant_detail)) is distinct from 5 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  else
    if p_assistant_detail ? 'nextQuestionId'
       or (select count(*) from jsonb_object_keys(p_assistant_detail)) is distinct from 4 then
      perform private.audit_template_copilot_v2_special_attempt(
        p_session_id, p_actor_id, p_idempotency_key, p_command_hash,
        s.revision, 'invalid_transition'
      );
      return jsonb_build_object('outcome', 'invalid_transition');
    end if;
  end if;

  before_revision := s.revision;
  update public.template_copilot_sessions
  set ledger = p_ledger,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_session_id
  returning * into s;

  user_created_at := clock_timestamp();
  assistant_created_at := clock_timestamp();
  if assistant_created_at<=user_created_at then
    assistant_created_at := user_created_at + interval '1 microsecond';
  end if;
  insert into public.template_copilot_messages(
    session_id,owner_id,client_message_id,role,content,
    structured_detail, created_at
  ) values
    (
      p_session_id,p_actor_id,p_idempotency_key,'user',
      p_user_message,p_user_detail,user_created_at
    ),
    (
      p_session_id, p_actor_id, p_idempotency_key, 'assistant',
      p_assistant_message,p_assistant_detail,assistant_created_at
    );

  response := jsonb_build_object(
    'outcome', 'applied',
    'sessionId', s.id,
    'revision', s.revision,
    'status', s.status,
    'ledger', s.ledger,
    'userMessage', p_user_message,
    'assistantMessage', p_assistant_message
  );
  insert into public.template_copilot_v2_operation_receipts(
    session_id, idempotency_key, command_hash, response
  ) values (
    p_session_id,
    p_idempotency_key,
    p_command_hash,
    jsonb_build_object(
      'appliedRevision', s.revision,
      'operation', p_operation,
      'decisionId', p_decision_id,
      'removedDecisionIds', supplied_removed_decision_ids,
      'userMessageId', p_idempotency_key,
      'assistantMessageId', p_idempotency_key
    )
  );
  insert into public.template_copilot_v2_audit_events(
    session_id, owner_id, idempotency_key, command_hash, operation,
    before_revision, after_revision, outcome, detail
  ) values (
    p_session_id,
    p_actor_id,
    p_idempotency_key,
    p_command_hash,
    'special_decision',
    before_revision,
    s.revision,
    'applied',
    jsonb_build_object(
      'schemaVersion', 2,
      'operation', p_operation,
      'decisionId', p_decision_id,
      'removedDecisionIds', supplied_removed_decision_ids,
      'reasonLength', reason_length
    )
  );
  return response;
end;
$$;

revoke all on function public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb)
from public, anon, authenticated;
grant execute on function public.apply_template_copilot_v2_special_decision(uuid,uuid,bigint,text,text,text,boolean,text,text[],jsonb,text,text,jsonb,jsonb)
to service_role;
