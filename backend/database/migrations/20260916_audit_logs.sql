create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'System',
  actor_type text not null default 'system' check (actor_type in ('user', 'system', 'integration')),
  action text not null,
  module text not null,
  category text not null default 'ai_system' check (category in ('workflow', 'ai_system', 'security')),
  target text,
  status text not null default 'success' check (status in ('success', 'failed', 'pending')),
  state_before text,
  state_after text,
  duration_ms integer,
  method text,
  path text,
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_module_idx on public.audit_logs (module);
create index if not exists audit_logs_status_idx on public.audit_logs (status);

-- Remove request-level noise created by the earlier interceptor prototype.
delete from public.audit_logs where method is not null;
