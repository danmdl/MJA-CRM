-- Semillero's Cuerda / Responsable / Conector dropdowns were built by
-- selecting those columns from contacts and de-duplicating client-side,
-- but PostgREST caps responses at 1000 rows, so the Conector list showed
-- ~39 of 188 values (and Responsable/Cuerda could miss most of theirs).
-- Return the distinct values directly. SECURITY INVOKER: RLS still
-- applies; the scope parameters only narrow (same precedence as
-- applyPoolFilters in semillero-pool-query.ts).

create or replace function public.get_pool_filter_options(
  p_church_id uuid,
  p_kind text,
  p_user_role text,
  p_user_cuerda text,
  p_user_id uuid,
  p_can_see_all boolean
)
returns setof text
language sql
stable
security invoker
set search_path = public
as $$
  select distinct s.v from (
    select case p_kind
             when 'cuerda' then c.numero_cuerda
             when 'responsable' then c.responsable_id::text
             when 'conector' then c.conector
           end as v
    from public.contacts c
    where c.church_id = p_church_id
      and c.deleted_at is null
      and case
            when p_user_role = 'conector' then c.created_by = p_user_id
            when p_can_see_all then true
            when p_user_cuerda is not null then c.numero_cuerda = p_user_cuerda
            else c.responsable_id = p_user_id
          end
  ) s
  where s.v is not null;
$$;

revoke all on function public.get_pool_filter_options(uuid, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.get_pool_filter_options(uuid, text, text, text, uuid, boolean) to authenticated;
