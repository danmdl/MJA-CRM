-- Conector field normalization: Title Case + no accents.
--
-- Problem: free-text conector field accumulated grafías inconsistentes —
-- "guillermina" / "GUILLERMINA", "Pamela rodríguez" / "Pamela Rodriguez" /
-- "Pamela Rodríguez", "Camila Próspero". The Semillero filter dropdown
-- listed each variant as a separate entry, fragmenting what's the same
-- person. Tildes and case made it worse.
--
-- Solution:
--   1. normalize_conector(text) function: strips diacritics via unaccent(),
--      collapses whitespace, Title-Cases each word. NULL → NULL, empty → NULL.
--   2. BEFORE INSERT trigger fires the function on every new row.
--   3. BEFORE UPDATE OF conector trigger fires only when the column
--      actually changes — saves cycles on unrelated column updates.
--   4. Backfill: UPDATE every existing row's conector through the function.
--      Brought the distinct count from 44 → 31, killed all 8 rows with
--      diacritics.
--
-- Frontend mirrors this with normalizeName() in src/lib/normalize.ts so the
-- input shows the cleaned form on blur, before save.

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION normalize_conector(input text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  WITH cleaned AS (
    SELECT NULLIF(
      REGEXP_REPLACE(unaccent(TRIM(input)), '\s+', ' ', 'g'),
      ''
    ) AS s
  ),
  words AS (
    SELECT array_agg(
      UPPER(LEFT(w, 1)) || LOWER(SUBSTRING(w, 2))
      ORDER BY ord
    ) AS arr
    FROM cleaned, unnest(string_to_array(cleaned.s, ' ')) WITH ORDINALITY AS t(w, ord)
    WHERE cleaned.s IS NOT NULL
  )
  SELECT array_to_string(arr, ' ') FROM words;
$$;

CREATE OR REPLACE FUNCTION normalize_conector_trigger() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.conector := normalize_conector(NEW.conector);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_conector_on_insert ON contacts;
CREATE TRIGGER normalize_conector_on_insert
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION normalize_conector_trigger();

DROP TRIGGER IF EXISTS normalize_conector_on_update ON contacts;
CREATE TRIGGER normalize_conector_on_update
  BEFORE UPDATE OF conector ON contacts
  FOR EACH ROW
  WHEN (OLD.conector IS DISTINCT FROM NEW.conector)
  EXECUTE FUNCTION normalize_conector_trigger();

UPDATE contacts
SET conector = normalize_conector(conector)
WHERE conector IS NOT NULL
  AND deleted_at IS NULL
  AND conector IS DISTINCT FROM normalize_conector(conector);
