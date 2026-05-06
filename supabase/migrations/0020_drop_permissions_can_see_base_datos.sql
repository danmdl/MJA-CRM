-- Drop the can_see_base_datos column from the permissions table.
--
-- The 'Datos Globales' solapa was retired in commit 7e00882 and the
-- corresponding canSeeBaseDatos() helper, interface field, and dashboard row
-- went with it. The DB column was left in place as an intermediate step but
-- a follow-up sweep confirmed nothing references it anymore — no RLS
-- policies, no functions, no views, no frontend code. Removing it now to
-- avoid stale schema baggage.

ALTER TABLE permissions DROP COLUMN IF EXISTS can_see_base_datos;
