-- Allow admins to delete system templates; block everyone else.
-- System templates are global (visible to all users), so protecting them at
-- the DB level prevents accidental deletion via direct SQL or compromised client.

CREATE OR REPLACE FUNCTION prevent_system_template_delete()
RETURNS TRIGGER AS $$
DECLARE
  caller_role text;
BEGIN
  IF OLD.is_system = true THEN
    SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can delete system templates';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION prevent_system_template_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
  caller_role text;
BEGIN
  IF OLD.is_system = true AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT role::text INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only admins can delete system templates';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
