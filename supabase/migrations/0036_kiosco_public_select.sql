-- Open SELECT on kiosco_products + kiosco_bolsas to anonymous traffic.
--
-- The kiosco frontend is a public catalog (no login required) — Dan
-- confirmed today after reporting "dice 0 productos" while the table
-- has 61 rows. Cause: the only RLS policy on both tables was
-- 'kiosco_*_admin_all' with cmd=ALL and a using-expr that requires
-- the auth user to have role admin/general. Anon traffic (no
-- auth.uid) and any other logged-in role got an empty result silently.
--
-- The admin_all policy stays untouched, so INSERT/UPDATE/DELETE still
-- require admin/general. We're only widening SELECT.

CREATE POLICY kiosco_products_select_public
  ON kiosco_products
  FOR SELECT
  USING (true);

CREATE POLICY kiosco_bolsas_select_public
  ON kiosco_bolsas
  FOR SELECT
  USING (true);
