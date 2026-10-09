-- messages_select_v2 read message_recipients and recipients_select_simple
-- read messages, so evaluating either policy re-entered the other:
-- "infinite recursion detected in policy for relation messages" (HTTP 500
-- on every inbox / notification-bell query). The cross-table checks move
-- into SECURITY DEFINER helpers that bypass RLS; who can see what is
-- unchanged (verified per-user against the previous rules).

create or replace function public.is_message_sender(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message_id and m.sender_id = auth.uid()
  );
$$;

create or replace function public.is_message_recipient(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.message_recipients r
    where r.message_id = p_message_id and r.recipient_id = auth.uid()
  );
$$;

revoke all on function public.is_message_sender(uuid) from public, anon;
revoke all on function public.is_message_recipient(uuid) from public, anon;
grant execute on function public.is_message_sender(uuid) to authenticated;
grant execute on function public.is_message_recipient(uuid) to authenticated;

alter policy messages_select_v2 on public.messages
  using (
    sender_id = (select auth.uid())
    or public.is_message_recipient(id)
    or (
      church_id is not null
      and church_id in (select p.church_id from public.profiles p where p.id = (select auth.uid()))
    )
  );

alter policy recipients_select_simple on public.message_recipients
  using (
    recipient_id = (select auth.uid())
    or public.is_message_sender(message_id)
  );

alter policy recipients_insert_by_sender on public.message_recipients
  with check (public.is_message_sender(message_id));
