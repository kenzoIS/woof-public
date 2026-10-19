create table if not exists public.prescription_recalibration_events (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.recommendation_feedback(id) on delete cascade,
  category text not null,
  source_type text not null,
  source_id text,
  feedback text not null check (feedback in ('helpful', 'not-helpful')),
  notes text,
  target_model text not null,
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed')),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint prescription_recalibration_events_feedback_id_key unique (feedback_id)
);

create index if not exists prescription_recalibration_events_status_idx
  on public.prescription_recalibration_events (status);

create index if not exists prescription_recalibration_events_model_idx
  on public.prescription_recalibration_events (target_model);

create index if not exists prescription_recalibration_events_category_idx
  on public.prescription_recalibration_events (category, source_type);

notify pgrst, 'reload schema';
