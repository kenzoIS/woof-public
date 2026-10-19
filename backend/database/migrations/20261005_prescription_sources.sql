create table if not exists public.prescription_drafts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  prescription_key text not null unique,
  source_type text not null,
  source_id text,
  title text not null,
  description text,
  sector text,
  target_time text,
  mechanic text,
  confidence text,
  status text not null default 'draft',
  generated_by text not null default 'system',
  reviewed_by text,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescription_drafts_category_check
    check (category in ('bundle', 'happy_hour', 'pethub_campaign', 'staffing', 'traffic', 'forecast', 'general')),
  constraint prescription_drafts_status_check
    check (status in ('draft', 'pending', 'reviewed', 'rejected', 'deployed'))
);

create index if not exists prescription_drafts_category_idx
  on public.prescription_drafts (category);

create index if not exists prescription_drafts_status_idx
  on public.prescription_drafts (status);

create index if not exists prescription_drafts_created_at_idx
  on public.prescription_drafts (created_at desc);

create table if not exists public.active_prescriptions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  prescription_key text not null unique,
  source_type text not null,
  source_id text,
  title text not null,
  description text,
  sector text,
  target_time text,
  mechanic text,
  confidence text,
  status text not null default 'active',
  feedback text,
  feedback_notes text,
  accepted_by text not null default 'Owner',
  accepted_at timestamptz not null default now(),
  deployed_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint active_prescriptions_category_check
    check (category in ('bundle', 'happy_hour', 'pethub_campaign', 'staffing', 'traffic', 'forecast', 'general')),
  constraint active_prescriptions_status_check
    check (status in ('active', 'completed', 'failed')),
  constraint active_prescriptions_feedback_check
    check (feedback is null or feedback in ('helpful', 'not-helpful'))
);

create index if not exists active_prescriptions_category_idx
  on public.active_prescriptions (category);

create index if not exists active_prescriptions_status_idx
  on public.active_prescriptions (status);

create index if not exists active_prescriptions_source_idx
  on public.active_prescriptions (source_type, source_id);

create index if not exists active_prescriptions_created_at_idx
  on public.active_prescriptions (created_at desc);

notify pgrst, 'reload schema';
