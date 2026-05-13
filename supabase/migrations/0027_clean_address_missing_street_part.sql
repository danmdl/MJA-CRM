-- Clean addresses that have no street part — only ", Barrio" style junk.
--
-- After the CSV punctuation-stripper landed (migration 0024), values
-- like "." became NULL. But rows with ". , Villa Maipu" or ", Caseros"
-- still passed through: there's *some* letter in the string, so the
-- letters-or-digits guard accepted them. They render in the UI as
-- ", Villa Maipu" which is meaningless and bothered Dan.
--
-- The street part (everything before the first comma) is what makes an
-- address an address. If that part is empty / punctuation only, the
-- value isn't a real address — it's a barrio that got smuggled in.
-- The barrio column was back-filled separately (migration 0025) so
-- no information is lost by NULLing the address here.

UPDATE contacts
SET address = NULL
WHERE deleted_at IS NULL
  AND address IS NOT NULL
  AND position(',' IN address) > 0
  AND trim(split_part(address, ',', 1)) !~ '[A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]';
