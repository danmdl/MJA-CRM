-- Per-stop notes on shared routes, with automatic sync to
-- contacts.observaciones.
--
-- Until now `shared_routes.notes` was a single textarea applied to the
-- whole route. Dan reported the workflow is actually per-contact:
-- "que esas notas sean individuales para cada visita. Y que también,
-- eso que se ponga ahí, cualquier cosa que se note, tiene que aparecer
-- automáticamente en el perfil de cada contacto en la zona de
-- observaciones."
--
-- Storage shape: contact_notes JSONB →
--   { "<contact_uuid>": { "text": "...", "date": "YYYY-MM-DD" } }
-- One entry per stop. The route's general `notes` field stays where it
-- is for route-wide remarks (we're not deleting it, just stopping using
-- it as the per-stop store).
--
-- Sync to contacts.observaciones: a trigger runs on UPDATE of
-- contact_notes. For each contact whose entry changed, it rewrites a
-- single line in observaciones tagged with the route's short id so
-- subsequent edits update the same line instead of duplicating it. The
-- short id (first 6 chars of the route UUID) is short, recognizable,
-- and what a human reading the observation can use to trace back.
--
-- Idempotency: the line is identified by the prefix
--   [Ruta <short_id> · YYYY-MM-DD]
-- A regexp matching that prefix is stripped before the new line is
-- appended, so saving the same note ten times still leaves one line
-- in observaciones. Different routes contribute different short_ids
-- and don't collide.
--
-- SECURITY DEFINER: the public route viewer is unauthenticated. The
-- trigger needs to write to contacts (which has tight RLS) regardless
-- of who's editing the route, so the function runs as the table owner.

ALTER TABLE shared_routes
ADD COLUMN IF NOT EXISTS contact_notes JSONB NOT NULL DEFAULT '{}'::jsonb;

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
  prefix text;
  new_line text;
  cleaned text;
BEGIN
  -- No-op when contact_notes didn't actually change.
  IF NEW.contact_notes IS NOT DISTINCT FROM OLD.contact_notes THEN
    RETURN NEW;
  END IF;

  short_id := substring(NEW.id::text FROM 1 FOR 6);

  -- Walk every contact entry currently in NEW.contact_notes plus any
  -- that existed in OLD but were removed in NEW (so deleting a note
  -- also cleans its line from observaciones).
  FOR contact_id_key, note_obj IN
    SELECT key, value FROM jsonb_each(
      COALESCE(NEW.contact_notes, '{}'::jsonb) ||
      COALESCE(OLD.contact_notes, '{}'::jsonb)
    )
  LOOP
    -- Use the NEW value if present, otherwise treat the entry as deleted.
    note_obj := COALESCE(NEW.contact_notes -> contact_id_key, '{}'::jsonb);
    old_obj := COALESCE(OLD.contact_notes -> contact_id_key, '{}'::jsonb);

    -- Skip when this contact's entry didn't change between OLD and NEW.
    IF note_obj IS NOT DISTINCT FROM old_obj THEN
      CONTINUE;
    END IF;

    note_text := trim(COALESCE(note_obj->>'text', ''));
    note_date := COALESCE(NULLIF(note_obj->>'date', ''), to_char(now() AT TIME ZONE 'America/Argentina/Buenos_Aires', 'YYYY-MM-DD'));
    prefix := '[Ruta ' || short_id || ' · ' || note_date || ']';

    -- Strip ANY prior line that this same route owns for this contact,
    -- regardless of the date tagged on it. That way editing a note on
    -- Tuesday after writing it on Monday replaces the Monday line, not
    -- accumulates a second entry.
    SELECT observaciones INTO cleaned FROM contacts WHERE id = contact_id_key::uuid;
    cleaned := COALESCE(cleaned, '');
    cleaned := regexp_replace(
      cleaned,
      '(^|\n)\[Ruta ' || short_id || ' [^\n]*',
      '',
      'g'
    );
    cleaned := regexp_replace(cleaned, '^\s+', '');
    cleaned := regexp_replace(cleaned, '\s+$', '');

    IF note_text = '' THEN
      -- Entry was cleared. Leave observaciones with just the cleanup.
      UPDATE contacts
      SET observaciones = NULLIF(cleaned, '')
      WHERE id = contact_id_key::uuid;
    ELSE
      new_line := prefix || ' ' || note_text;
      IF cleaned = '' THEN
        UPDATE contacts
        SET observaciones = new_line
        WHERE id = contact_id_key::uuid;
      ELSE
        UPDATE contacts
        SET observaciones = cleaned || E'\n' || new_line
        WHERE id = contact_id_key::uuid;
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_route_contact_notes ON shared_routes;
CREATE TRIGGER sync_route_contact_notes
AFTER UPDATE OF contact_notes ON shared_routes
FOR EACH ROW
EXECUTE FUNCTION sync_route_contact_notes_to_observaciones();
