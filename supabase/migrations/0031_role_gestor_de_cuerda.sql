-- New role: gestor_de_cuerda.
--
-- Sits in the hierarchy between encargado_de_celula and referente,
-- with the same permission grants as referente — the difference is
-- purely organizational so the iglesia can tell "the referente in
-- charge" from "the gestor helping out".
--
--   anfitrion < conector < consolidador < encargado_de_celula
--             < gestor_de_cuerda < referente
--             < supervisor < pastor < general < admin

-- 0. Add the value to the user_role enum. Postgres requires this in
--    its own transaction, separate from any DML that uses the new
--    value, so we keep it as a top-level statement here. AFTER places
--    the new value right after encargado_de_celula to reflect the
--    hierarchy ordering.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'gestor_de_cuerda' AFTER 'encargado_de_celula';

-- 1. Permissions row: copy every column value from referente.
--    ON CONFLICT keeps this idempotent if an admin later tweaks the
--    permissions table by hand and re-runs the migration.
INSERT INTO permissions (
  role,
  see_all_churches, access_all_churches, add_users, edit_delete_users,
  see_all_analytics, see_own_church_analytics, change_user_role, add_members, add_contacts,
  edit_delete_contacts, edit_delete_members, base_datos_total, can_see_pool, can_edit_cuerda,
  can_see_celulas, can_edit_celulas, can_see_historial, can_send_messages, can_restore_deleted,
  can_import_csv, can_assign_contacts, can_see_cuerdas, can_edit_cuerdas, can_send_whatsapp,
  can_use_templates, can_see_mapa, can_see_validador, can_see_papelera, can_see_procesos,
  can_auto_assign, can_filter_all_contacts, can_see_asistencia, can_see_eventos, can_see_rutas
)
SELECT
  'gestor_de_cuerda',
  see_all_churches, access_all_churches, add_users, edit_delete_users,
  see_all_analytics, see_own_church_analytics, change_user_role, add_members, add_contacts,
  edit_delete_contacts, edit_delete_members, base_datos_total, can_see_pool, can_edit_cuerda,
  can_see_celulas, can_edit_celulas, can_see_historial, can_send_messages, can_restore_deleted,
  can_import_csv, can_assign_contacts, can_see_cuerdas, can_edit_cuerdas, can_send_whatsapp,
  can_use_templates, can_see_mapa, can_see_validador, can_see_papelera, can_see_procesos,
  can_auto_assign, can_filter_all_contacts, can_see_asistencia, can_see_eventos, can_see_rutas
FROM permissions
WHERE role = 'referente'
ON CONFLICT (role) DO NOTHING;

-- 2. RLS: re-declare every policy that whitelists 'referente' so the
--    new role gets the same access. Policies created in migration
--    0030 hardcoded the role IN (...) list; updating them in place
--    here is safer than ALTER POLICY (which can't change USING
--    clauses cleanly).

DROP POLICY IF EXISTS attendance_events_insert ON attendance_events;
CREATE POLICY attendance_events_insert ON attendance_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin','general')
          OR (p.church_id = attendance_events.church_id
              AND p.role IN ('pastor','supervisor','referente','gestor_de_cuerda','encargado_de_celula','consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS attendance_events_update ON attendance_events;
CREATE POLICY attendance_events_update ON attendance_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin','general')
          OR (p.church_id = attendance_events.church_id
              AND p.role IN ('pastor','supervisor','referente','gestor_de_cuerda','encargado_de_celula','consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_insert ON contact_attendance;
CREATE POLICY contact_attendance_insert ON contact_attendance
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin','general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor','supervisor','referente','gestor_de_cuerda','encargado_de_celula','consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_update ON contact_attendance;
CREATE POLICY contact_attendance_update ON contact_attendance
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin','general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor','supervisor','referente','gestor_de_cuerda','encargado_de_celula','consolidador'))
        )
    )
  );

DROP POLICY IF EXISTS contact_attendance_delete ON contact_attendance;
CREATE POLICY contact_attendance_delete ON contact_attendance
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM attendance_events e
      JOIN profiles p ON p.id = auth.uid()
      WHERE e.id = contact_attendance.event_id
        AND (
          p.role IN ('admin','general')
          OR (p.church_id = e.church_id
              AND p.role IN ('pastor','supervisor','referente','gestor_de_cuerda','encargado_de_celula','consolidador'))
        )
    )
  );
