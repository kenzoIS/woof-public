-- Durable backend-owned state for alerts and notification read/dismiss actions.
-- These tables are accessed only by the Nest backend's server-side Supabase client.

create table if not exists public.system_alerts (
  id text primary key,
  alert_key text not null unique,
  module text not null,
  severity text not null,
  classification text not null,
  title text not null,
  evidence text not null,
  target_url text not null,
  action_label text not null,
  status text not null check (status in ('active', 'acknowledged', 'resolved')),
  first_triggered_at timestamptz not null,
  last_evaluated_at timestamptz not null,
  acknowledged_at timestamptz,
  acknowledged_by text,
  snooze_until timestamptz,
  resolved_at timestamptz,
  resolution_type text check (resolution_type in ('auto', 'manual')),
  resolution_reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists system_alerts_active_status_idx
  on public.system_alerts (status, last_evaluated_at desc);

create table if not exists public.user_notifications (
  id text primary key,
  recipient_email text not null default 'all',
  type text not null check (type in ('alert', 'opportunity', 'suggestion', 'report', 'system', 'info')),
  title text not null,
  message text not null,
  target_url text not null,
  action_label text not null,
  read boolean not null default false,
  read_at timestamptz,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists user_notifications_recipient_type_idx
  on public.user_notifications (recipient_email, type, created_at desc);

create index if not exists user_notifications_created_at_idx
  on public.user_notifications (created_at desc);

alter table public.system_alerts enable row level security;
alter table public.user_notifications enable row level security;

-- The browser uses authenticated backend endpoints, never the Supabase Data API
-- directly. Keep notification state unavailable to public client roles.
revoke all on table public.system_alerts from anon, authenticated;
revoke all on table public.user_notifications from anon, authenticated;

-- Make the newly created tables available to the Supabase REST schema cache.
notify pgrst, 'reload schema';
