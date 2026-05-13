-- Track when a contact is received from an "MJA-side" cuerda.
--
-- Definition: an MJA-side cuerda is any cuerda flagged as
-- is_church_cuerda=true. As of writing the four are MJA Central, MJA
-- CABA, MJA Moreno, and Puerta 8 (one per iglesia, plus MJA Central
-- itself). When a user belonging to one of those cuerdas reassigns a
-- contact to a *different* cuerda (i.e. a regular field cuerda like
-- 104, 207, etc.), the receiving cuerda needs a way to notice the new
-- arrival. Two columns on contacts handle that:
--
--   received_from_mja_at      timestamptz — when the MJA-side user
--                             reassigned the contact. Set by the
--                             trigger below on every qualifying
--                             cuerda change.
--
--   received_from_mja_seen_at timestamptz — when someone from the
--                             receiving cuerda clicked the "Recibidos
--                             de MJA" tab in the Semillero. Cleared
--                             every time a fresh MJA assignment lands
--                             so the badge re-appears. The UI
--                             considers a contact "unseen" when
--                             received_from_mja_at > received_from_mja_seen_at
--                             OR received_from_mja_seen_at IS NULL.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS received_from_mja_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_from_mja_seen_at TIMESTAMPTZ;

-- Index supports the "where received_from_mja_at IS NOT NULL"
-- scan that the Semillero badge + filter run every render.
CREATE INDEX IF NOT EXISTS contacts_received_from_mja_at_idx
  ON contacts (church_id, numero_cuerda, received_from_mja_at)
  WHERE received_from_mja_at IS NOT NULL;

CREATE OR REPLACE FUNCTION mark_contact_received_from_mja()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigner_id uuid;
  assigner_cuerda text;
  assigner_is_mja bool := false;
  receiver_is_mja bool := false;
BEGIN
  -- Only react when the cuerda actually changed.
  IF NEW.numero_cuerda IS NOT DISTINCT FROM OLD.numero_cuerda THEN
    RETURN NEW;
  END IF;

  assigner_id := auth.uid();
  -- System / service-role updates (CSV import, scripts) don't have an
  -- authenticated user. Skip so the flag stays a strictly MJA-user
  -- signal instead of an "anything that touched the row" signal.
  IF assigner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.numero_cuerda INTO assigner_cuerda
  FROM profiles p WHERE p.id = assigner_id;
  IF assigner_cuerda IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM cuerdas c
    WHERE c.numero = assigner_cuerda
      AND c.is_church_cuerda = true
  ) INTO assigner_is_mja;

  IF NOT assigner_is_mja THEN
    RETURN NEW;
  END IF;

  -- Receiver also being an MJA cuerda → MJA→MJA shuffle, don't flag
  -- (the receiving "cuerda" is itself an MJA pool, no one would be
  -- expecting a "new contact" notification on those tabs).
  SELECT EXISTS (
    SELECT 1 FROM cuerdas c
    WHERE c.numero = NEW.numero_cuerda
      AND c.is_church_cuerda = true
  ) INTO receiver_is_mja;

  IF receiver_is_mja THEN
    NEW.received_from_mja_at := NULL;
    NEW.received_from_mja_seen_at := NULL;
    RETURN NEW;
  END IF;

  NEW.received_from_mja_at := now();
  -- New arrival → unseen. Resetting seen_at every time a fresh MJA
  -- assignment hits is intentional: if MJA reassigns a contact a
  -- second time after the cuerda had already "seen" the first
  -- arrival, the badge should reappear.
  NEW.received_from_mja_seen_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_received_from_mja ON contacts;
CREATE TRIGGER mark_received_from_mja
BEFORE UPDATE OF numero_cuerda ON contacts
FOR EACH ROW
EXECUTE FUNCTION mark_contact_received_from_mja();

-- Back-fill from existing transfer history. We can't replay through
-- the trigger (no auth.uid in this context), but we can look at the
-- contact_transfers table and stamp received_from_mja_at to the
-- timestamp of the most recent transfer made by an MJA-cuerda user.
-- All such back-filled contacts start unseen so the Semillero badge
-- surfaces work that was already done before this column existed.

UPDATE contacts c
SET received_from_mja_at = t.created_at,
    received_from_mja_seen_at = NULL
FROM (
  SELECT DISTINCT ON (ct.contact_id)
    ct.contact_id,
    ct.created_at
  FROM contact_transfers ct
  JOIN profiles p ON p.id = ct.transferred_by
  JOIN cuerdas cu ON cu.numero = p.numero_cuerda
  WHERE cu.is_church_cuerda = true
    AND ct.to_cuerda IS NOT NULL
    AND ct.to_cuerda NOT IN (
      SELECT numero FROM cuerdas WHERE is_church_cuerda = true
    )
  ORDER BY ct.contact_id, ct.created_at DESC
) t
WHERE c.id = t.contact_id
  AND c.deleted_at IS NULL
  -- Don't overwrite if the new trigger already set this on a recent
  -- assignment (shouldn't happen in the back-fill since the trigger
  -- only fired AFTER this migration, but defensive).
  AND c.received_from_mja_at IS NULL;

-- Helper RPC: bulk-mark a set of contacts in the user's cuerda as
-- "seen" by the receiving cuerda. Called by the Semillero when the
-- user clicks the "Recibidos de MJA" tab; clears the unseen badge in
-- one round-trip. RLS rules below restrict it to contacts the caller
-- has read access to.
CREATE OR REPLACE FUNCTION mark_mja_contacts_seen(p_church_id uuid, p_cuerda text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_cuerda text;
  caller_is_global bool;
  affected integer;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'No authenticated user';
  END IF;

  SELECT p.numero_cuerda,
         p.role IN ('admin','general','pastor','supervisor')
    INTO caller_cuerda, caller_is_global
  FROM profiles p WHERE p.id = caller_id;

  -- Only allow marking seen on contacts the caller is responsible for:
  -- either they're in the cuerda being marked (referente / encargado),
  -- or they have a global role.
  IF NOT caller_is_global AND (caller_cuerda IS NULL OR caller_cuerda <> p_cuerda) THEN
    RAISE EXCEPTION 'No autorizado para marcar contactos de la cuerda %', p_cuerda;
  END IF;

  UPDATE contacts
  SET received_from_mja_seen_at = now()
  WHERE church_id = p_church_id
    AND numero_cuerda = p_cuerda
    AND deleted_at IS NULL
    AND received_from_mja_at IS NOT NULL
    AND received_from_mja_seen_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_mja_contacts_seen(uuid, text) TO authenticated;
