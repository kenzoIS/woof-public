-- One-time cleanup for duplicate traffic/opportunity notifications created
-- before stable notification identities and restart recovery were in place.
-- Prefer a read record, then retain the earliest matching record.
with ranked_duplicates as (
  select
    id,
    row_number() over (
      partition by recipient_email, type, title, message, target_url, action_label
      order by read desc, created_at asc, id asc
    ) as row_number
  from public.user_notifications
  where type in ('info', 'opportunity')
)
delete from public.user_notifications
where id in (
  select id
  from ranked_duplicates
  where row_number > 1
);

notify pgrst, 'reload schema';
