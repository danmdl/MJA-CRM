-- This file should be run directly in your Supabase SQL Editor
-- It will update the permissions to allow pastors and referentes to change user roles

-- First, let's see the current permissions
SELECT * FROM public.permissions WHERE role IN ('admin', 'general', 'pastor', 'referente');

-- Now update the permissions
UPDATE public.permissions 
SET change_user_role = TRUE 
WHERE role IN ('pastor', 'referente');

-- Verify the update
SELECT * FROM public.permissions WHERE role IN ('admin', 'general', 'pastor', 'referente');