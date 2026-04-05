-- Update RLS on whatsapp_templates so system templates are globally visible.
-- - SELECT: anyone can read system templates; otherwise own templates only
-- - UPDATE / DELETE: owner OR admin

DROP POLICY IF EXISTS templates_select ON whatsapp_templates;
CREATE POLICY templates_select ON whatsapp_templates
  FOR SELECT
  USING (user_id = auth.uid() OR is_system = true);

DROP POLICY IF EXISTS templates_update ON whatsapp_templates;
CREATE POLICY templates_update ON whatsapp_templates
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (SELECT role::text FROM profiles WHERE id = auth.uid()) = 'admin'
  );

DROP POLICY IF EXISTS templates_delete ON whatsapp_templates;
CREATE POLICY templates_delete ON whatsapp_templates
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (SELECT role::text FROM profiles WHERE id = auth.uid()) = 'admin'
  );
