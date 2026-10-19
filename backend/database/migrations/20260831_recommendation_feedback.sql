create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  promotion_id text,
  type text not null default 'bundle',
  title text not null,
  sector text not null,
  target_time text,
  discount text,
  predicted_lift text,
  actual_lift text,
  confidence text,
  status text not null default 'active',
  feedback text,
  feedback_notes text,
  metadata jsonb not null default '{}'::jsonb,
  deployed_at timestamptz not null default now(),
  recalibrated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recommendation_feedback_type_check check (type in ('bundle', 'discount', 'happy-hour', 'flash-sale', 'forecast')),
  constraint recommendation_feedback_status_check check (status in ('active', 'completed', 'failed')),
  constraint recommendation_feedback_rating_check check (feedback is null or feedback in ('helpful', 'not-helpful'))
);

create index if not exists recommendation_feedback_status_idx
  on public.recommendation_feedback (status);

create index if not exists recommendation_feedback_type_idx
  on public.recommendation_feedback (type);

create index if not exists recommendation_feedback_feedback_idx
  on public.recommendation_feedback (feedback);

create index if not exists recommendation_feedback_created_at_idx
  on public.recommendation_feedback (created_at desc);
