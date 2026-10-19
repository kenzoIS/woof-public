-- Manual, server-admin-only cleanup. This is intentionally NOT invoked automatically.
-- Run only after the administrator has enrolled and verified a Supabase TOTP factor.
create schema if not exists private;

create or replace function private.remove_legacy_twofactor_metadata(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = auth, pg_catalog
as $$
declare
  changed_count bigint;
begin
  if not exists (
    select 1 from auth.mfa_factors
    where user_id = p_user_id and factor_type = 'totp' and status = 'verified'
  ) then
    raise exception 'Verified Supabase TOTP factor is required before legacy metadata removal';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'twoFactor'
   where id = p_user_id and raw_user_meta_data ? 'twoFactor';
  get diagnostics changed_count = row_count;
  return changed_count > 0;
end;
$$;

revoke all on function private.remove_legacy_twofactor_metadata(uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.remove_legacy_twofactor_metadata(uuid) to service_role;
