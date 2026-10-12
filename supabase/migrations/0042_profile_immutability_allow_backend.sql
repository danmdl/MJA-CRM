-- enforce_profile_self_update_immutability only lets admin/general change
-- profiles.role / church_id / numero_cuerda, deciding by auth.uid(). The
-- Equipo panel changes those through the admin-user-actions-v3 edge
-- function, which uses the service key, so auth.uid() is null there and
-- every role or cuerda change was rejected ("profiles.numero_cuerda can
-- only be changed by admin/general") even for admins. The edge function
-- authorizes the caller itself (permissions table + canManageTarget), so
-- trust service_role; direct client updates are still guarded as before.

create or replace function public.enforce_profile_self_update_immutability()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  declare
    caller_role text;
  begin
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    select role::text into caller_role from profiles where id = auth.uid();
    if caller_role in ('admin','general') then
      return new;
    end if;
    if new.role is distinct from old.role then
      raise exception 'profiles.role can only be changed by admin/general'
        using errcode = 'insufficient_privilege';
    end if;
    if new.church_id is distinct from old.church_id then
      raise exception 'profiles.church_id can only be changed by admin/general'
        using errcode = 'insufficient_privilege';
    end if;
    if new.numero_cuerda is distinct from old.numero_cuerda then
      raise exception 'profiles.numero_cuerda can only be changed by admin/general'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end;
$function$;
