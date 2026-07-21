param(
  [string]$Container = "supabase_db_Approval_Workflow_Phase1_DB_Test"
)

$ErrorActionPreference = "Stop"
if ($Container -ne "supabase_db_Approval_Workflow_Phase1_DB_Test") {
  throw "Phase 7 restore rehearsal is restricted to the disposable local database container."
}

$runId = [Guid]::NewGuid().ToString("N").Substring(0, 12)
$restoreDatabase = "phase7_restore_$runId"
$dumpPath = "/tmp/$restoreDatabase.dump"

function Invoke-DockerChecked {
  param([string[]]$Arguments)
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker command failed: $($Arguments -join ' ')"
  }
}

try {
  Invoke-DockerChecked @(
    "exec", $Container, "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc",
    "--no-owner", "--no-privileges",
    "--schema=public", "--schema=private", "--schema=auth", "--schema=storage",
    "--schema=supabase_migrations", "--schema=extensions",
    "-f", $dumpPath
  )
  Invoke-DockerChecked @("exec", $Container, "createdb", "-U", "postgres", "-T", "template0", $restoreDatabase)
  Invoke-DockerChecked @("exec", $Container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", $restoreDatabase, "-c", "drop schema public cascade")
  Invoke-DockerChecked @("exec", $Container, "pg_restore", "-U", "postgres", "-d", $restoreDatabase, "--exit-on-error", "--no-owner", "--no-privileges", $dumpPath)

  $comparisonSql = @"
select json_build_object(
  'requests', (select count(*) from public.approval_requests),
  'events', (select count(*) from public.approval_request_events),
  'receipts', (select count(*) from public.approval_command_receipts),
  'notifications', (select count(*) from public.approval_notifications),
  'outbox', (select count(*) from public.approval_email_outbox),
  'profiles', (select count(*) from public.profiles),
  'rolloutSettings', (select count(*) from public.approval_rollout_settings),
  'rolloutEvents', (select count(*) from public.approval_rollout_events),
  'readMismatches', (select count(*) from public.approval_read_comparison_mismatches),
  'rolloutMode', (select mode from public.approval_rollout_settings where singleton),
  'legacyFreezeTriggers', (
    select count(*) from pg_trigger
    where tgname = 'legacy_runtime_write_frozen' and not tgisinternal
  ),
  'storageObjects', (select count(*) from storage.objects),
  'migrations', (select count(*) from supabase_migrations.schema_migrations),
  'operationalFunction', to_regprocedure('public.get_approval_operational_metrics()') is not null,
  'rolloutFunction', to_regprocedure('public.get_approval_rollout_decision(uuid)') is not null
)::text;
"@
  $source = (& docker exec $Container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d postgres -c $comparisonSql).Trim()
  if ($LASTEXITCODE -ne 0) { throw "source comparison query failed" }
  $restored = (& docker exec $Container psql -X -qAt -v ON_ERROR_STOP=1 -U postgres -d $restoreDatabase -c $comparisonSql).Trim()
  if ($LASTEXITCODE -ne 0) { throw "restored comparison query failed" }
  if ($source -ne $restored) {
    throw "restored database does not match source counts`nsource=$source`nrestored=$restored"
  }

  [ordered]@{
    outcome = "passed"
    sourceDatabase = "postgres"
    restoreDatabase = $restoreDatabase
    comparison = ($source | ConvertFrom-Json)
  } | ConvertTo-Json -Compress
}
finally {
  & docker exec $Container dropdb -U postgres --if-exists --force $restoreDatabase | Out-Null
  & docker exec $Container rm -f $dumpPath | Out-Null
}
