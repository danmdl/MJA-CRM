-- Back-fill barrio from legacy address strings.
--
-- Sample of real data shows a consistent pattern: when address contains a
-- comma, the part after the first comma is the barrio. Examples:
--   "Argerich 5796, V. Puyrredon"          → V. Puyrredon
--   "Maipu 2495, Villa Maipu"              → Villa Maipu
--   "Las magnolias 7067, Loma Hermosa"     → Loma Hermosa
--   "Padre Mujica 1124, General San Martín, Buenos Aires" → General San Martín
--
-- Rule: barrio = trim(split_part(address, ',', 2)) when:
--   - the contact is alive
--   - address has at least one comma
--   - barrio is currently NULL or empty
--   - the resulting candidate has letters/digits (skips ". ," junk)
--   - the candidate isn't a province / country tail (Buenos Aires, BsAs,
--     Argentina, AR, CABA) — those land in the 3rd segment in our data
--     and shouldn't pollute the barrio column.
--
-- For new contacts going forward, AddressAutocomplete pulls the barrio
-- from Google Places address_components (neighborhood / sublocality_level_1).
-- This migration is the one-time catch-up for the ~3200 rows that were
-- imported before that flow existed.

UPDATE contacts
SET barrio = trim(split_part(address, ',', 2))
WHERE deleted_at IS NULL
  AND address IS NOT NULL
  AND position(',' IN address) > 0
  AND (barrio IS NULL OR barrio = '')
  AND length(trim(split_part(address, ',', 2))) BETWEEN 2 AND 60
  AND trim(split_part(address, ',', 2)) ~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]'
  AND lower(trim(split_part(address, ',', 2))) NOT IN (
    'buenos aires', 'bsas', 'bs as', 'bs. as.', 'argentina', 'ar',
    'caba', 'capital federal', 'ciudad autonoma de buenos aires',
    'ciudad autónoma de buenos aires'
  );
