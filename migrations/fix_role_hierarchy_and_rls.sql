-- ============================================================
-- Migration: fix_role_hierarchy_and_rls
-- Fixes:
--   1. Pastors can read their own church from churches table
--   2. Contacts/cells/teams filtered by church_id via RLS
--   3. Role hierarchy: lower roles cannot modify higher roles
-- ============================================================

-- 1. Enable RLS on churches table (if not already)
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;

-- Drop existing church select policies to recreate cleanly
DROP POLICY IF EXISTS "Allow admins to select churches" ON public.churches;
DROP POLICY IF EXISTS "Allow all authenticated to select churches" ON public.churches;
DROP POLICY IF EXISTS "churches_select_policy" ON public.churches;
DROP POLICY IF EXISTS "allow_read_churches" ON public.churches;

-- Admins and generals can see ALL churches
CREATE POLICY "admin_general_see_all_churches"
  ON public.churches FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
  );

-- Pastors and church roles can only see their own church
CREATE POLICY "church_roles_see_own_church"
  ON public.churches FOR SELECT
  USING (
    (SELECT church_id FROM public.profiles WHERE id = auth.uid()) = id
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('pastor', 'referente', 'encargado_de_celula')
  );

-- 2. Enable RLS on contacts (if not already) and filter by church
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
DROP POLICY IF EXISTS "allow_read_contacts" ON public.contacts;
DROP POLICY IF EXISTS "All authenticated users can view contacts" ON public.contacts;

-- Admins and generals can see all contacts
CREATE POLICY "admin_general_see_all_contacts"
  ON public.contacts FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
  );

-- Church roles can only see contacts from their own church
CREATE POLICY "church_roles_see_own_contacts"
  ON public.contacts FOR SELECT
  USING (
    church_id = (SELECT church_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('pastor', 'referente', 'encargado_de_celula')
  );

-- INSERT: church roles can add contacts to their own church
DROP POLICY IF EXISTS "contacts_insert_policy" ON public.contacts;
CREATE POLICY "church_roles_insert_contacts"
  ON public.contacts FOR INSERT
  WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general', 'pastor', 'referente')
    AND (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
      OR church_id = (SELECT church_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- UPDATE/DELETE: church roles can only modify contacts in their own church
DROP POLICY IF EXISTS "contacts_update_policy" ON public.contacts;
CREATE POLICY "church_roles_update_contacts"
  ON public.contacts FOR UPDATE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
    OR (
      church_id = (SELECT church_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('pastor', 'referente')
    )
  );

DROP POLICY IF EXISTS "contacts_delete_policy" ON public.contacts;
CREATE POLICY "church_roles_delete_contacts"
  ON public.contacts FOR DELETE
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
    OR (
      church_id = (SELECT church_id FROM public.profiles WHERE id = auth.uid())
      AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('pastor', 'referente')
    )
  );

-- 3. Enable RLS on cells and filter by church
ALTER TABLE public.cells ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cells_select_policy" ON public.cells;
DROP POLICY IF EXISTS "allow_read_cells" ON public.cells;

CREATE POLICY "admin_general_see_all_cells"
  ON public.cells FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('admin', 'general')
  );

CREATE POLICY "church_roles_see_own_cells"
  ON public.cells FOR SELECT
  USING (
    church_id = (SELECT church_id FROM public.profiles WHERE id = auth.uid())
    AND (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('pastor', 'referente', 'encargado_de_celula')
  );

-- 4. Fix permissions table: reset to correct hierarchy
-- Admin: everything
-- General: everything except permissions management (handled in app)
-- Pastor: only see/manage their own church
-- No one below pastor can change roles

UPDATE public.permissions SET
  see_all_churches = TRUE,
  access_all_churches = TRUE,
  add_users = TRUE,
  edit_delete_users = TRUE,
  see_all_analytics = TRUE,
  see_own_church_analytics = TRUE,
  change_user_role = TRUE
WHERE role = 'admin';

UPDATE public.permissions SET
  see_all_churches = TRUE,
  access_all_churches = TRUE,
  add_users = TRUE,
  edit_delete_users = TRUE,
  see_all_analytics = TRUE,
  see_own_church_analytics = TRUE,
  change_user_role = FALSE
WHERE role = 'general';

UPDATE public.permissions SET
  see_all_churches = FALSE,
  access_all_churches = FALSE,
  add_users = TRUE,
  edit_delete_users = TRUE,
  see_all_analytics = TRUE,
  see_own_church_analytics = TRUE,
  change_user_role = FALSE
WHERE role = 'pastor';

UPDATE public.permissions SET
  see_all_churches = FALSE,
  access_all_churches = FALSE,
  add_users = FALSE,
  edit_delete_users = FALSE,
  see_all_analytics = FALSE,
  see_own_church_analytics = TRUE,
  change_user_role = FALSE
WHERE role IN ('referente', 'encargado_de_celula');

UPDATE public.permissions SET
  see_all_churches = FALSE,
  access_all_churches = FALSE,
  add_users = FALSE,
  edit_delete_users = FALSE,
  see_all_analytics = FALSE,
  see_own_church_analytics = FALSE,
  change_user_role = FALSE
WHERE role = 'user';
