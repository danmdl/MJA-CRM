-- Drop the duplicate-phone trigger.
--
-- Background: the trigger raised an exception on insert/update when a
-- non-deleted contact in the same church already had the same normalized
-- phone (≥8 digits). It was rejecting CSV imports outright — Micaela lost
-- ~34 rows on her last upload because of this — and CRM-side flows were
-- catching the 'duplicate_phone:' message to surface a user-friendly
-- error.
--
-- New stance: never reject an import. Same phone showing up twice is OK
-- (kids using a parent's number, families sharing a landline, etc.) and
-- gets shown as an info-level note in the Validador. Real duplicates are
-- people with the same first_name+last_name in the same church — those
-- are surfaced as a 'dup' badge in the Semillero and as a warning in the
-- Validador's 'Posibles duplicados' check.
--
-- Frontend in the same change:
--   - CsvImporter, AddContactDialog, ContactProfileDialog: dropped the
--     duplicate_phone special-case error handlers.
--   - ValidatorPage: 'contacts_duplicate_phone' downgraded to severity
--     'info', new 'contacts_duplicate_name' check at severity 'warning'.
--   - SemilleroPage: name cell renders a 'dup' badge when the contact's
--     normalized full name matches another contact in the same church.

DROP TRIGGER IF EXISTS check_duplicate_contact_phone_trigger ON contacts;
DROP FUNCTION IF EXISTS check_duplicate_contact_phone();
