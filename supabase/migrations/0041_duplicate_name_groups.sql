-- Semillero computed duplicate-name groups over the current page only
-- (200 rows), so most of the 2.2k contacts that share a name with
-- someone else never showed the "Dup" badge, and the Duplicados filter
-- missed every pair split across pages. Same rule as the client did:
-- normalized first+last name (same normalization as src/lib/normalize.ts)
-- shared by 2+ contacts in the caller's scope, unless every pair in the
-- group was dismissed as different people. SECURITY INVOKER: RLS still
-- applies; scope params only narrow (same precedence as the pool query).

create or replace function public.get_duplicate_name_groups(
  p_church_id uuid,
  p_user_role text,
  p_user_cuerda text,
  p_user_id uuid,
  p_can_see_all boolean
)
returns table(contact_id uuid, group_no integer)
language sql
stable
security invoker
set search_path = public
as $$
  with scoped as (
    select c.id,
           -- Mirrors normalize() in src/lib/normalize.ts: lowercase, NFD,
           -- strip combining marks, trim, collapse whitespace.
           btrim(regexp_replace(btrim(regexp_replace(
             normalize(lower(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), NFD),
             '[\u0300-\u036f]', '', 'g')), '\s+', ' ', 'g')) as name_key
    from public.contacts c
    where c.church_id = p_church_id
      and c.deleted_at is null
      and case
            when p_user_role = 'conector' then c.created_by = p_user_id
            when p_can_see_all then true
            when p_user_cuerda is not null then c.numero_cuerda = p_user_cuerda
            else c.responsable_id = p_user_id
          end
  ),
  groups as (
    select name_key, array_agg(id) as ids, count(*) as n
    from scoped
    where name_key <> ''
    group by name_key
    having count(*) > 1
  ),
  dismissed as (
    select g.name_key, count(distinct (d.contact_id_a, d.contact_id_b)) as d
    from groups g
    join public.contact_dedupe_dismissals d
      on d.contact_id_a = any (g.ids) and d.contact_id_b = any (g.ids)
    group by g.name_key
  ),
  live as (
    select g.name_key, g.ids
    from groups g
    left join dismissed x on x.name_key = g.name_key
    where coalesce(x.d, 0) < g.n * (g.n - 1) / 2
  )
  select unnest(l.ids) as contact_id,
         (dense_rank() over (order by l.name_key))::integer as group_no
  from live l;
$$;

revoke all on function public.get_duplicate_name_groups(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.get_duplicate_name_groups(uuid, text, text, uuid, boolean) to authenticated;
