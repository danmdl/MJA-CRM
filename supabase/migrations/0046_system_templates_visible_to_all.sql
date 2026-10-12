-- System templates are for everyone: any signed-in user (conectores,
-- consolidadores, encargados... too) can read and use them, even without
-- the can_use_templates permission. Personal templates still need it.
-- Soft-deleted system templates stay visible only to who can manage them.

alter policy templates_select on public.whatsapp_templates
  using (
    (
      is_system = true
      and (
        deleted_at is null
        or user_id = (select auth.uid())
        or (select public.current_user_role_text()) in ('admin', 'general')
      )
    )
    or (current_user_can_use_templates() and user_id = (select auth.uid()))
  );
