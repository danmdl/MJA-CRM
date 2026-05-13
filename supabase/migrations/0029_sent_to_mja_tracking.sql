-- Reverse direction tracking: when a non-MJA user (regular referente,
-- etc.) reassigns a contact INTO an MJA-side cuerda (is_church_cuerda
-- = true). Dan asked for "viceversa": MJA users should also get the
-- locked tab + login toast for contacts that came UP from regular
-- cuerdas, the same way regular cuerdas get the badge for contacts
-- assigned DOWN by MJA.
--
-- Two parallel columns mirror the forward-direction ones added in
-- migration 0028:
--
--   sent_to_mja_at      timestamptz — when a non-MJA user reassigned
--                       the contact to an MJA-side cuerda.
--   sent_to_mja_seen_at timestamptz — cleared every time a fresh
--                       assignment fires; updated when the receiving
--                       MJA cuerda clicks the locked tab in the
--                       Semillero.
--
-- The existing trigger now branches on direction so a single function
-- handles both: assigner-is-MJA → received_from_mja_at, receiver-is-MJA
-- → sent_to_mja_at. MJA→MJA shuffles and non-MJA→non-MJA assignments
-- still skip both columns.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS sent_to_mja_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_mja_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS contacts_sent_to_mja_at_idx
  ON contacts (church_id, numero_cuerda, sent_to_mja_at)
  WHERE sent_to_mja_at IS NOT NULL;

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
  IF NEW.numero_cuerda IS NOT DISTINCT FROM OLD.numero_cuerda THEN
    RETURN NEW;
  END IF;

  assigner_id := auth.uid();
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
    WHERE c.numero = assigner_cuerda AND c.is_church_cuerda = true
  ) INTO assigner_is_mja;

  SELECT EXISTS (
    SELECT 1 FROM cuerdas c
    WHERE c.numero = NEW.numero_cuerda AND c.is_church_cuerda = true
  ) INTO receiver_is_mja;

  -- MJA-side user → non-MJA cuerda. Forward direction. The receiving
  -- referente's "Recibidos de MJA" tab will badge this contact.
  IF assigner_is_mja AND NOT receiver_is_mja THEN
    NEW.received_from_mja_at := now();
    NEW.received_from_mja_seen_at := NULL;
    -- Don't carry over the reverse flag if this contact previously
    -- went the other way.
    NEW.sent_to_mja_at := NULL;
    NEW.sent_to_mja_seen_at := NULL;
    RETURN NEW;
  END IF;

  -- Non-MJA user → MJA cuerda. Reverse direction. The MJA-side
  -- referente's locked tab will badge this contact.
  IF NOT assigner_is_mja AND receiver_is_mja THEN
    NEW.sent_to_mja_at := now();
    NEW.sent_to_mja_seen_at := NULL;
    NEW.received_from_mja_at := NULL;
    NEW.received_from_mja_seen_at := NULL;
    RETURN NEW;
  END IF;

  -- Same-side shuffles (MJA→MJA or non-MJA→non-MJA): no flag.
  RETURN NEW;
END;
$$;

-- Trigger re-attached to pick up the updated body.
DROP TRIGGER IF EXISTS mark_received_from_mja ON contacts;
CREATE TRIGGER mark_received_from_mja
BEFORE UPDATE OF numero_cuerda ON contacts
FOR EACH ROW
EXECUTE FUNCTION mark_contact_received_from_mja();

-- Back-fill the reverse direction from contact_transfers.
UPDATE contacts c
SET sent_to_mja_at = t.created_at,
    sent_to_mja_seen_at = NULL
FROM (
  SELECT DISTINCT ON (ct.contact_id)
    ct.contact_id,
    ct.created_at
  FROM contact_transfers ct
  JOIN profiles p ON p.id = ct.transferred_by
  LEFT JOIN cuerdas cu_assigner ON cu_assigner.numero = p.numero_cuerda
  WHERE ct.to_cuerda IN (SELECT numero FROM cuerdas WHERE is_church_cuerda = true)
    AND (cu_assigner.is_church_cuerda IS NULL OR cu_assigner.is_church_cuerda = false)
  ORDER BY ct.contact_id, ct.created_at DESC
) t
WHERE c.id = t.contact_id
  AND c.deleted_at IS NULL
  AND c.sent_to_mja_at IS NULL;

-- Unified mark-seen RPC: handles both directions in one call.
-- Called when the user clicks the locked tab in the Semillero.
-- Whichever direction is populated for contacts in the caller's
-- cuerda gets cleared.
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

  IF NOT caller_is_global AND (caller_cuerda IS NULL OR caller_cuerda <> p_cuerda) THEN
    RAISE EXCEPTION 'No autorizado para marcar contactos de la cuerda %', p_cuerda;
  END IF;

  WITH updated AS (
    UPDATE contacts
    SET received_from_mja_seen_at = COALESCE(received_from_mja_seen_at, CASE WHEN received_from_mja_at IS NOT NULL THEN now() END),
        sent_to_mja_seen_at = COALESCE(sent_to_mja_seen_at, CASE WHEN sent_to_mja_at IS NOT NULL THEN now() END)
    WHERE church_id = p_church_id
      AND numero_cuerda = p_cuerda
      AND deleted_at IS NULL
      AND (
        (received_from_mja_at IS NOT NULL AND received_from_mja_seen_at IS NULL)
        OR (sent_to_mja_at IS NOT NULL AND sent_to_mja_seen_at IS NULL)
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM updated;
  RETURN affected;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_mja_contacts_seen(uuid, text) TO authenticated;
