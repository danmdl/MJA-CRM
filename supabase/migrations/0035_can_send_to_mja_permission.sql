-- Permission for the 'Enviar a MJA' action in the Semillero.
--
-- This action used to ride on can_assign_contacts, which conflated
-- two different capabilities:
--   - can_assign_contacts → "I decide which cell a contact joins"
--   - can_send_to_mja      → "I tell MJA Central this contact isn't mine"
-- A Líder de Célula (encargado_de_celula) has can_assign_contacts=false
-- but still needs to be able to hand off contacts to the church-cuerda.
--
-- Defaults below mirror the existing pattern: roles that actively work
-- the Semillero (admin/general/pastor/supervisor/referente/gestor/
-- encargado_de_celula/consolidador) get true; conector and anfitrion
-- stay false (they don't reassign contacts).
--
-- Existing rows for the permissions table will pick up the column default
-- on add, then the explicit UPDATEs below set per-role values.

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS can_send_to_mja BOOLEAN NOT NULL DEFAULT true;

UPDATE permissions SET can_send_to_mja = true  WHERE role IN ('admin', 'general', 'pastor', 'supervisor', 'referente', 'gestor_de_cuerda', 'encargado_de_celula', 'consolidador');
UPDATE permissions SET can_send_to_mja = false WHERE role IN ('conector', 'anfitrion');
