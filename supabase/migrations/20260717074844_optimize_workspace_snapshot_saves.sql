alter table public.workspace_snapshots
  add column if not exists snapshot_hash text;
