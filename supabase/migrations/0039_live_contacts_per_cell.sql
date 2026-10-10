-- get_contacts_per_cell read contacts_per_cell_mv, refreshed by pg_cron
-- every 5 minutes, so cell counts lagged up to 5 min after an
-- assignment. The live aggregate is an index scan on idx_contacts_cell_id
-- (~2 ms), so compute it directly and stop the refresh job. SECURITY
-- DEFINER keeps today's visibility (the matview had no RLS; callers are
-- authenticated users). The matview is left in place, unused.

create or replace function public.get_contacts_per_cell(p_church_id uuid)
returns table(cell_id uuid, contact_count bigint)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
  select c.cell_id, count(*)::bigint
  from public.contacts c
  where c.church_id = p_church_id and c.deleted_at is null and c.cell_id is not null
  group by c.cell_id;
$$;

revoke all on function public.get_contacts_per_cell(uuid) from public, anon;
grant execute on function public.get_contacts_per_cell(uuid) to authenticated;

select cron.unschedule(jobid) from cron.job
where command ilike '%refresh materialized view%contacts_per_cell_mv%';

-- Evaluate auth.uid() once per statement instead of per row
-- (Supabase advisor auth_rls_initplan). Same rule as before.
alter policy contact_logs_insert_policy on public.contact_logs with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and (p.role = any (array['admin'::user_role, 'general'::user_role])
           or exists (select 1 from public.contacts c where c.id = contact_logs.contact_id and c.church_id = p.church_id))
  )
);
