-- Default fecha_contacto on inserts when not supplied.
--
-- Problem: every insert path (AddContactDialog, CsvImporter, etc.) has to
-- remember to populate fecha_contacto, and any path that forgets ends up
-- with NULL. 78 live rows had NULL when this was added — visible in the
-- Semillero as the "—" placeholder in the Fecha column.
--
-- Solution: BEFORE INSERT trigger that fills NEW.fecha_contacto from
-- NEW.created_at (or NOW() as a safety belt) when the input row didn't
-- supply one. Everything that hits the contacts table — UI, CSV, edge
-- functions, raw PostgREST — gets the default for free. Existing rows
-- backfilled with their own created_at::date.

CREATE OR REPLACE FUNCTION default_contact_fecha_contacto()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.fecha_contacto IS NULL THEN
    NEW.fecha_contacto := COALESCE(NEW.created_at, NOW())::date;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS default_contact_fecha_contacto_trigger ON contacts;
CREATE TRIGGER default_contact_fecha_contacto_trigger
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION default_contact_fecha_contacto();

UPDATE contacts
SET fecha_contacto = created_at::date
WHERE fecha_contacto IS NULL AND deleted_at IS NULL;
