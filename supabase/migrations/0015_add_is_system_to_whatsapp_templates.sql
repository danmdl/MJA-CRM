-- Add is_system flag to whatsapp_templates to mark protected system templates.
-- System templates cannot be deleted (hard or soft) by any user.
-- Enforced at the DB level via BEFORE DELETE and BEFORE UPDATE triggers.

ALTER TABLE whatsapp_templates
ADD COLUMN is_system boolean NOT NULL DEFAULT false;

-- Mark the "Ejemplo" template as a system template
UPDATE whatsapp_templates
SET is_system = true
WHERE id = '08de9907-59a4-4d95-b32c-7e2c90991c3b';

-- Prevent hard deletes of system templates
CREATE OR REPLACE FUNCTION prevent_system_template_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true THEN
    RAISE EXCEPTION 'System templates cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_system_template_delete
BEFORE DELETE ON whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION prevent_system_template_delete();

-- Prevent soft deletes (setting deleted_at) of system templates
CREATE OR REPLACE FUNCTION prevent_system_template_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = true AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    RAISE EXCEPTION 'System templates cannot be deleted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_system_template_soft_delete
BEFORE UPDATE ON whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION prevent_system_template_soft_delete();
