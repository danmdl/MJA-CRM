-- Strip punctuation-only / whitespace-only values from text columns.
--
-- Background: legacy CSV imports stored junk values like ".", ", ,", ". ."
-- into address/barrio/etc. The "sin dirección" filter and the Semillero
-- inbox breakdown both relied on a truthy check, so those rows were
-- mis-classified as having content. The importer is now fixed (see
-- src/lib/csv-import-engine.ts:sanitizeValue and the inline copy in
-- src/components/admin/CsvImporter.tsx) to null out any value that
-- contains no letters or digits. This migration applies the same rule
-- retroactively to rows already in the database.
--
-- Rule mirrored from sanitizeValue:
--   trim the value, then if it contains no Unicode letter and no digit,
--   replace it with NULL.
--
-- Postgres regex: \w in default locale matches [A-Za-z0-9_], but with
-- the standard regex_flavor it does NOT match accented letters. We use
-- a character class that covers ASCII letters/digits plus the Spanish
-- accented letters and ñ, which is enough for our data.

UPDATE contacts
SET address = NULL
WHERE address IS NOT NULL
  AND btrim(address) !~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]';

UPDATE contacts
SET barrio = NULL
WHERE barrio IS NOT NULL
  AND btrim(barrio) !~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]';

UPDATE contacts
SET apartment_number = NULL
WHERE apartment_number IS NOT NULL
  AND btrim(apartment_number) !~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]';

UPDATE contacts
SET conector = NULL
WHERE conector IS NOT NULL
  AND btrim(conector) !~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]';
