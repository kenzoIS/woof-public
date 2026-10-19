-- Prepared for staging first. Do not apply directly to production without the
-- regression checks in STAGING_SECURITY_TEST_PLAN.md.
--
-- The application invokes the analytics RPCs from its Nest backend through the
-- service-role client. Browser code does not invoke public-table RPCs directly.
-- Remove inherited PUBLIC and explicit anon/authenticated execution so these
-- functions cannot be reached through the PostgREST RPC endpoint by an
-- untrusted client. Keep the server-side service-role path available.

revoke execute on function public.get_cafe_co_attachment(timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.get_cafe_co_attachment(timestamp with time zone, timestamp with time zone) to service_role;

revoke execute on function public.get_dashboard_channel_breakdown(text) from public, anon, authenticated;
grant execute on function public.get_dashboard_channel_breakdown(text) to service_role;

revoke execute on function public.get_dashboard_daily_revenue(text) from public, anon, authenticated;
grant execute on function public.get_dashboard_daily_revenue(text) to service_role;

revoke execute on function public.get_dashboard_kpis(text) from public, anon, authenticated;
grant execute on function public.get_dashboard_kpis(text) to service_role;

revoke execute on function public.get_dashboard_top_items(text) from public, anon, authenticated;
grant execute on function public.get_dashboard_top_items(text) to service_role;

revoke execute on function public.get_forecast_daily_data(text) from public, anon, authenticated;
grant execute on function public.get_forecast_daily_data(text) to service_role;

revoke execute on function public.get_forecast_transaction_stamp(text) from public, anon, authenticated;
grant execute on function public.get_forecast_transaction_stamp(text) to service_role;

revoke execute on function public.get_pricing_catalog(text, timestamp with time zone, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.get_pricing_catalog(text, timestamp with time zone, timestamp with time zone) to service_role;

revoke execute on function public.get_recent_discounted_transactions(integer) from public, anon, authenticated;
grant execute on function public.get_recent_discounted_transactions(integer) to service_role;

revoke execute on function public.get_recent_normal_transactions(integer) from public, anon, authenticated;
grant execute on function public.get_recent_normal_transactions(integer) to service_role;

-- This trigger helper has no application RPC call site. It is SECURITY DEFINER,
-- therefore no application role should be able to invoke it directly.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated, service_role;

-- Trigger functions are invoked by PostgreSQL, not through PostgREST. The
-- service role retains the grant only to preserve existing server capabilities.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;
