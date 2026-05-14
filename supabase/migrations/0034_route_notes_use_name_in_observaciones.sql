-- Use the route's NAME instead of its 6-char short id when stamping
-- contacts.observaciones from per-stop route notes.
--
-- Before this migration the trigger from 0026 wrote lines like:
--   [Ruta dc6a97 · 2026-05-13] no se encontraba
-- which Dan reported is unreadable in the contact's profile — the
-- 'dc6a97' is the first 6 chars of the route UUID. He asked for the
-- route's actual name to appear there:
--   [Ruta Mauro 11/4 a 16/4 (dc6a97) · 2026-05-13] no se encontraba
--
-- The short_id stays in parens at the end as a STABLE marker the strip
-- regex can use to identify lines that belong to this route. We can't
-- use the name as the marker because (a) names can change and (b) two
-- routes can share a name; the short_id is unique and doesn't move.
--
-- Backwards compat: the strip regex now matches BOTH the new format
-- ([Ruta ... (short_id) ...]) AND the legacy format ([Ruta short_id ...])
-- so old observaciones lines get cleaned up the next time the user
-- saves a note on the same route, instead of accumulating dupes.
--
-- Name length is capped at 40 chars + ellipsis to keep observaciones
-- readable when someone names a route 'Ruta del barrio sur con todos
-- los nuevos del semillero del lunes pasado'.

CREATE OR REPLACE FUNCTION sync_route_contact_notes_to_observaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  contact_id_key text;
  note_obj jsonb;
  old_obj jsonb;
  note_text text;
  note_date text;
  short_id text;
  route_label text;
  prefix text;
  new_line text;
  cleaned text;
BEGIN
  IF NEW.contact_notes IS NOT DISTINCT FROM OLD.contact_notes THEN
    RETURN NEW;
  END IF;

  short_id := substring(NEW.id::text FROM 1 FOR 6);
  -- Pick the human-readable name the user typed in 'Nuevo proyecto',
  -- trimmed and length-capped. Fall back to the short_id when a route
  -- somehow has no name (NULL or whitespace-only) so we never write
  -- "[Ruta ()]".
  route_label := COALESCE(NULLIF(trim(NEW.name), ''), short_id);
  IF length(route_label) > 40 THEN
    route_label := substring(route_label FROM 1 FOR 40) || '…';
  END IF;

  FOR contact_id_key, note_obj IN
    SELECT key, value FROM jsonb_each(
      COALESCE(NEW.contact_notes, '{}'::jsonb) ||
      COALESCE(OLD.contact_notes, '{}'::jsonb)
    )
  LOOP
    note_obj := COALESCE(NEW.contact_notes -> contact_id_key, '{}'::jsonb);
    old_obj := COALESCE(OLD.contact_notes -> contact_id_key, '{}'::jsonb);

    IF note_obj IS NOT DISTINCT FROM old_obj THEN
      CONTINUE;
    END IF;

    note_text := trim(COALESCE(note_obj->>'text', ''));
    note_date := COALESCE(NULLIF(note_obj->>'date', ''), to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'));
    prefix := '[Ruta ' || route_label || ' (' || short_id || ') · ' || note_date || ']';

    SELECT observaciones INTO cleaned FROM contacts WHERE id = contact_id_key::uuid;
    cleaned := COALESCE(cleaned, '');
    -- Strip prior lines that belong to THIS route. Two patterns:
    --   1. New format: any [Ruta ... (short_id) ...] line.
    --   2. Legacy format from migration 0026: [Ruta short_id ...] line.
    -- Both consume to end-of-line so we drop the whole stamped entry.
    -- short_id is hex so it doesn't need regex escaping.
    cleaned := regexp_replace(
      cleaned,
      '(^|\n)\[Ruta [^\n]*\(' || short_id || '\)[^\n]*',
      '',
      'g'
    );
    cleaned := regexp_replace(
      cleaned,
      '(^|\n)\[Ruta ' || short_id || ' [^\n]*',
      '',
      'g'
    );
    cleaned := regexp_replace(cleaned, '^\s+', '');
    cleaned := regexp_replace(cleaned, '\s+$', '');

    IF note_text = '' THEN
      UPDATE contacts SET observaciones = NULLIF(cleaned, '') WHERE id = contact_id_key::uuid;
    ELSE
      new_line := prefix || ' ' || note_text;
      IF cleaned = '' THEN
        UPDATE contacts SET observaciones = new_line WHERE id = contact_id_key::uuid;
      ELSE
        UPDATE contacts SET observaciones = cleaned || E'\n' || new_line WHERE id = contact_id_key::uuid;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
