-- "Contactar a soporte" from the Ayuda page. Any signed-in user can send,
-- whatever their role's messaging permissions; it lands in every admin's
-- Mensajes inbox (with the usual bell / login notification).
-- SECURITY DEFINER so it doesn't depend on messages / message_recipients
-- insert policies. Capped at 10 per user per hour to stop accidental spam.

create or replace function public.send_support_message(
  p_body text,
  p_kind text default null,
  p_page text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_kind text := nullif(btrim(coalesce(p_kind, '')), '');
  v_page text := nullif(btrim(coalesce(p_page, '')), '');
  v_church uuid;
  v_role text;
  v_msg uuid;
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión';
  end if;
  if v_body = '' then
    raise exception 'Escribí tu mensaje';
  end if;
  if length(v_body) > 4000 then
    raise exception 'El mensaje es demasiado largo (máximo 4000 caracteres)';
  end if;
  if (select count(*) from messages
      where sender_id = v_uid and body like '[SOPORTE%'
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Mandaste muchos mensajes a soporte en la última hora. Probá más tarde.';
  end if;

  select church_id, role::text into v_church, v_role from profiles where id = v_uid;

  insert into messages (sender_id, church_id, body)
  values (
    v_uid,
    v_church,
    '[SOPORTE' || coalesce(' · ' || left(v_kind, 40), '') || '] ' || v_body
      || E'\n\n— Rol: ' || coalesce(v_role, '?')
      || coalesce(E'\n— Página: ' || left(v_page, 200), '')
  )
  returning id into v_msg;

  insert into message_recipients (message_id, recipient_id)
  select v_msg, p.id from profiles p where p.role = 'admin' and p.id <> v_uid;

  return v_msg;
end;
$$;

revoke all on function public.send_support_message(text, text, text) from public, anon;
grant execute on function public.send_support_message(text, text, text) to authenticated;
