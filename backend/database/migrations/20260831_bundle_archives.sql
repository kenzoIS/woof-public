create table if not exists public.bundle_archives (
  id uuid primary key default gen_random_uuid(),
  bundle_name text not null,
  source text not null default 'generated',
  status text not null default 'active',
  items jsonb not null default '[]'::jsonb,
  bundle_price numeric,
  regular_price numeric,
  savings numeric,
  discount_percent numeric,
  available_month text,
  availability_start_date date,
  availability_end_date date,
  promo_mechanic text,
  notes text,
  support numeric,
  confidence numeric,
  lift numeric,
  projected_gross_profit numeric,
  projected_margin_percent numeric,
  created_by text default 'owner',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  constraint bundle_archives_source_check check (source in ('manual', 'generated')),
  constraint bundle_archives_status_check check (status in ('active', 'archived', 'deleted')),
  constraint bundle_archives_items_array_check check (jsonb_typeof(items) = 'array')
);

create index if not exists bundle_archives_status_idx
  on public.bundle_archives (status);

create index if not exists bundle_archives_source_idx
  on public.bundle_archives (source);

create index if not exists bundle_archives_created_at_idx
  on public.bundle_archives (created_at desc);

create index if not exists bundle_archives_items_gin_idx
  on public.bundle_archives using gin (items);
