-- The Semillero INBOX chip counted records, so someone loaded twice
-- counted twice. Count people instead: inbox contacts in the caller's
-- scope, with every duplicate-name group (get_duplicate_name_groups, which
-- already ignores pairs dismissed as different people) counted once.
-- Inbox = same gate as the pool query: no cell, not pending dispatch,
-- not pending assignment. SECURITY INVOKER: RLS still applies.

create or replace function public.get_inbox_unique_count(
  p_church_id uuid,
  p_user_role text,
  p_user_cuerda text,
  p_user_id uuid,
  p_can_see_all boolean
)
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  with inbox as (
    select c.id
    from public.contacts c
    where c.church_id = p_church_id
      and c.deleted_at is null
      and c.cell_id is null
      and c.pending_external_send = false
      and c.pending_assignment_cell_id is null
      and case
            when p_user_role = 'conector' then c.created_by = p_user_id
            when p_can_see_all then true
            when p_user_cuerda is not null then c.numero_cuerda = p_user_cuerda
            else c.responsable_id = p_user_id
          end
  ),
  dup as (
    select d.contact_id, d.group_no
    from public.get_duplicate_name_groups(p_church_id, p_user_role, p_user_cuerda, p_user_id, p_can_see_all) d
  )
  select (
    (select count(*) from inbox i where not exists (select 1 from dup d where d.contact_id = i.id))
    + (select count(distinct d.group_no) from dup d join inbox i on i.id = d.contact_id)
  )::integer;
$$;

revoke all on function public.get_inbox_unique_count(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.get_inbox_unique_count(uuid, text, text, uuid, boolean) to authenticated;
