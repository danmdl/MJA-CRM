-- The DUPLICADOS chip showed every record in a duplicate-name group,
-- originals included (María loaded 3 times counted 3), which didn't
-- line up with the INBOX chip that now counts people. Return both
-- numbers so the chip can show the extra copies (records - people).

create or replace function public.get_duplicate_summary(
  p_church_id uuid,
  p_user_role text,
  p_user_cuerda text,
  p_user_id uuid,
  p_can_see_all boolean
)
returns table(records integer, people integer)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::integer as records, count(distinct d.group_no)::integer as people
  from public.get_duplicate_name_groups(p_church_id, p_user_role, p_user_cuerda, p_user_id, p_can_see_all) d;
$$;

revoke all on function public.get_duplicate_summary(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.get_duplicate_summary(uuid, text, text, uuid, boolean) to authenticated;
