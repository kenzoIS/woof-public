-- Backend access uses Supabase service role only; service role bypasses RLS.
-- No browser client queries these tables directly, so no authenticated policy is granted.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'bundle_archives', 'recommendation_feedback', 'audit_logs',
    'prescription_drafts', 'active_prescriptions', 'prescription_recalibration_events'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('alter table public.%I force row level security', table_name);
    end if;
  end loop;
end $$;
