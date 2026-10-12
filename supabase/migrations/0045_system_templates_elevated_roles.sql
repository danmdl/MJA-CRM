-- System WhatsApp templates (visible to everyone who uses templates) were
-- admin-only. Let pastor, supervisor, general and admin publish them too.
-- A system template can be edited or deleted only by whoever created it,
-- or by an admin/general; everyone else just sees and uses it.
-- Personal templates keep the old rule (owner or admin).

create or replace function public.current_user_role_text()
returns text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

revoke all on function public.current_user_role_text() from public, anon;
grant execute on function public.current_user_role_text() to authenticated;

alter policy templates_insert on public.whatsapp_templates
  with check (
    current_user_can_use_templates()
    and user_id = (select auth.uid())
    and (
      is_system = false
      or (select public.current_user_role_text()) in ('admin', 'general', 'pastor', 'supervisor')
    )
  );

alter policy templates_update on public.whatsapp_templates
  using (
    current_user_can_use_templates()
    and (
      user_id = (select auth.uid())
      or (select public.current_user_role_text()) = 'admin'
      or (is_system = true and (select public.current_user_role_text()) = 'general')
    )
  )
  with check (
    is_system = false
    or (select public.current_user_role_text()) in ('admin', 'general', 'pastor', 'supervisor')
  );

alter policy templates_delete on public.whatsapp_templates
  using (
    current_user_can_use_templates()
    and (
      user_id = (select auth.uid())
      or (select public.current_user_role_text()) = 'admin'
      or (is_system = true and (select public.current_user_role_text()) = 'general')
    )
  );

create or replace function public.prevent_system_template_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if old.is_system = true
     and auth.role() is distinct from 'service_role'
     and old.user_id is distinct from auth.uid()
     and public.current_user_role_text() is distinct from 'admin'
     and public.current_user_role_text() is distinct from 'general' then
    raise exception 'Solo quien creó la plantilla del sistema, un admin o un general puede borrarla';
  end if;
  return old;
end;
$$;

create or replace function public.prevent_system_template_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if old.is_system = true and new.deleted_at is not null and old.deleted_at is null
     and auth.role() is distinct from 'service_role'
     and old.user_id is distinct from auth.uid()
     and public.current_user_role_text() is distinct from 'admin'
     and public.current_user_role_text() is distinct from 'general' then
    raise exception 'Solo quien creó la plantilla del sistema, un admin o un general puede borrarla';
  end if;
  return new;
end;
$$;
